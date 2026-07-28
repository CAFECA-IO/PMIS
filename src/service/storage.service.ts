import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

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
export const ALLOWED_ACCEPT = ".pdf,.png,.jpg,.jpeg";

export type SavedFile = {
  fileName: string;
  storedName: string;
  mimeType: string;
  size: number;
};

export function isAllowed(mimeType: string) {
  return mimeType in ALLOWED_EXT;
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

export async function saveFile(file: File): Promise<SavedFile | null> {
  const ext = ALLOWED_EXT[file.type];
  if (!ext || file.size === 0) return null;

  const buffer = Buffer.from(await file.arrayBuffer());
  await mkdir(STORAGE_DIR, { recursive: true });
  const storedName = `${Date.now()}-${randomUUID()}.${ext}`;
  await writeFile(path.join(STORAGE_DIR, storedName), buffer);

  return {
    fileName: file.name,
    storedName,
    mimeType: file.type,
    size: buffer.length,
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
