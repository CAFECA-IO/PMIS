import * as faith from "@/service/faith.service";
import type {
  FaithAttachment,
  FaithMessage,
  ProjectProfileFields,
  WizardObligation,
  WizardWorkItem,
} from "@/service/faith.service";
import {
  STEP_ORDER,
  applyOwnerPatches,
  countFilled,
  countWithOwner,
  mergeFields,
  mergeObligations,
  mergeWorkItems,
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
    }
  | { type: "done"; failed: WizardStepId[] };

export type WizardDraft = {
  fields: ProjectProfileFields;
  obligations: WizardObligation[];
  workItems: WizardWorkItem[];
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
  return [
    {
      role: "user",
      text: `目前已確認的草稿（JSON，請沿用並僅補齊缺漏，勿覆蓋既有值）：\n${JSON.stringify(known)}`,
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
  const steps = opts.only?.length
    ? STEP_ORDER.filter((s) => opts.only!.includes(s))
    : STEP_ORDER;

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

  for (const step of steps) {
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

      if (step === "obligations") {
        const r = await faith.extractObligations(input);
        draft.obligations = mergeObligations(draft.obligations, r.data);
        yield { type: "data", step, obligations: draft.obligations };
        yield {
          type: "status",
          step,
          state: "done",
          count: draft.obligations.length,
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

      if (step === "workItems") {
        const r = await faith.extractWorkItems(input, titles);
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
