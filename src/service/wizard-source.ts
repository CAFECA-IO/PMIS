import { STEP_ORDER, type WizardStepId } from "./wizard-steps";

/**
 * 解析來源與段落範圍的判定（純函式，無 I/O，便於單元測試）。
 *
 * 為什麼需要這一層 ——
 * 契約全文只存在於「上傳那一次」的請求裡。使用者之後在對話中補一個專案編號，
 * 或按下某段的「重試」，請求都不帶附件。先前這種情況下四段照跑，
 * 沒有契約可讀的模型就依「委託專業服務契約」的常識自行編造履約標的
 * （紀錄 2026-07-28：污水下水道契約被判讀成資訊系統開發案，
 * 出現「需求規格書編製」「UI/UX 設計」等虛構項目，且會被併進草稿）。
 *
 * 兩道防線：
 *  1. resolveScope：後續送出預設只重跑基本資料，不動兩段昂貴的契約解析。
 *  2. requiresDocument / skipReason：真的沒有契約可讀時，該段一律略過並說明原因，
 *     而不是讓模型憑空生成。
 */

/** 依賴契約全文的段落。少了文件，這三段只能靠常識編造。 */
const DOCUMENT_DEPENDENT: WizardStepId[] = [
  "scope",
  "obligations",
  "owners",
  "packages",
  "workItems",
];

/** 此段是否必須有契約文件才能執行。 */
export function requiresDocument(step: WizardStepId): boolean {
  return DOCUMENT_DEPENDENT.includes(step);
}

/** 需要「契約履約標的」作為推導依據的段落。 */
const SCOPE_DEPENDENT: WizardStepId[] = ["obligations", "packages"];

/**
 * 此段是否必須先有履約標的。
 *
 * 沒有標的就沒有推導依據，硬跑只會讓模型憑常識編造 ——
 * 這正是階段化的重點：每一段都應該有明確的上游輸入。
 */
export function requiresScope(step: WizardStepId): boolean {
  return SCOPE_DEPENDENT.includes(step);
}

export type ScopeInput = {
  /** 呼叫端明確指定的段落（按下某段「重試」時帶入）。 */
  only?: WizardStepId[];
  /** 這次送出是否附了新檔案。 */
  hasAttachment: boolean;
  /** 先前是否已完成過一輪解析（草稿已有內容）。 */
  hasPriorRun: boolean;
};

/**
 * 決定本次要執行哪些段落。
 *
 * 規則的優先順序：
 *  1. 明確指定（重試單段）一律照辦 —— 使用者的意圖最清楚。
 *  2. 有新附件：跑完整四段。換一份文件本來就該全部重讀。
 *  3. 已解析過且只是打字補資料：只跑基本資料。
 *     使用者回覆「AB-0123」是在補專案編號，不是要求重新解讀契約；
 *     重跑兩段昂貴解析要多花約兩分鐘，且沒有文件可讀。
 *  4. 從未解析過且沒有附件：跑完整四段。
 *     此時使用者可能是純文字描述專案，該給他機會。
 */
export function resolveScope(input: ScopeInput): WizardStepId[] {
  if (input.only?.length) {
    // 過濾未知值並維持固定順序，避免呼叫端傳入亂序或錯字
    const wanted = new Set(input.only);
    return STEP_ORDER.filter((s) => wanted.has(s));
  }
  if (input.hasAttachment) return [...STEP_ORDER];
  if (input.hasPriorRun) return ["profile"];
  return [...STEP_ORDER];
}

/** 判斷草稿是否已有前一輪的成果。 */
export function hasPriorRun(known: {
  fields?: Record<string, unknown>;
  obligations?: unknown[];
  workItems?: unknown[];
  scopeItems?: unknown[];
}): boolean {
  const filled = Object.values(known.fields ?? {}).some(
    (v) => typeof v === "string" && v.trim() !== "",
  );
  return (
    filled ||
    (known.obligations?.length ?? 0) > 0 ||
    (known.workItems?.length ?? 0) > 0 ||
    (known.scopeItems?.length ?? 0) > 0
  );
}

export type DocumentAvailability = {
  /** 本次請求附帶的新檔案。 */
  hasAttachment: boolean;
  /** 由歸檔重新取得的契約文字。 */
  hasArchivedText: boolean;
};

/**
 * 缺少契約文件時該段的略過原因；可執行則回 null。
 *
 * 措辭要指出「怎麼補救」：使用者看到「略過」若不知道下一步，
 * 只會反覆按重試而得到同樣結果。
 */
export function skipReason(
  step: WizardStepId,
  doc: DocumentAvailability,
): string | null {
  if (!requiresDocument(step)) return null;
  if (doc.hasAttachment || doc.hasArchivedText) return null;
  return "缺少契約文件，無法判讀。請重新上傳契約後再執行，避免產生臆測內容。";
}

/** 供前端顯示的來源說明。 */
export function describeSource(doc: DocumentAvailability): string | null {
  if (doc.hasAttachment) return null;
  if (doc.hasArchivedText) return "沿用先前上傳的契約文件";
  return null;
}
