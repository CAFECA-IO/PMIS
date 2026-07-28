/**
 * 上傳／下載的判定規則（純函式，無 I/O，便於單元測試）。
 *
 * 這裡集中三件事，因為它們都是安全性相關、不該散落在各路由：
 *  1. 副檔名解析：由 MIME 決定，MIME 不可靠時退回原始檔名，最後才給 bin。
 *  2. 檔名淨化：回傳給瀏覽器的檔名不得含路徑或控制字元。
 *  3. 內嵌與下載的分界：只有明確安全的型別可 inline，其餘一律強制下載。
 */

/** 伺服器端的上傳大小上限（前端的 25MB 限制不可信任）。 */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/**
 * 歸檔允許的 MIME → 副檔名。
 * 比手動上傳（storage.ALLOWED_MIME_TYPES）寬，因為費思本來就收這些格式；
 * 但仍是白名單，未列入者走檔名推導並以 bin 收尾。
 */
const EXT_BY_MIME: Record<string, string> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "text/plain": "txt",
  "text/markdown": "md",
  "text/csv": "csv",
  "application/json": "json",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-excel.sheet.macroEnabled.12": "xlsm",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation":
    "pptx",
};

/** 允許由檔名推導的副檔名（避免 exe、sh、html 等經由檔名混入）。 */
const EXT_FROM_NAME = new Set(Object.values(EXT_BY_MIME));

/**
 * 可安全內嵌於瀏覽器檢視的型別。
 * 刻意排除 SVG 與 HTML —— 兩者內嵌時會執行腳本，
 * 等同把儲存區變成同源 XSS 的載體，因此一律走下載。
 */
const INLINE_SAFE = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "text/plain",
]);

/** 取原始檔名的副檔名（小寫、不含點）。 */
export function extOfName(fileName: string | undefined | null): string | null {
  if (!fileName) return null;
  const base = fileName.split(/[\\/]/).pop() ?? "";
  const i = base.lastIndexOf(".");
  if (i <= 0 || i === base.length - 1) return null;
  const ext = base.slice(i + 1).toLowerCase();
  return /^[a-z0-9]{1,8}$/.test(ext) ? ext : null;
}

/**
 * 決定儲存用的副檔名。MIME 優先；MIME 缺失或非白名單時，
 * 才採用原始檔名的副檔名（且該副檔名須在白名單內）；都不成立則為 bin。
 */
export function resolveExt(mimeType: string, fileName?: string | null): string {
  const byMime = EXT_BY_MIME[mimeType];
  if (byMime) return byMime;
  const byName = extOfName(fileName);
  if (byName && EXT_FROM_NAME.has(byName)) return byName;
  return "bin";
}

/** 是否為歸檔白名單內的 MIME（僅供提示，非硬性阻擋）。 */
export function isKnownMime(mimeType: string): boolean {
  return mimeType in EXT_BY_MIME;
}

/**
 * 淨化回傳給瀏覽器的檔名：去除路徑、控制字元與引號，並限制長度。
 * 空字串時給一個可辨識的預設名。
 */
export function safeFileName(
  fileName: string | undefined | null,
  fallbackExt = "bin",
): string {
  const base = (fileName ?? "").split(/[\\/]/).pop() ?? "";
  // 控制字元會破壞 Content-Disposition 標頭；引號與反斜線會提早結束 filename 參數
  const cleaned = base.replace(/[\u0000-\u001f\u007f"\\]/g, "").trim();
  if (!cleaned) return `attachment.${fallbackExt}`;
  return cleaned.length > 120 ? cleaned.slice(0, 120) : cleaned;
}

/**
 * Content-Disposition 的處置方式。
 * download 為 true（使用者按下載）時一律 attachment；
 * 否則僅在明確安全的型別才 inline。
 */
export function dispositionFor(
  mimeType: string,
  download: boolean,
): "inline" | "attachment" {
  if (download) return "attachment";
  return INLINE_SAFE.has(mimeType) ? "inline" : "attachment";
}

/**
 * 實際回應的 Content-Type。
 * 不可內嵌的型別改以 octet-stream 送出，避免瀏覽器自行嗅探後渲染。
 */
export function responseContentType(
  mimeType: string,
  disposition: "inline" | "attachment",
): string {
  if (disposition === "inline" && INLINE_SAFE.has(mimeType)) return mimeType;
  return "application/octet-stream";
}

/** 超出上限則回傳錯誤訊息，否則 null。 */
export function checkSize(size: number): string | null {
  if (size <= 0) return "檔案內容為空。";
  if (size > MAX_UPLOAD_BYTES) {
    const mb = Math.round(MAX_UPLOAD_BYTES / 1024 / 1024);
    return `檔案超過 ${mb}MB 上限。`;
  }
  return null;
}

/** 附帶訊息只保留前段，避免整段對話寫進資料庫。 */
export function truncatePrompt(text: string | undefined | null): string | null {
  const t = text?.trim();
  if (!t) return null;
  return t.length > 500 ? `${t.slice(0, 500)}…` : t;
}
