import {
  STEP_ORDER,
  stepLabel,
  type StepProgress,
  type StepState,
  type WizardStepId,
} from "./wizard-steps";
import { verdictOf, type StepVerdict } from "./wizard-summary";

/**
 * 解析結果的檢視與匯入（純函式，無 I/O，便於單元測試）。
 *
 * 為什麼要有這一層 ——
 * 先前解析中每收到一段資料就直接寫進使用者眼前的表單。那個作法有兩個問題：
 *  1. 使用者無從分辨哪個值是自己填的、哪個是模型填的；
 *  2. 更沒有辦法拒絕 —— 模型讀錯的項目已經在表單裡，只能事後逐項刪掉。
 *
 * 改為：解析只收集「提議」，全部跑完後列出來讓使用者勾選要匯入哪些，
 * 或針對某一段重新解析。匯入才是唯一會改動表單的時刻。
 *
 * 覆蓋是允許的，但一定要標示。使用者明確勾選了某一項，就該尊重他的選擇；
 * 但若那會蓋掉他自己填過的值，得先讓他看見。
 */

/** 提議的專案基本資料（欄位皆為字串）。 */
export type ProposedFields = Record<string, string | number | undefined>;

/** 提議的履約事項。與 faith.service 的 WizardObligation 同形，但不依賴它。 */
export type ProposedObligation = {
  code?: string;
  title: string;
  stage?: string;
  risk?: string;
  triggerType?: string;
  dueDate?: string;
  ownerUnit?: string;
  ownerName?: string;
  contractBasis?: string;
  weight?: number;
  commissioning?: boolean;
  scopeRef?: string;
};

/** 提議的契約履約標的。 */
export type ProposedScopeItem = {
  code?: string;
  title: string;
  sourceClause?: string;
};

/** 解析過程收集到的所有提議。 */
export type Proposal = {
  fields?: ProposedFields;
  obligations?: ProposedObligation[];
  scopeItems?: ProposedScopeItem[];
};

/** 表單目前的內容，用於判斷匯入會不會蓋掉既有值。 */
export type CurrentForm = {
  fields: ProposedFields;
  /** 目前表單上的履約事項名稱（比對用）。 */
  obligationTitles: string[];
};

/** 一列可勾選的內容。 */
export type ReviewItem = {
  /** 穩定鍵；勾選狀態以此記錄。 */
  key: string;
  label: string;
  /** 補充說明（如契約依據、階段、期限）。 */
  detail?: string;
  /**
   * 匯入會覆蓋的現有值；null 代表新增或只是填空。
   * 有值時畫面須標示，否則使用者會在不知情下失去自己填的內容。
   */
  overwrites?: string | null;
};

export type ReviewSection = {
  id: WizardStepId;
  label: string;
  state: StepState;
  verdict: StepVerdict;
  /** 模型對該段的一句話說明。 */
  note?: string;
  /** 失敗或略過的原因。 */
  error?: string;
  items: ReviewItem[];
  /** 有內容可匯入。 */
  importable: boolean;
  /** 可重新解析（失敗、略過或未取得內容者最需要）。 */
  retryable: boolean;
};

/** 專案基本資料的欄位標籤。與建置表單同一份定義由呼叫端提供。 */
export type FieldLabels = { key: string; label: string }[];

const text = (v: unknown): string => {
  if (v === null || v === undefined) return "";
  return String(v).trim();
};

/** 組出可檢視的區段。順序固定為解析順序。 */
export function buildReview(input: {
  progress: StepProgress[];
  proposal: Proposal;
  current: CurrentForm;
  notes?: Partial<Record<WizardStepId, string>>;
  fieldLabels: FieldLabels;
}): ReviewSection[] {
  const byId = new Map(input.progress.map((p) => [p.id, p]));

  return STEP_ORDER.map((id) => {
    const p = byId.get(id) ?? { id, state: "pending" as StepState };
    const verdict = verdictOf(p);
    const items = itemsOf(id, input);
    return {
      id,
      label: stepLabel(id),
      state: p.state,
      verdict,
      note: input.notes?.[id],
      error: p.error,
      items,
      importable: items.length > 0,
      /*
        可重試的條件刻意寬鬆：只要這一段跑過且結果不完整就給重試。
        失敗與略過當然要能重試；「跑完但沒取得內容」同樣需要 ——
        那往往是文件某一節沒讀到，重跑一次就有了。
      */
      retryable: p.state !== "pending" && p.state !== "running",
    };
  });
}

function itemsOf(
  id: WizardStepId,
  input: {
    proposal: Proposal;
    current: CurrentForm;
    fieldLabels: FieldLabels;
  },
): ReviewItem[] {
  const { proposal, current, fieldLabels } = input;

  if (id === "profile") {
    const fields = proposal.fields ?? {};
    const out: ReviewItem[] = [];
    for (const { key, label } of fieldLabels) {
      const value = text(fields[key]);
      if (!value) continue;
      const existing = text(current.fields[key]);
      out.push({
        key: `profile:${key}`,
        label,
        detail: value,
        overwrites: existing && existing !== value ? existing : null,
      });
    }
    return out;
  }

  if (id === "scope") {
    return (proposal.scopeItems ?? [])
      .filter((s) => text(s.title))
      .map((s, i) => ({
        key: `scope:${i}`,
        label: text(s.title),
        detail: [text(s.code), text(s.sourceClause)].filter(Boolean).join("　"),
        overwrites: null,
      }));
  }

  // obligations
  const existing = new Set(current.obligationTitles.map((t) => t.trim()));
  return (proposal.obligations ?? [])
    .filter((o) => text(o.title))
    .map((o) => {
      const title = text(o.title);
      return {
        key: `obligations:${title}`,
        label: title,
        /*
          細節行以契約依據為主：勾選時真正要核對的是
          「這項管制出自哪一條」，而不是它被歸在哪個階段。
        */
        detail: [text(o.contractBasis), text(o.code), text(o.dueDate)]
          .filter(Boolean)
          .join("　"),
        // 同名事項已在表單上：匯入會補齊它的欄位而非新增一列
        overwrites: existing.has(title) ? "表單已有同名事項，將補齊其欄位" : null,
      };
    });
}

// ── 勾選狀態 ────────────────────────────────────────────────

/**
 * 預設全選。
 *
 * 使用者按下「AI 協助建置」就是要這些內容；預設不選會讓常見情況變成
 * 「逐項勾 28 次才能匯入」。要挑剔的人展開後取消即可。
 */
export function defaultSelection(sections: ReviewSection[]): Set<string> {
  const out = new Set<string>();
  for (const s of sections) for (const i of s.items) out.add(i.key);
  return out;
}

/**
 * 實際生效的勾選。
 *
 * 「預設全選」與「使用者的取捨」會在重新解析某一段時打起來：那一段的項目
 * 整批換新，舊的勾選鍵已經不存在，若直接沿用既有集合，重新解析回來的內容
 * 會全部沒被勾 —— 使用者按「重新解析此段」正是想要新結果，卻得再勾一次。
 *
 * 故以「使用者動過哪幾段」為界：動過的段落尊重他存下來的集合，
 * 沒動過的（含剛重新解析完的）一律全選。
 */
export function effectiveSelection(
  sections: ReviewSection[],
  touched: Set<WizardStepId>,
  stored: Set<string>,
): Set<string> {
  const out = new Set<string>();
  for (const s of sections) {
    for (const i of s.items) {
      if (touched.has(s.id) ? stored.has(i.key) : true) out.add(i.key);
    }
  }
  return out;
}

export function toggleItem(selected: Set<string>, key: string): Set<string> {
  const next = new Set(selected);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}

/** 整段全選或全不選。 */
export function toggleSection(
  selected: Set<string>,
  section: ReviewSection,
): Set<string> {
  const next = new Set(selected);
  const keys = section.items.map((i) => i.key);
  const allOn = keys.length > 0 && keys.every((k) => next.has(k));
  for (const k of keys) {
    if (allOn) next.delete(k);
    else next.add(k);
  }
  return next;
}

export type SectionCheck = "none" | "some" | "all";

export function sectionCheck(
  selected: Set<string>,
  section: ReviewSection,
): SectionCheck {
  const keys = section.items.map((i) => i.key);
  if (keys.length === 0) return "none";
  const on = keys.filter((k) => selected.has(k)).length;
  if (on === 0) return "none";
  return on === keys.length ? "all" : "some";
}

/** 勾選的總數（footer 的「匯入勾選(n)」）。 */
export function countSelected(
  selected: Set<string>,
  sections: ReviewSection[],
): number {
  let n = 0;
  for (const s of sections) for (const i of s.items) if (selected.has(i.key)) n += 1;
  return n;
}

/** 會被覆蓋的項目數，供匯入前的提醒。 */
export function countOverwrites(
  selected: Set<string>,
  sections: ReviewSection[],
): number {
  let n = 0;
  for (const s of sections) {
    for (const i of s.items) {
      if (selected.has(i.key) && i.overwrites) n += 1;
    }
  }
  return n;
}

// ── 匯入 ────────────────────────────────────────────────────

export type ImportResult = {
  /** 要寫入表單的基本資料欄位（只含勾選者）。 */
  fields: ProposedFields;
  /** 要新增的履約事項。 */
  newObligations: ProposedObligation[];
  /**
   * 要補齊既有事項的欄位（以名稱對應）。
   * 同名事項不新增一列，改為補它的空欄位。
   */
  patches: {
    title: string;
    dueDate?: string;
    code?: string;
    stage?: string;
    contractBasis?: string;
  }[];
  /** 匯入的履約標的（供建立專案時溯源）。 */
  scopeItems: ProposedScopeItem[];
};

/**
 * 依勾選算出要匯入什麼。
 *
 * 不直接改動表單狀態 —— 回傳「要做什麼」，由呼叫端套用。
 * 這樣合併規則能被測試釘住，而不是散在 setState 的回呼裡。
 */
export function applyImport(input: {
  sections: ReviewSection[];
  selected: Set<string>;
  proposal: Proposal;
  current: CurrentForm;
}): ImportResult {
  const { selected, proposal, current } = input;
  const existing = new Set(current.obligationTitles.map((t) => t.trim()));

  const fields: ProposedFields = {};
  for (const [key, value] of Object.entries(proposal.fields ?? {})) {
    if (!selected.has(`profile:${key}`)) continue;
    const v = text(value);
    if (v) fields[key] = v;
  }

  const scopeItems = (proposal.scopeItems ?? []).filter((_, i) =>
    selected.has(`scope:${i}`),
  );

  const newObligations: ProposedObligation[] = [];
  const patches: ImportResult["patches"] = [];

  for (const o of proposal.obligations ?? []) {
    const title = text(o.title);
    if (!title) continue;
    if (!selected.has(`obligations:${title}`)) continue;

    if (!existing.has(title)) {
      newObligations.push(o);
      continue;
    }

    // 既有事項：只補它的空欄位，不新增重複的一列
    const patch: ImportResult["patches"][number] = { title };
    if (text(o.dueDate)) patch.dueDate = text(o.dueDate);
    if (text(o.code)) patch.code = text(o.code);
    if (text(o.stage)) patch.stage = text(o.stage);
    if (text(o.contractBasis)) patch.contractBasis = text(o.contractBasis);
    // 只有 title 的空補丁沒有意義
    if (Object.keys(patch).length > 1) patches.push(patch);
  }

  return { fields, newObligations, patches, scopeItems };
}

/** 匯入後的一句話回報。 */
export function importSummary(result: ImportResult): string {
  const parts: string[] = [];
  const fieldCount = Object.keys(result.fields).length;
  if (fieldCount > 0) parts.push(`基本資料 ${fieldCount} 個欄位`);
  if (result.newObligations.length > 0) {
    parts.push(`新增履約事項 ${result.newObligations.length} 項`);
  }
  if (result.patches.length > 0) parts.push(`補齊 ${result.patches.length} 項事項的欄位`);
  if (result.scopeItems.length > 0) {
    parts.push(`合約標的 ${result.scopeItems.length} 項`);
  }
  return parts.length > 0 ? `已匯入${parts.join("、")}。` : "沒有勾選任何內容。";
}

/** 解析進度的百分比（供覆蓋在表單上的進度條）。 */
export function progressPercent(progress: StepProgress[]): number {
  if (progress.length === 0) return 0;
  const settled = progress.filter(
    (p) => p.state === "done" || p.state === "failed" || p.state === "skipped",
  ).length;
  return Math.round((settled / progress.length) * 100);
}

/** 目前正在跑哪一段（供覆蓋層顯示）。 */
export function runningStep(progress: StepProgress[]): StepProgress | null {
  return progress.find((p) => p.state === "running") ?? null;
}
