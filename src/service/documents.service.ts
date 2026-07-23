import * as mediaRepo from "@/repository/media.repository";
import * as ehsRepo from "@/repository/ehs.repository";
import * as approvalRepo from "@/repository/approvalDocument.repository";
import * as memberRepo from "@/repository/projectMember.repository";
import * as storage from "@/service/storage.service";
import { canSeeAllProjects } from "@/lib/auth";
import type { AccountRole, MediaType } from "@/generated/prisma/enums";

export type Actor = { id: string; role: AccountRole; name?: string };

async function canAccess(projectId: string, actor: Actor): Promise<boolean> {
  if (canSeeAllProjects(actor.role)) return true;
  return Boolean(await memberRepo.exists(projectId, actor.id));
}

export type UploadedFile = {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  createdAt: Date;
  source: string; // 來源模組
  context: string; // 關聯（專案/文件）
  url: string; // 檢視/下載連結
};

/**
 * 彙整系統各環節上傳的實體檔案（環安衛稽核附件、簽核文件附件…），
 * 讓「資料庫（PMIS-13）」成為所有上傳檔案的單一入口。
 * 新增其他會上傳檔案的模組時，於此加入其來源即可。
 */
async function getUploads(): Promise<UploadedFile[]> {
  const [ehs, approval] = await Promise.all([
    ehsRepo.listAllAttachments(),
    approvalRepo.listAllAttachments(),
  ]);

  const ehsFiles: UploadedFile[] = ehs.map((a) => ({
    id: a.id,
    fileName: a.fileName,
    mimeType: a.mimeType,
    size: a.size,
    createdAt: a.createdAt,
    source: "環安衛 (PMIS-05)",
    context: [a.audit.project?.name, a.audit.location ?? a.audit.type]
      .filter(Boolean)
      .join("｜"),
    url: `/api/ehs/file/${a.id}`,
  }));

  const approvalFiles: UploadedFile[] = approval.map((a) => ({
    id: a.id,
    fileName: a.fileName,
    mimeType: a.mimeType,
    size: a.size,
    createdAt: a.createdAt,
    source: "簽核 (PMIS-06)",
    context: a.document?.title ?? "簽核文件",
    url: `/api/files/${a.id}`,
  }));

  return [...ehsFiles, ...approvalFiles].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  );
}

export async function getDocuments() {
  const [media, reports, uploads] = await Promise.all([
    mediaRepo.listAssets(),
    mediaRepo.listReports(),
    getUploads(),
  ]);
  return { media, reports, uploads };
}

// ── 資料庫上傳／管理／閱覽 ─────────────────────────────────
export const ALLOWED_ACCEPT = storage.ALLOWED_ACCEPT;

function mediaTypeOf(mimeType: string): MediaType {
  return mimeType === "application/pdf" ? "DOCUMENT" : "PHOTO";
}

export type UploadInput = {
  projectId: string;
  title?: string;
  category?: string;
};

/** 於資料庫上傳文件（pdf/png/jpg），存檔並建立 MediaAsset 記錄。 */
export async function uploadDocument(
  input: UploadInput,
  file: File,
  actor: Actor,
): Promise<boolean> {
  if (!input.projectId || !(file instanceof File) || file.size === 0) return false;
  if (!(await canAccess(input.projectId, actor))) return false;
  if (!storage.isAllowed(file.type)) return false;

  const saved = await storage.saveFile(file);
  if (!saved) return false;

  await mediaRepo.create({
    projectId: input.projectId,
    title: input.title?.trim() || saved.fileName,
    type: mediaTypeOf(saved.mimeType),
    category: input.category?.trim() || null,
    fileUrl: saved.storedName, // 以 storedName 供 /api/documents/file 服務
    fileSizeKb: Math.max(1, Math.round(saved.size / 1024)),
    uploadedBy: actor.name || null,
    capturedAt: new Date(),
  });
  return true;
}

/** 刪除資料庫文件記錄（實體檔案保留於儲存區）。 */
export async function deleteDocument(id: string, actor: Actor): Promise<boolean> {
  const asset = await mediaRepo.findById(id);
  if (!asset || !(await canAccess(asset.projectId, actor))) return false;
  await mediaRepo.remove(id);
  return true;
}

/** 閱覽：取得可服務的檔案（僅限實際上傳、fileUrl 為 storedName 者）。 */
export async function getMediaFile(
  id: string,
): Promise<{ buffer: Buffer; mimeType: string; fileName: string } | null> {
  const asset = await mediaRepo.findById(id);
  if (!asset?.fileUrl) return null;
  const buffer = await storage.read(asset.fileUrl);
  if (!buffer) return null;
  const ext = asset.fileUrl.split(".").pop()?.toLowerCase();
  const mimeType =
    ext === "pdf"
      ? "application/pdf"
      : ext === "png"
        ? "image/png"
        : "image/jpeg";
  return { buffer, mimeType, fileName: asset.title };
}
