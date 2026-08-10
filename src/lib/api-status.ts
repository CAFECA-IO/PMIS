/**
 * Info: (20260810 - Luphia) API 回應狀態碼。與 iSunFA
 * `src/lib/utils/status.ts` 同一套契約，讓兩個專案的前端可以共用解析邏輯。
 *
 * `ApiCode` 是對外的語意碼（字串，寫進回應的 `code`），HTTP 數字狀態一律
 * 由 `HTTP_MAP` 推導 —— 路由不得自己寫 `{ status: 400 }`。
 */
export enum ApiCode {
  // Info: (20260810 - Luphia) --- 成功 ---
  SUCCESS = "SUCCESS",

  // Info: (20260810 - Luphia) --- 客戶端錯誤 ---
  VALIDATION_ERROR = "VALIDATION_ERROR", // Info: (20260810 - Luphia) 400: 請求參數驗證失敗
  UNAUTHORIZED = "UNAUTHORIZED", // Info: (20260810 - Luphia) 401: 未經身份驗證
  PAYMENT_REQUIRED = "PAYMENT_REQUIRED", // Info: (20260810 - Luphia) 402: 額度或點數不足
  FORBIDDEN = "FORBIDDEN", // Info: (20260810 - Luphia) 403: 權限不足
  NOT_FOUND = "NOT_FOUND", // Info: (20260810 - Luphia) 404: 資源不存在
  CONFLICT = "CONFLICT", // Info: (20260810 - Luphia) 409: 資源衝突（例如同期已有定稿）
  UNSUPPORTED_MEDIA_TYPE = "UNSUPPORTED_MEDIA_TYPE", // Info: (20260810 - Luphia) 415: 上傳的檔案格式無法處理
  RATE_LIMIT = "RATE_LIMIT", // Info: (20260810 - Luphia) 429: 請求過於頻繁
  CLIENT_CLOSED_REQUEST = "CLIENT_CLOSED_REQUEST", // Info: (20260810 - Luphia) 499: 客戶端於伺服器回應前中止連線；非伺服器故障，不應計入 5xx

  // Info: (20260810 - Luphia) --- 伺服器端錯誤 ---
  INTERNAL_SERVER_ERROR = "INTERNAL_SERVER_ERROR", // Info: (20260810 - Luphia) 500: 未知的伺服器錯誤
}

/**
 * Info: (20260810 - Luphia) `ApiCode` → HTTP 狀態碼的**唯一**對照來源。
 *
 * 刻意宣告為 `Record<ApiCode, number>` 而非 switch：少一個成員就編譯失敗，
 * 新增 `ApiCode` 時不可能忘記補對照。iSunFA 曾因維護兩套對照而讓
 * 409／429 實際回 500（known_issues/api_http_status_dual_mapping.md），
 * 此處不重蹈。
 */
export const HTTP_MAP: Record<ApiCode, number> = {
  [ApiCode.SUCCESS]: 200,
  [ApiCode.VALIDATION_ERROR]: 400,
  [ApiCode.UNAUTHORIZED]: 401,
  [ApiCode.PAYMENT_REQUIRED]: 402,
  [ApiCode.FORBIDDEN]: 403,
  [ApiCode.NOT_FOUND]: 404,
  [ApiCode.CONFLICT]: 409,
  [ApiCode.UNSUPPORTED_MEDIA_TYPE]: 415,
  [ApiCode.RATE_LIMIT]: 429,
  [ApiCode.CLIENT_CLOSED_REQUEST]: 499,
  [ApiCode.INTERNAL_SERVER_ERROR]: 500,
};
