import type {
  ProjectProfileFields,
  WizardObligation,
} from "./faith.service";

/**
 * 專案建置的分段解析定義（純邏輯，無 I/O，便於單元測試）。
 *
 * 為什麼要分段：單次要求模型同時吐出基本資料、履約事項、責任分工與工程分項時，
 * 輸出長度容易觸及上限而被截斷，導致後段欄位整批遺失。改為每段一次呼叫、
 * 各自帶較小的 responseSchema，單段失敗也不影響其他段已取得的資料。
 */

export type WizardStepId = "profile" | "scope" | "obligations";

/**
 * 解析階段。
 *
 * 分成這幾段的理由不只是輸出長度，更是「每段只做一件事」：
 *  - 合約標的是照抄，不需推理；
 *  - 履約事項是從標的推導期限。
 *
 * 建置階段刻意止於「履約事項的名稱、階段、期限」——
 * 一次要決定的事情越多，使用者越無法核對。責任分工、觸發方式、試運轉、
 * 契約依據、工程分項各有自己的判斷（誰負責、由什麼事件起算、
 * 數量與單價多少），都留到專案成立後於履約事項細節頁與估驗台帳處理。
 *
 * 先前這些都塞在建置流程裡，代價是多花模型呼叫產出一批待核對的欄位，
 * 而使用者在還沒有專案的當下根本無從判斷對錯。
 */
export const WIZARD_STEPS: {
  id: WizardStepId;
  label: string;
  /** 進行中顯示的描述。 */
  running: string;
  /** 依賴的前置步驟。 */
  dependsOn?: WizardStepId;
}[] = [
  {
    id: "profile",
    label: "專案基本資料",
    running: "擷取專案編號、名稱、業主、工期與預算…",
  },
  {
    id: "scope",
    label: "契約履約標的",
    running: "逐條讀出契約「履約標的」所列的工作…",
  },
  {
    id: "obligations",
    label: "履約事項",
    running: "由履約標的推導應辦事項與期限…",
    dependsOn: "scope",
  },
];

export const STEP_ORDER: WizardStepId[] = WIZARD_STEPS.map((s) => s.id);

export type StepState = "pending" | "running" | "done" | "failed" | "skipped";

export type StepProgress = {
  id: WizardStepId;
  state: StepState;
  /** 該段取得的項目數（基本資料為已填欄位數）。 */
  count?: number;
  /** 基本資料的欄位總數，用於 9/11 這類顯示。 */
  total?: number;
  /** 失敗原因。 */
  error?: string;
};

/** 初始狀態：全部待處理。 */
export function initialProgress(): StepProgress[] {
  return STEP_ORDER.map((id) => ({ id, state: "pending" }));
}

/** 以事件更新某一段的狀態，回傳新陣列（不改動輸入）。 */
export function applyProgress(
  progress: StepProgress[],
  update: StepProgress,
): StepProgress[] {
  const found = progress.some((p) => p.id === update.id);
  if (!found) return [...progress, update];
  return progress.map((p) => (p.id === update.id ? { ...p, ...update } : p));
}

export function stepLabel(id: WizardStepId): string {
  return WIZARD_STEPS.find((s) => s.id === id)?.label ?? id;
}

/** 一句話的進度描述，供費思對話中回報。 */
export function describeStep(p: StepProgress): string {
  const label = stepLabel(p.id);
  switch (p.state) {
    case "running": {
      const meta = WIZARD_STEPS.find((s) => s.id === p.id);
      return `正在解析${label}：${meta?.running ?? ""}`;
    }
    case "done": {
      if (p.total != null) return `${label}完成（${p.count ?? 0}/${p.total} 欄）`;
      return `${label}完成（${p.count ?? 0} 項）`;
    }
    case "failed":
      return `${label}解析失敗：${p.error ?? "原因不明"}`;
    case "skipped":
      return `${label}略過（缺少前置資料）`;
    default:
      return `${label}待處理`;
  }
}

/** 全部段落是否都已結束（不論成敗）。 */
export function isSettled(progress: StepProgress[]): boolean {
  return progress.every(
    (p) => p.state === "done" || p.state === "failed" || p.state === "skipped",
  );
}

export function failedSteps(progress: StepProgress[]): WizardStepId[] {
  return progress.filter((p) => p.state === "failed").map((p) => p.id);
}

// ── 合併規則 ────────────────────────────────────────────────

/**
 * 合併基本資料：不覆蓋使用者已填的非空值。
 * 使用者的確認優先於模型的判讀，這是精靈的核心前提。
 */
export function mergeFields(
  current: ProjectProfileFields,
  incoming: ProjectProfileFields | undefined,
): ProjectProfileFields {
  if (!incoming) return current;
  const out: ProjectProfileFields = { ...current };
  for (const [k, v] of Object.entries(incoming)) {
    if (v == null || v === "") continue;
    const key = k as keyof ProjectProfileFields;
    if ((out[key] ?? "") === "") {
      (out as Record<string, unknown>)[k] = v;
    }
  }
  return out;
}

/** 已填欄位數／總欄位數，用於進度顯示。 */
export function countFilled(
  fields: ProjectProfileFields,
  keys: readonly string[],
): number {
  return keys.filter((k) => {
    const v = (fields as Record<string, unknown>)[k];
    return v != null && v !== "";
  }).length;
}

/**
 * 合併履約事項：以名稱（title）為鍵去重後附加。
 * 重複送出或重試同一段時不會灌爆清單。
 */
export function mergeObligations(
  current: WizardObligation[],
  incoming: WizardObligation[] | undefined,
): WizardObligation[] {
  if (!incoming?.length) return current;
  const seen = new Set(current.map((o) => o.title.trim()));
  const added = incoming.filter((o) => {
    const t = o.title?.trim();
    return Boolean(t) && !seen.has(t);
  });
  return [...current, ...added];
}

/**
 * 履約事項那一段的進度說明。
 *
 * 會特別點出「讀到幾項履約標的」，因為這一段的正確性完全取決於
 * 有沒有真的讀到契約的履約標的條。若模型沒抄出履約標的就直接生出應辦事項，
 * 那些事項很可能是憑常識編的，使用者必須看得出這件事。
 */
export function scopeNote(
  scopeCount: number,
  obligationCount: number,
  reply: string | undefined,
): string {
  const tail = reply?.trim() ? ` ${reply.trim()}` : "";

  if (scopeCount === 0) {
    return obligationCount > 0
      ? `未能從契約讀出「履約標的」條，以下 ${obligationCount} 項應辦事項請逐項核對契約。${tail}`
      : `未能從契約讀出「履約標的」條，因此沒有可推導的應辦事項。${tail}`;
  }

  const head = `讀出履約標的 ${scopeCount} 項工作`;
  if (obligationCount === 0) {
    return `${head}，但其中沒有訂明期限的事項。${tail}`;
  }
  if (obligationCount < scopeCount) {
    return `${head}，推導出 ${obligationCount} 項應辦事項（少於履約標的項數，可能仍有未訂期限或漏讀的工作）。${tail}`;
  }
  return `${head}，推導出 ${obligationCount} 項應辦事項。${tail}`;
}
