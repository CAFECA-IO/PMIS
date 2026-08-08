import * as mediaRepo from "@/repository/media.repository";
import * as ehsRepo from "@/repository/ehs.repository";
import * as approvalRepo from "@/repository/approvalDocument.repository";
import * as faithUploadRepo from "@/repository/faithUpload.repository";
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
  url: string; // 內嵌檢視連結
  downloadUrl: string; // 強制下載連結
};

/**
 * 彙整系統各環節上傳的實體檔案（環安衛稽核附件、簽核文件附件…），
 * 讓「檔案管理（PMIS-13）」成為所有上傳檔案的單一入口。
 * 新增其他會上傳檔案的模組時，於此加入其來源即可。
 */
async function getUploads(): Promise<UploadedFile[]> {
  const [ehs, approval, faith] = await Promise.all([
    ehsRepo.listAllAttachments(),
    approvalRepo.listAllAttachments(),
    faithUploadRepo.listAll(),
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
    downloadUrl: `/api/ehs/file/${a.id}?download=1`,
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
    downloadUrl: `/api/files/${a.id}?download=1`,
  }));

  const faithFiles: UploadedFile[] = faith.map((f) => ({
    id: f.id,
    fileName: f.fileName,
    mimeType: f.mimeType,
    size: f.size,
    createdAt: f.createdAt,
    source: "費思 AI 對話",
    // 未指派專案時顯示上傳者與來源任務，仍可辨識脈絡
    context:
      [f.project?.name ?? "未指派專案", f.taskTitle ?? "一般對話"]
        .filter(Boolean)
        .join("｜") + (f.uploadedBy ? `｜${f.uploadedBy}` : ""),
    url: `/api/faith/file/${f.id}`,
    downloadUrl: `/api/faith/file/${f.id}?download=1`,
  }));

  return [...ehsFiles, ...approvalFiles, ...faithFiles].sort(
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

// ── 舊版數位檔案上傳／管理／閱覽（MediaAsset）─────────────────
export const ALLOWED_ACCEPT = storage.ALLOWED_ACCEPT;

function mediaTypeOf(mimeType: string): MediaType {
  return mimeType === "application/pdf" ? "DOCUMENT" : "PHOTO";
}

export type UploadInput = {
  projectId: string;
  title?: string;
  category?: string;
};

/**
 * 上傳文件（pdf/png/jpg；HEIC／HEIF 由 storage 轉為 jpg），
 * 存檔並建立 MediaAsset 記錄。
 */
export async function uploadDocument(
  input: UploadInput,
  file: File,
  actor: Actor,
): Promise<boolean> {
  if (!input.projectId || !(file instanceof File) || file.size === 0) return false;
  if (!(await canAccess(input.projectId, actor))) return false;
  // 併傳檔名：手機照片的 MIME 回報不一致（空字串或 octet-stream），
  // 僅看 file.type 會讓 HEIC 在此就被誤擋
  if (!storage.isAllowed(file.type, file.name)) return false;

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

/** 刪除文件記錄（實體檔案保留於儲存區）。 */
export async function deleteDocument(id: string, actor: Actor): Promise<boolean> {
  const asset = await mediaRepo.findById(id);
  if (!asset || !(await canAccess(asset.projectId, actor))) return false;
  await mediaRepo.remove(id);
  return true;
}

/** 閱覽：取得可服務的檔案（僅限實際上傳、fileUrl 為 storedName 者）。 */
export async function getMediaFile(id: string): Promise<{
  buffer: Buffer;
  mimeType: string;
  fileName: string;
  projectId: string;
} | null> {
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
  return { buffer, mimeType, fileName: asset.title, projectId: asset.projectId };
}
