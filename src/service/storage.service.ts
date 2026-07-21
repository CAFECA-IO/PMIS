import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

/**
 * Local file storage service. All file reads/writes go through here so the
 * rest of the app never touches the filesystem directly. Swap the
 * implementation (e.g. S3) without changing callers.
 */
const STORAGE_DIR =
  process.env.STORAGE_DIR ?? path.join(process.cwd(), "storage", "uploads");

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
