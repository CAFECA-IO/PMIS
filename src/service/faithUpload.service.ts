import * as uploadRepo from "@/repository/faithUpload.repository";
import * as memberRepo from "@/repository/projectMember.repository";
import * as storage from "@/service/storage.service";
import { canReadFile, type FileViewer } from "./file-access";
import { limitUploadIds, normalizeUploadIds } from "./upload-assign";
import {
  checkSize,
  resolveExt,
  safeFileName,
  truncatePrompt,
} from "./upload-policy";
import type { AccountRole } from "@/generated/prisma/enums";

/**
 * 費思對話附件的歸檔。
 *
 * 呼叫時機：任何接收附件的 AI 路由，在把位元組交給模型「之前」先歸檔，
 * 這樣即使模型判讀失敗，檔案仍留存 —— 使用者已經上傳了，不該因 AI 出錯而遺失。
 * 歸檔失敗不應中斷 AI 流程，故回傳 null 由呼叫端決定如何提示。
 */

export type Archiver = {
  id: string;
  name?: string | null;
  role: AccountRole;
};

export type ArchiveInput = {
  /** 原始檔名。 */
  fileName?: string | null;
  mimeType?: string | null;
  /** 純 base64（不含 data URL 前綴）。 */
  data: string;
  /** 目前鎖定的專案；未鎖定時傳 undefined，歸為「未指派」。 */
  projectId?: string | null;
  taskId?: string | null;
  taskTitle?: string | null;
  /** 上傳時附帶的使用者訊息。 */
  prompt?: string | null;
};

export type ArchiveResult =
  | { ok: true; id: string; fileName: string; size: number }
  | { ok: false; error: string };

/**
 * 將 base64 附件寫入儲存區並建立歸檔紀錄。
 * projectId 會先驗證存取權：非成員且無全案權限時，降級為「未指派」而非直接失敗，
 * 避免使用者把檔案寫進看不到的專案。
 */
export async function archive(
  input: ArchiveInput,
  actor: Archiver,
): Promise<ArchiveResult> {
  if (!input.data) return { ok: false, error: "沒有可歸檔的檔案內容。" };

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(Buffer.from(input.data, "base64"));
  } catch {
    return { ok: false, error: "檔案內容無法解碼。" };
  }

  const sizeError = checkSize(bytes.byteLength);
  if (sizeError) return { ok: false, error: sizeError };

  const mimeType = input.mimeType || "application/octet-stream";
  const ext = resolveExt(mimeType, input.fileName);
  const fileName = safeFileName(input.fileName, ext);

  const projectId = await resolveProjectId(input.projectId, actor);

  const saved = await storage.saveBytes(bytes, fileName, mimeType, ext);
  if (!saved) return { ok: false, error: "檔案寫入失敗。" };

  const row = await uploadRepo.create({
    projectId,
    fileName: saved.fileName,
    storedName: saved.storedName,
    mimeType: saved.mimeType,
    size: saved.size,
    taskId: input.taskId ?? null,
    taskTitle: input.taskTitle ?? null,
    prompt: truncatePrompt(input.prompt),
    uploadedById: actor.id,
    uploadedBy: actor.name ?? null,
  });

  return { ok: true, id: row.id, fileName: saved.fileName, size: saved.size };
}

/** 無權存取指定專案時降級為未指派，不讓檔案落到使用者看不到的地方。 */
async function resolveProjectId(
  projectId: string | null | undefined,
  actor: Archiver,
): Promise<string | null> {
  if (!projectId) return null;
  if (actor.role === "ADMIN" || actor.role === "MANAGER") return projectId;
  const isMember = Boolean(await memberRepo.exists(projectId, actor.id));
  return isMember ? projectId : null;
}

/** 取檔（含權限判定）。回傳 null 代表不存在，false 代表無權。 */
export async function getFile(
  id: string,
  viewer: { id: string; role: AccountRole } | null,
): Promise<
  | { ok: true; buffer: Buffer; mimeType: string; fileName: string }
  | { ok: false; reason: "not-found" | "forbidden" }
> {
  const row = await uploadRepo.findForServe(id);
  if (!row) return { ok: false, reason: "not-found" };

  if (!(await allowed(viewer, row))) {
    return { ok: false, reason: "forbidden" };
  }

  const buffer = await storage.read(row.storedName);
  if (!buffer) return { ok: false, reason: "not-found" };

  return {
    ok: true,
    buffer,
    mimeType: row.mimeType,
    fileName: row.fileName,
  };
}

async function allowed(
  viewer: { id: string; role: AccountRole } | null,
  file: { projectId: string | null; uploadedById: string | null },
): Promise<boolean> {
  if (!viewer) return false;
  const fileViewer: FileViewer = {
    id: viewer.id,
    role: viewer.role,
    // 只需判斷該檔案所屬專案，不必撈全部成員關係
    memberProjectIds:
      file.projectId &&
      Boolean(await memberRepo.exists(file.projectId, viewer.id))
        ? [file.projectId]
        : [],
  };
  return canReadFile(fileViewer, file);
}

export function listAll() {
  return uploadRepo.listAll();
}

/**
 * 列出使用者尚未指派專案的上傳檔案。
 * 供「專案建立後是否一併歸入」的提示使用；時間與來源任務讓使用者自行判斷相關性。
 */
export function listUnassigned(uploaderId: string) {
  return uploadRepo.listUnassignedByUploader(uploaderId);
}

/**
 * 把建置過程上傳的檔案歸入新建立的專案。
 *
 * 僅處理「未指派且為本人上傳」者（條件由倉儲的 where 把關），
 * 因此即使呼叫端傳入他人或已歸屬的 id 也不會生效。
 * 回傳實際歸屬筆數。
 */
export async function assignToProject(
  ids: (string | null | undefined)[] | null | undefined,
  projectId: string,
  uploaderId: string,
): Promise<number> {
  const { ids: safeIds } = limitUploadIds(normalizeUploadIds(ids));
  if (safeIds.length === 0) return 0;
  return uploadRepo.assignManyToProject(safeIds, projectId, uploaderId);
}
