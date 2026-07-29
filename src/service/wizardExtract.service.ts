import * as faith from "@/service/faith.service";
import type {
  FaithAttachment,
  FaithMessage,
  ProjectProfileFields,
  WizardObligation,
  WizardScopeItem,
  WizardWorkItem,
  WizardWorkPackage,
} from "@/service/faith.service";
import {
  hasPriorRun,
  requiresScope,
  resolveScope,
  skipReason,
} from "./wizard-source";
import {
  applyOwnerPatches,
  countFilled,
  countWithOwner,
  mergeFields,
  mergeObligations,
  mergeWorkItems,
  scopeNote,
  type WizardStepId,
} from "./wizard-steps";

/**
 * 專案建置的分段解析編排。
 *
 * 以 async generator 逐段產出事件，讓路由能邊解析邊回報，
 * 使用者不必等到全部結束才看到結果。
 *
 * 關鍵性質：每段各自 try/catch。單段失敗只記錄該段，
 * 其他段已取得的資料完整保留 —— 這是分段的主要目的。
 */

export const PROFILE_FIELD_KEYS = [
  "code",
  "name",
  "location",
  "client",
  "contractor",
  "supervisor",
  "budget",
  "startDate",
  "endDate",
  "status",
  "description",
] as const;

export type WizardEvent =
  | { type: "status"; step: WizardStepId; state: "running" }
  | {
      type: "status";
      step: WizardStepId;
      state: "done";
      count: number;
      total?: number;
      /** 該段模型的一句話說明。 */
      note?: string;
    }
  | { type: "status"; step: WizardStepId; state: "failed"; error: string }
  | { type: "status"; step: WizardStepId; state: "skipped"; reason: string }
  /** 該段取得的資料，供前端即時併入表單。 */
  | {
      type: "data";
      step: WizardStepId;
      fields?: ProjectProfileFields;
      obligations?: WizardObligation[];
      workItems?: WizardWorkItem[];
      /** 契約履約標的清單（階段一）。 */
      scopeItems?: WizardScopeItem[];
      /** 工程項目（階段二的規劃結果）。 */
      packages?: WizardWorkPackage[];
    }
  | { type: "done"; failed: WizardStepId[] };

export type WizardDraft = {
  fields: ProjectProfileFields;
  obligations: WizardObligation[];
  workItems: WizardWorkItem[];
  /** 階段一讀出的契約履約標的。 */
  scopeItems?: WizardScopeItem[];
  /** 階段二規劃的工程項目；分群資訊，非獨立層級。 */
  packages?: WizardWorkPackage[];
};

export type ExtractOptions = {
  messages: FaithMessage[];
  documentText?: string;
  attachment?: FaithAttachment;
  /** 已確認的草稿，作為模型脈絡並避免覆蓋使用者的值。 */
  known?: Partial<WizardDraft>;
  /** 僅執行指定段落（重試單段用）；未給則全跑。 */
  only?: WizardStepId[];
};

/** 把已知草稿放在對話最前面當脈絡。 */
function withKnownContext(
  messages: FaithMessage[],
  known: Partial<WizardDraft> | undefined,
): FaithMessage[] {
  const hasKnown =
    known &&
    (Object.keys(known.fields ?? {}).length > 0 ||
      (known.obligations?.length ?? 0) > 0 ||
      (known.workItems?.length ?? 0) > 0);
  if (!hasKnown) return messages;
  // scopeItems 是解析過程的來源清單，不是使用者確認的草稿內容；
  // 它會以專屬的「履約標的清單」段落傳給第四段，不放進這裡以免語意混淆
  const draft = {
    fields: known.fields,
    obligations: known.obligations,
    workItems: known.workItems,
  };
  return [
    {
      role: "user",
      text: `目前已確認的草稿（JSON，請沿用並僅補齊缺漏，勿覆蓋既有值）：\n${JSON.stringify(draft)}`,
    },
    ...messages,
  ];
}

const errText = (e: unknown) =>
  e instanceof Error ? e.message : "解析時發生未預期錯誤";

/**
 * 依序執行四段解析並產出事件。
 * 呼叫端負責把 data 事件併入草稿；本函式內部也維護一份，
 * 以便後兩段能取得履約事項名稱清單。
 */
export async function* runExtraction(
  opts: ExtractOptions,
): AsyncGenerator<WizardEvent> {
  const doc = {
    hasAttachment: Boolean(opts.attachment),
    hasArchivedText: Boolean(opts.documentText?.trim()),
  };

  /*
    段落範圍改為每次送出計算，而非在任務啟動時就固定。
    先前 only 被閉包鎖在 startTask 那一刻，於是使用者在對話中補一個專案編號，
    四段全部重跑；又因為那次請求不帶檔案，依賴契約的三段只能憑常識編造。
  */
  const steps = resolveScope({
    only: opts.only,
    hasAttachment: doc.hasAttachment,
    hasPriorRun: hasPriorRun(opts.known ?? {}),
  });

  const input = {
    messages: withKnownContext(opts.messages, opts.known),
    documentText: opts.documentText,
    attachment: opts.attachment,
  };

  // 以已知草稿為起點，重試單段時才能沿用其他段的成果
  const draft: WizardDraft = {
    fields: { ...(opts.known?.fields ?? {}) },
    obligations: [...(opts.known?.obligations ?? [])],
    workItems: [...(opts.known?.workItems ?? [])],
  };
  const failed: WizardStepId[] = [];

  // 第二段抄出的履約標的，供第四段的工程分項沿用同一份來源。
  // 單獨重試第四段時第二段不會執行，此時沿用前次傳回的清單。
  let scopeItems: WizardScopeItem[] = [...(opts.known?.scopeItems ?? [])];
  // 階段二的規劃結果，供階段三細分；單獨重試階段三時沿用前次結果
  let packages: WizardWorkPackage[] = [...(opts.known?.packages ?? [])];

  for (const step of steps) {
    /*
      最後一道防線：沒有契約可讀就不要硬跑。
      紀錄 2026-07-28 顯示，缺文件時模型會依「委託專業服務契約」的常識
      自行編出一份履約標的（污水下水道契約被判成資訊系統開發案），
      而那些虛構項目會被 mergeObligations 併進草稿。
      寧可明確略過並告知如何補救。
    */
    const blocked = skipReason(step, doc);
    if (blocked) {
      yield { type: "status", step, state: "skipped", reason: blocked };
      continue;
    }

    yield { type: "status", step, state: "running" };

    try {
      if (step === "profile") {
        const r = await faith.extractProjectFields(input);
        draft.fields = mergeFields(draft.fields, r.data);
        yield { type: "data", step, fields: r.data };
        yield {
          type: "status",
          step,
          state: "done",
          count: countFilled(draft.fields, PROFILE_FIELD_KEYS),
          total: PROFILE_FIELD_KEYS.length,
          note: r.reply,
        };
        continue;
      }

      // 階段一：照抄契約履約標的。後續所有結構都以此為據。
      if (step === "scope") {
        const r = await faith.extractScopeItems(input);
        scopeItems = r.data;
        draft.scopeItems = scopeItems;
        yield { type: "data", step, scopeItems };
        yield {
          type: "status",
          step,
          state: "done",
          count: scopeItems.length,
          note: r.reply,
        };
        continue;
      }

      // 沒有履約標的就沒有推導依據；硬跑只會讓模型憑常識編造
      if (requiresScope(step) && scopeItems.length === 0) {
        yield {
          type: "status",
          step,
          state: "skipped",
          reason: "尚未讀出契約履約標的，無可推導的依據",
        };
        continue;
      }

      if (step === "obligations") {
        const r = await faith.extractObligations(input, scopeItems);
        draft.obligations = mergeObligations(draft.obligations, r.data);
        yield { type: "data", step, obligations: draft.obligations };
        yield {
          type: "status",
          step,
          state: "done",
          count: draft.obligations.length,
          total: scopeItems.length,
          note: scopeNote(scopeItems.length, draft.obligations.length, r.reply),
        };
        continue;
      }

      // 階段二：由契約內文與履約標的規劃具體工程項目
      if (step === "packages") {
        const r = await faith.planWorkPackages(input, scopeItems);
        packages = r.data;
        draft.packages = packages;
        yield { type: "data", step, packages };
        yield {
          type: "status",
          step,
          state: "done",
          count: packages.length,
          note: r.reply,
        };
        continue;
      }

      // 後兩段需要履約事項名稱作為對應鍵
      const titles = draft.obligations
        .map((o) => o.title.trim())
        .filter(Boolean);

      if (step === "owners") {
        if (titles.length === 0) {
          yield {
            type: "status",
            step,
            state: "skipped",
            reason: "尚無履約事項可回填責任分工",
          };
          continue;
        }
        const r = await faith.extractObligationOwners(input, titles);
        draft.obligations = applyOwnerPatches(draft.obligations, r.data);
        yield { type: "data", step, obligations: draft.obligations };
        yield {
          type: "status",
          step,
          state: "done",
          count: countWithOwner(draft.obligations),
          total: draft.obligations.length,
          note: r.reply,
        };
        continue;
      }

      // 階段三：把工程項目細分為可排程的工程分項
      if (step === "workItems") {
        if (packages.length === 0) {
          yield {
            type: "status",
            step,
            state: "skipped",
            reason: "尚無工程項目可細分",
          };
          continue;
        }
        const r = await faith.extractWorkItems(input, titles, packages);
        draft.workItems = mergeWorkItems(draft.workItems, r.data, titles);
        // 補齊分項編號與起訖日（確定性推導，不猜測名稱）
        draft.workItems = faith.finalizeWorkItems(
          draft.fields,
          draft.obligations,
          draft.workItems,
        );
        yield { type: "data", step, workItems: draft.workItems };
        yield {
          type: "status",
          step,
          state: "done",
          count: draft.workItems.length,
          note: r.reply,
        };
      }
    } catch (e) {
      // 單段失敗不影響其他段已取得的資料
      failed.push(step);
      yield { type: "status", step, state: "failed", error: errText(e) };
    }
  }

  yield { type: "done", failed };
}
