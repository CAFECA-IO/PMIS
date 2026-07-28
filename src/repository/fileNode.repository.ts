import { prisma } from "./client";

/** 檔案管理的資料夾與檔案存取。 */

// ── 資料夾 ──────────────────────────────────────────────────

export function listFoldersByProject(projectId: string) {
  return prisma.fileFolder.findMany({
    where: { projectId, deletedAt: null },
    select: { id: true, name: true, parentId: true, updatedAt: true },
  });
}

export function listChildFolders(projectId: string, parentId: string | null) {
  return prisma.fileFolder.findMany({
    where: { projectId, parentId, deletedAt: null },
    select: { id: true, name: true, parentId: true, updatedAt: true },
  });
}

export function findFolder(id: string) {
  return prisma.fileFolder.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, projectId: true, parentId: true, name: true },
  });
}

/** 同層已使用的資料夾名稱，供自動加序號。 */
export async function takenFolderNames(
  projectId: string,
  parentId: string | null,
): Promise<string[]> {
  const rows = await prisma.fileFolder.findMany({
    where: { projectId, parentId, deletedAt: null },
    select: { name: true },
  });
  return rows.map((r) => r.name);
}

export function createFolder(data: {
  projectId: string;
  parentId: string | null;
  name: string;
}) {
  return prisma.fileFolder.create({ data });
}

/** 軟刪除資料夾。子層與其中檔案一併標記，避免留下孤兒節點。 */
export async function softDeleteFolderTree(
  projectId: string,
  folderId: string,
): Promise<{ folders: number; files: number }> {
  // 先在記憶體算出整個子樹，再兩次 updateMany，避免逐層遞迴查詢
  const all = await listFoldersByProject(projectId);
  const childrenOf = new Map<string | null, string[]>();
  for (const f of all) {
    const list = childrenOf.get(f.parentId) ?? [];
    list.push(f.id);
    childrenOf.set(f.parentId, list);
  }
  const ids: string[] = [];
  const stack = [folderId];
  const seen = new Set<string>();
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id)) continue; // 循環防護
    seen.add(id);
    ids.push(id);
    for (const child of childrenOf.get(id) ?? []) stack.push(child);
  }

  const now = new Date();
  const files = await prisma.projectFile.updateMany({
    where: { projectId, folderId: { in: ids }, deletedAt: null },
    data: { deletedAt: now },
  });
  const folders = await prisma.fileFolder.updateMany({
    where: { projectId, id: { in: ids }, deletedAt: null },
    data: { deletedAt: now },
  });
  return { folders: folders.count, files: files.count };
}

// ── 檔案 ────────────────────────────────────────────────────

export function listFilesInFolder(projectId: string, folderId: string | null) {
  return prisma.projectFile.findMany({
    where: { projectId, folderId, deletedAt: null },
    select: {
      id: true,
      fileName: true,
      mimeType: true,
      size: true,
      updatedAt: true,
      uploadedBy: true,
    },
  });
}

export async function takenFileNames(
  projectId: string,
  folderId: string | null,
): Promise<string[]> {
  const rows = await prisma.projectFile.findMany({
    where: { projectId, folderId, deletedAt: null },
    select: { fileName: true },
  });
  return rows.map((r) => r.fileName);
}

export function createFile(data: {
  projectId: string;
  folderId: string | null;
  fileName: string;
  storedName: string;
  mimeType: string;
  size: number;
  uploadedById?: string | null;
  uploadedBy?: string | null;
}) {
  return prisma.projectFile.create({ data });
}

export function findFileForServe(id: string) {
  return prisma.projectFile.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true,
      projectId: true,
      fileName: true,
      storedName: true,
      mimeType: true,
    },
  });
}

export function softDeleteFile(projectId: string, id: string) {
  return prisma.projectFile.updateMany({
    where: { id, projectId, deletedAt: null },
    data: { deletedAt: new Date() },
  });
}

/**
 * 供搜尋掃描的檔案清單（有上限）。
 *
 * 刻意不在資料庫端過濾：SQLite 的 LIKE 大小寫不敏感只適用 ASCII 且屬引擎預設，
 * 換資料庫或改 pragma 就會靜默失去。比對一律在記憶體以 file-search 的
 * 純函式處理，行為可測且與資料庫無關；代價是掃描量需設上限。
 */
export function scanFilesForSearch(projectId: string, limit: number) {
  return prisma.projectFile.findMany({
    where: { projectId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      fileName: true,
      mimeType: true,
      size: true,
      updatedAt: true,
      uploadedBy: true,
      folderId: true,
    },
  });
}

/** 專案內未刪除的檔案總數，用於判斷搜尋掃描是否觸及上限。 */
export function countFiles(projectId: string) {
  return prisma.projectFile.count({ where: { projectId, deletedAt: null } });
}

/** 各資料夾的檔案大小合計，供資料夾列顯示「內容總和」。 */
export async function folderSizes(
  projectId: string,
): Promise<Map<string, { bytes: number; files: number }>> {
  const rows = await prisma.projectFile.groupBy({
    by: ["folderId"],
    where: { projectId, deletedAt: null, folderId: { not: null } },
    _sum: { size: true },
    _count: { _all: true },
  });
  const out = new Map<string, { bytes: number; files: number }>();
  for (const r of rows) {
    if (!r.folderId) continue;
    out.set(r.folderId, { bytes: r._sum.size ?? 0, files: r._count._all });
  }
  return out;
}

/** 本專案直接上傳的檔案用量。 */
export async function projectFileUsage(projectId: string) {
  const r = await prisma.projectFile.aggregate({
    where: { projectId, deletedAt: null },
    _sum: { size: true },
    _count: { _all: true },
  });
  return { bytes: r._sum.size ?? 0, files: r._count._all };
}
