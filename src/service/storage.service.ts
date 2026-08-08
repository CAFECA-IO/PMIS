import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import {
  HEIF_EXTENSIONS,
  hasHeifExtension,
  isHeifMime,
  normalizeImage,
} from "./image-normalize";

/**
 * Local file storage service. All file reads/writes go through here so the
 * rest of the app never touches the filesystem directly. Swap the
 * implementation (e.g. S3) without changing callers.
 */
/*
 * turbopackIgnore：process.cwd() 會讓 Turbopack 把整個專案納入輸出追蹤
 * （build 時的 "Encountered unexpected file in NFT list"）。加上此註解後，
 * 本檔案已不再出現於該追蹤鏈；build 仍有一則同類警告，來源在別處
 * （gis.service 以 readFileSync 讀取執行期組出的路徑），尚待處理。
 * 此路徑僅於執行期使用，無需靜態追蹤。
 */
const STORAGE_DIR =
  process.env.STORAGE_DIR ??
  path.join(/* turbopackIgnore: true */ process.cwd(), "storage", "uploads");

const ALLOWED_EXT: Record<string, string> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
};

export const ALLOWED_MIME_TYPES = Object.keys(ALLOWED_EXT);

/**
 * 檔案選擇器的 accept 字串。
 *
 * 含 .heic／.heif —— 手機拍攝的照片為 HEIC，saveFile 會在存檔前
 * 轉為 JPEG（見 image-normalize），故此處必須放行，否則使用者
 * 在選檔階段就無法選取。
 */
export const ALLOWED_ACCEPT = `.pdf,.png,.jpg,.jpeg,${HEIF_EXTENSIONS.map(
  (e) => `.${e}`,
).join(",")}`;

export type SavedFile = {
  fileName: string;
  storedName: string;
  mimeType: string;
  size: number;
};

/**
 * 這個 MIME 的檔案是否可能被 saveFile 接受。
 *
 * 用於上傳前的早期拒收，語意是「值得往下送」而非「保證存檔成功」——
 * HEIC 要等實際讀取位元組、轉檔後才知道成不成，故此處放行、由
 * saveFile 回傳 null 表示最終拒收。
 *
 * fileName 為選填：瀏覽器對 .heic 回報的 MIME 不一致（空字串或
 * application/octet-stream 都出現過），有檔名時可補判，避免手機
 * 照片在此處就被誤擋。
 */
export function isAllowed(mimeType: string, fileName?: string) {
  if (mimeType in ALLOWED_EXT) return true;
  return isHeifMime(mimeType) || hasHeifExtension(fileName);
}

/**
 * 直接以位元組寫入儲存區，供 JSON／base64 來源使用（費思對話的附件）。
 *
 * 與 saveFile 的差異：saveFile 服務手動上傳元件，沿用上面較窄的
 * ALLOWED_EXT（pdf/png/jpg）；此函式的副檔名由 upload-policy.resolveExt
 * 決定（較寬，涵蓋 Office 與純文字），因為費思本來就接受這些格式。
 * 呼叫端負責先做大小檢查（upload-policy.checkSize）。
 */
export async function saveBytes(
  bytes: Uint8Array,
  fileName: string,
  mimeType: string,
  ext: string,
): Promise<SavedFile | null> {
  if (bytes.byteLength === 0) return null;

  await mkdir(STORAGE_DIR, { recursive: true });
  const storedName = `${Date.now()}-${randomUUID()}.${ext}`;
  await writeFile(path.join(STORAGE_DIR, storedName), bytes);

  return {
    fileName,
    storedName,
    mimeType: mimeType || "application/octet-stream",
    size: bytes.byteLength,
  };
}

/**
 * 服務手動上傳元件。HEIC／HEIF 會先轉為 JPEG 再存檔。
 *
 * 轉檔置於此處而非各呼叫端：approval／ehs／documents 三處都呼叫本函式，
 * 在此統一處理可讓三者無須改動，也避免日後新增上傳點時漏做。
 * 存入的一律是白名單內的格式，因此下游（預覽、AI 判讀）不必再認識 HEIC。
 */
export async function saveFile(file: File): Promise<SavedFile | null> {
  if (file.size === 0) return null;

  const raw = new Uint8Array(await file.arrayBuffer());
  const normalized = await normalizeImage(raw, file.type, file.name);
  if (!normalized.ok) return null;

  // 轉檔後才查白名單：HEIC 於此時已成 image/jpeg
  const ext = ALLOWED_EXT[normalized.mimeType];
  if (!ext) return null;

  await mkdir(STORAGE_DIR, { recursive: true });
  const storedName = `${Date.now()}-${randomUUID()}.${ext}`;
  await writeFile(path.join(STORAGE_DIR, storedName), normalized.bytes);

  return {
    fileName: normalized.fileName,
    storedName,
    mimeType: normalized.mimeType,
    size: normalized.bytes.byteLength,
  };
}

export async function read(storedName: string): Promise<Buffer | null> {
  const safe = path.basename(storedName); // guard against path traversal
  try {
    return await readFile(path.join(STORAGE_DIR, safe));
  } catch {
    return null;
  }
}
