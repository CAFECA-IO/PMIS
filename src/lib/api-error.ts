import { ApiCode } from "@/lib/api-status";

/**
 * Info: (20260810 - Luphia) 錯誤定義。與 iSunFA
 * `src/lib/utils/error_dictionary.ts` 同一套契約。
 *
 * `code` 是給程式判斷的穩定識別碼（前端可據此分流，且不隨文案調整而變動），
 * `message` 是給人看的文案，`status` 決定 HTTP 狀態（經 `HTTP_MAP`）。
 */
export interface IErrorDef {
  code: string;
  message: string;
  status: ApiCode;
}

/**
 * Info: (20260810 - Luphia) 可攜帶語意碼的錯誤。服務層丟出這個，
 * 路由就能不必逐一判斷例外型別，直接把 `code`／`status` 轉成回應。
 */
export class ApiError extends Error {
  public code: string;
  public status: ApiCode;

  constructor(
    code: string,
    message: string,
    status: ApiCode = ApiCode.INTERNAL_SERVER_ERROR,
  ) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

/**
 * Info: (20260810 - Luphia) 錯誤字典。所有對外錯誤都必須在此登錄，
 * 路由不得就地拼裝 `IErrorDef` —— 就地拼裝等於沒有穩定的 `code`，
 * 前端只能比對中文字串，文案一改就壞。
 *
 * `code` 前綴對應錯誤類別，與 `ApiCode` 一致：
 *   AU=401 未驗證　FO=403 權限　VA=400 參數　NF=404 不存在
 *   CF=409 衝突　　RL=429 限流　CC=499 客戶端中止　IN=500 伺服器
 *
 * 刻意不沿用 iSunFA 現有的 12 種前綴（VA 與 VL、IN 與 IS 語意重疊），
 * 新專案從一致的前綴開始，一個 `ApiCode` 對一個前綴。
 */
export const API_ERRORS = {
  // Info: (20260810 - Luphia) --- 401 未驗證 ---
  AU_NOT_SIGNED_IN: {
    code: "AU000001",
    message: "未登入",
    status: ApiCode.UNAUTHORIZED,
  } as IErrorDef,

  // Info: (20260810 - Luphia) --- 403 權限 ---
  FO_MODULE_FORBIDDEN: {
    code: "FO000001",
    message: "無權存取工程日誌",
    status: ApiCode.FORBIDDEN,
  } as IErrorDef,
  FO_PROJECT_INACCESSIBLE: {
    code: "FO000002",
    message: "無法存取此專案或專案不存在",
    status: ApiCode.FORBIDDEN,
  } as IErrorDef,

  // Info: (20260810 - Luphia) --- 400 參數 ---
  VA_MISSING_PROJECT: {
    code: "VA000001",
    message: "缺少專案",
    status: ApiCode.VALIDATION_ERROR,
  } as IErrorDef,
  VA_INVALID_REPORT_TYPE: {
    code: "VA000002",
    message: "報表週期不正確。",
    status: ApiCode.VALIDATION_ERROR,
  } as IErrorDef,
  VA_INVALID_REF_DATE: {
    code: "VA000003",
    message: "基準日不正確，請確認年份。",
    status: ApiCode.VALIDATION_ERROR,
  } as IErrorDef,

  // Info: (20260810 - Luphia) --- 500 伺服器 ---
  IN_UNKNOWN: {
    code: "IN000001",
    message: "系統忙線中，請稍後再試。",
    status: ApiCode.INTERNAL_SERVER_ERROR,
  } as IErrorDef,
} as const;

/**
 * Info: (20260810 - Luphia) 把任意例外轉成錯誤定義。
 *
 * `ApiError` 保留其語意碼與訊息；其餘一律收斂為 `IN_UNKNOWN`，
 * 但沿用呼叫端已整理過的訊息（例如 `toFaithError` 的可讀說明），
 * 以免把有用的提示換成罐頭文案。
 */
export function errorDefOf(error: unknown, fallbackMessage?: string): IErrorDef {
  if (error instanceof ApiError) {
    return { code: error.code, message: error.message, status: error.status };
  }
  return {
    ...API_ERRORS.IN_UNKNOWN,
    message: fallbackMessage ?? API_ERRORS.IN_UNKNOWN.message,
  };
}
