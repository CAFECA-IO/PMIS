import { prisma } from "./client";

/** 費思上傳歸檔的資料存取。 */

export type CreateFaithUploadData = {
  projectId?: string | null;
  fileName: string;
  storedName: string;
  mimeType: string;
  size: number;
  taskId?: string | null;
  taskTitle?: string | null;
  prompt?: string | null;
  uploadedById?: string | null;
  uploadedBy?: string | null;
};

export function create(data: CreateFaithUploadData) {
  return prisma.faithUpload.create({ data });
}

/** 供檔案路由做權限判定與取檔，欄位取到最小必要集合。 */
export function findForServe(id: string) {
  return prisma.faithUpload.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true,
      projectId: true,
      uploadedById: true,
      fileName: true,
      storedName: true,
      mimeType: true,
    },
  });
}

/** 檔案管理彙整用（含專案名稱）。 */
export function listAll() {
  return prisma.faithUpload.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      projectId: true,
      fileName: true,
      mimeType: true,
      size: true,
      taskTitle: true,
      prompt: true,
      uploadedBy: true,
      uploadedById: true,
      createdAt: true,
      project: { select: { name: true } },
    },
  });
}

/**
 * 某使用者尚未指派專案的上傳檔案（新到舊）。
 * 帶出來源任務與時間，讓使用者判斷是否與新專案相關。
 */
export function listUnassignedByUploader(uploaderId: string) {
  return prisma.faithUpload.findMany({
    where: { projectId: null, uploadedById: uploaderId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      fileName: true,
      mimeType: true,
      size: true,
      taskTitle: true,
      prompt: true,
      createdAt: true,
    },
  });
}

export function softDelete(id: string) {
  return prisma.faithUpload.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}

/** 事後補指派專案（一般對話上傳時未鎖定專案）。 */
export function assignProject(id: string, projectId: string | null) {
  return prisma.faithUpload.update({ where: { id }, data: { projectId } });
}

/**
 * 批次把「未指派且為本人上傳」的檔案歸入某專案。
 *
 * 安全性放在 where 條件而非先讀後寫：
 *  - projectId: null  已歸屬其他專案的檔案不會被搬走
 *  - uploadedById     不能挪用他人上傳的檔案
 *  - deletedAt: null  已刪除者不處理
 * 單一 updateMany 為原子操作，無先讀後寫的競態空窗。
 * 回傳實際更新筆數，呼叫端可據以判斷是否有 id 被拒。
 */
export async function assignManyToProject(
  ids: string[],
  projectId: string,
  uploaderId: string,
): Promise<number> {
  if (ids.length === 0) return 0;
  const result = await prisma.faithUpload.updateMany({
    where: {
      id: { in: ids },
      projectId: null,
      uploadedById: uploaderId,
      deletedAt: null,
    },
    data: { projectId },
  });
  return result.count;
}
