/**
 * 費思對外的例外分類（純邏輯，無 I/O，便於單元測試）。
 *
 * 為什麼要收斂 ——
 * 模型與 API 的原始錯誤訊息會直接被路由回傳、顯示在對話裡，
 * 內容包含 HTTP 狀態碼、Gemini 的英文錯誤字串、schema 欄位名，
 * 甚至可能夾帶金鑰或提示詞片段。這些對使用者沒有意義，
 * 對系統則是不必要的內部細節外流。
 *
 * 一律收斂為兩種對外語意：
 *  - busy   費思忙線中：暫時性，稍後重試很可能就會成功。
 *  - failed 費思處理異常：非暫時性，重試通常無用，需要人介入。
 *
 * 原始訊息不丟棄 —— 寫進互動紀錄（storage/faith），除錯時查得到。
 */

export type FaithErrorKind = "busy" | "failed";

export const BUSY_MESSAGE = "費思忙線中，請稍候再試。";
export const FAILED_MESSAGE = "費思處理異常，請稍後再試。";

/**
 * 對外的費思例外。
 *
 * message 一律是可直接顯示給使用者的句子；
 * detail 是原始錯誤，只供紀錄與除錯，不應顯示於介面。
 */
export class FaithError extends Error {
  readonly kind: FaithErrorKind;
  /** 給使用者的補充建議（如「請縮減文件範圍」）。可為 undefined。 */
  readonly hint?: string;
  /** 原始錯誤訊息，僅供紀錄。 */
  readonly detail?: string;

  constructor(
    kind: FaithErrorKind,
    options: { hint?: string; detail?: string } = {},
  ) {
    const base = kind === "busy" ? BUSY_MESSAGE : FAILED_MESSAGE;
    super(options.hint ? `${base}${options.hint}` : base);
    this.name = "FaithError";
    this.kind = kind;
    this.hint = options.hint;
    this.detail = options.detail;
  }
}

/** 依 HTTP 狀態判斷是暫時性忙線還是真正的異常。 */
export function classifyStatus(status: number): FaithErrorKind {
  // 429 額度／速率限制，5xx 伺服器端問題 —— 都屬暫時性，重試有意義
  if (status === 429) return "busy";
  if (status >= 500) return "busy";
  // 4xx 多為請求本身有問題（金鑰、權限、schema），重試不會變好
  return "failed";
}

/**
 * 這些字樣代表暫時不可用，即使狀態碼不是 429／5xx。
 *
 * 含 Node 的網路錯誤代碼：連線層的失敗一律當忙線 ——
 * 使用者能做的也只有稍後再試，說成「處理異常」會讓他以為是資料有問題。
 * 注意 ETIMEDOUT 不含「timeout」子字串，必須各自列出。
 */
const BUSY_HINTS = [
  "overloaded",
  "unavailable",
  "rate limit",
  "ratelimit",
  "quota",
  "resource_exhausted",
  "resource exhausted",
  "try again later",
  "deadline",
  "timeout",
  "timed out",
  // 網路層
  "fetch failed",
  "econnrefused",
  "econnreset",
  "etimedout",
  "enotfound",
  "eai_again",
  "socket hang up",
  "network",
];

/** 由錯誤文字判斷是否為暫時性忙線。 */
export function looksBusy(text: string | undefined | null): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  return BUSY_HINTS.some((h) => lower.includes(h));
}

/**
 * 網路層錯誤（fetch 直接拋出）視為忙線。
 *
 * 連不上通常是暫時的，且使用者能做的也只有稍後再試；
 * 顯示「處理異常」會誤導他以為是資料有問題。
 */
export function classifyNetworkError(): FaithErrorKind {
  return "busy";
}

/**
 * 把任何錯誤正規化為 FaithError。
 *
 * 已經是 FaithError 的原樣回傳（保留分類與建議）；
 * 其餘一律歸為處理異常，原始訊息移入 detail 供紀錄。
 */
export function toFaithError(error: unknown): FaithError {
  if (error instanceof FaithError) return error;
  const detail =
    error instanceof Error ? error.message : String(error ?? "未知錯誤");
  // 少數第三方錯誤會在訊息中帶出暫時性字樣，據以判斷比一律歸為異常準確
  return new FaithError(looksBusy(detail) ? "busy" : "failed", { detail });
}

/** 便利建構：處理異常，可附建議。 */
export function failed(hint?: string, detail?: string): FaithError {
  return new FaithError("failed", { hint, detail });
}

/** 便利建構：忙線中，可附建議。 */
export function busy(hint?: string, detail?: string): FaithError {
  return new FaithError("busy", { hint, detail });
}
