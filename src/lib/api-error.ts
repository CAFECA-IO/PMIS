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
  FO_FILE_FORBIDDEN: {
    code: "FO000003",
    message: "無權存取此檔案",
    status: ApiCode.FORBIDDEN,
  } as IErrorDef,
  FO_NO_EDIT_PERMISSION: {
    code: "FO000004",
    message: "權限不足",
    status: ApiCode.FORBIDDEN,
  } as IErrorDef,
  /** Info: (20260810 - Luphia) 訊息由 fileManager.canWriteInto 提供，以 withMessage 覆寫。 */
  FO_UPLOAD_NOT_ALLOWED: {
    code: "FO000005",
    message: "無法上傳至此位置。",
    status: ApiCode.FORBIDDEN,
  } as IErrorDef,
  FO_GIS_PROJECT_INACCESSIBLE: {
    code: "FO000006",
    message: "無權限或查無專案",
    status: ApiCode.FORBIDDEN,
  } as IErrorDef,

  // Info: (20260810 - Luphia) --- 404 不存在 ---
  NF_FILE_NOT_FOUND: {
    code: "NF000001",
    message: "找不到檔案",
    status: ApiCode.NOT_FOUND,
  } as IErrorDef,
  NF_LAYER_VECTOR_NOT_FOUND: {
    code: "NF000002",
    message: "查無圖層向量資料",
    status: ApiCode.NOT_FOUND,
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
  VA_BAD_JSON: {
    code: "VA000004",
    message: "請求格式錯誤",
    status: ApiCode.VALIDATION_ERROR,
  } as IErrorDef,
  VA_MISSING_INSTRUCTION: {
    code: "VA000005",
    message: "請描述您想要的預警規則。",
    status: ApiCode.VALIDATION_ERROR,
  } as IErrorDef,
  VA_MISSING_IMAGE: {
    code: "VA000006",
    message: "缺少影像內容",
    status: ApiCode.VALIDATION_ERROR,
  } as IErrorDef,
  VA_MISSING_FILE_CONTENT: {
    code: "VA000007",
    message: "缺少檔案內容",
    status: ApiCode.VALIDATION_ERROR,
  } as IErrorDef,
  VA_BAD_RATING: {
    code: "VA000008",
    message: "rating 必須為 up 或 down",
    status: ApiCode.VALIDATION_ERROR,
  } as IErrorDef,
  VA_UNKNOWN_FORM: {
    code: "VA000009",
    message: "未知的表單",
    status: ApiCode.VALIDATION_ERROR,
  } as IErrorDef,
  VA_VIRTUAL_FOLDER: {
    code: "VA000010",
    message: "系統歸檔資料夾不可上傳。",
    status: ApiCode.VALIDATION_ERROR,
  } as IErrorDef,
  VA_NO_FILES: {
    code: "VA000011",
    message: "沒有檔案",
    status: ApiCode.VALIDATION_ERROR,
  } as IErrorDef,
  VA_NO_PROJECT_LOCKED: {
    code: "VA000012",
    message: "尚未鎖定專案，請先於左上角選擇目前專案。",
    status: ApiCode.VALIDATION_ERROR,
  } as IErrorDef,

  // Info: (20260810 - Luphia) --- 415 檔案格式 ---
  /** Info: (20260810 - Luphia) 訊息含檔名，以 withMessage 覆寫。 */
  UM_UNSUPPORTED_FILE: {
    code: "UM000001",
    message:
      "不支援的檔案格式。可上傳 PDF、圖片、Word (.docx)、Excel (.xlsx)、PowerPoint (.pptx) 或純文字檔。",
    status: ApiCode.UNSUPPORTED_MEDIA_TYPE,
  } as IErrorDef,

  // Info: (20260810 - Luphia) --- 500 伺服器 ---
  IN_UNKNOWN: {
    code: "IN000001",
    message: "系統忙線中，請稍後再試。",
    status: ApiCode.INTERNAL_SERVER_ERROR,
  } as IErrorDef,
  /** Info: (20260810 - Luphia) 訊息含具體缺陷，以 withMessage 覆寫。 */
  IN_BAD_FORM_SPEC: {
    code: "IN000002",
    message: "表單規格有誤。",
    status: ApiCode.INTERNAL_SERVER_ERROR,
  } as IErrorDef,
} as const;

/**
 * Info: (20260810 - Luphia) 沿用字典項的 `code` 與 `status`，只換訊息。
 *
 * 有些訊息本質上是動態的（含檔名、含後端回報的具體原因），但那不該成為
 * 就地拼裝 `IErrorDef` 的理由 —— 就地拼裝等於沒有穩定的 `code`，
 * 前端只能比對文案。此處讓「碼固定、訊息浮動」成為一個明確的動作。
 */
export function withMessage(def: IErrorDef, message: string): IErrorDef {
  return { ...def, message };
}

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
