import * as nodeRepo from "@/repository/fileNode.repository";
import * as ehsRepo from "@/repository/ehs.repository";
import * as approvalRepo from "@/repository/approvalDocument.repository";
import * as faithUploadRepo from "@/repository/faithUpload.repository";
import * as memberRepo from "@/repository/projectMember.repository";
import * as storage from "@/service/storage.service";
import { canSeeAllProjects } from "@/lib/auth";
import {
  ancestorChain,
  buildBreadcrumb,
  dedupeName,
  limitDepth,
  rollupSubtree,
  sanitizeFolderName,
  sortNodes,
  summarizeUsage,
  type Crumb,
  type SubtreeCount,
  type TreeNode,
  type Usage,
} from "./file-tree";
import {
  isSearchable,
  joinPath,
  limitResults,
  matchesQuery,
  normalizeQuery,
  SEARCH_SCAN_LIMIT,
} from "./file-search";
import type { AccountRole } from "@/generated/prisma/enums";

/**
 * 檔案管理（PMIS-13）：以專案為根目錄的樹狀瀏覽。
 *
 * 樹的組成：
 *  - 使用者自建資料夾與直接上傳的檔案（FileFolder／ProjectFile，可管理）
 *  - 既有模組的附件以「唯讀虛擬資料夾」呈現（環安衛／簽核／費思），
 *    因為那些檔案被稽核與簽核紀錄引用，不應被自由搬移或刪除。
 *    虛擬資料夾的 id 以 virtual: 前綴標示，不存在於資料庫。
 */

export const VIRTUAL_PREFIX = "virtual:";

export type VirtualSource = "ehs" | "approval" | "faith";

const VIRTUAL_FOLDERS: { source: VirtualSource; name: string }[] = [
  { source: "ehs", name: "環安衛稽核附件" },
  { source: "approval", name: "簽核文件附件" },
  { source: "faith", name: "費思對話上傳" },
];

export function isVirtual(id: string | null | undefined): boolean {
  return Boolean(id?.startsWith(VIRTUAL_PREFIX));
}

export function virtualSourceOf(id: string): VirtualSource | null {
  const s = id.slice(VIRTUAL_PREFIX.length);
  return s === "ehs" || s === "approval" || s === "faith" ? s : null;
}

export type Viewer = { id: string; role: AccountRole };

async function canAccess(projectId: string, viewer: Viewer): Promise<boolean> {
  if (canSeeAllProjects(viewer.role)) return true;
  return Boolean(await memberRepo.exists(projectId, viewer.id));
}

/** 供路由使用的存取檢查（專案權限＋資料夾須屬於該專案）。 */
export async function canWriteInto(
  projectId: string,
  folderId: string | null,
  viewer: Viewer,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await canAccess(projectId, viewer))) {
    return { ok: false, error: "無權存取此專案。" };
  }
  if (folderId && isVirtual(folderId)) {
    return { ok: false, error: "系統歸檔資料夾不可寫入。" };
  }
  if (folderId) {
    const folder = await nodeRepo.findFolder(folderId);
    if (!folder || folder.projectId !== projectId) {
      return { ok: false, error: "找不到資料夾。" };
    }
  }
  return { ok: true };
}

export type FolderListing = {
  breadcrumb: Crumb[];
  nodes: TreeNode[];
  /** 目前所在資料夾；null 為專案根目錄。 */
  folderId: string | null;
  /** 虛擬資料夾內不可新增或上傳。 */
  readOnly: boolean;
};

/**
 * 列出某資料夾的內容。folderId 為 null 時列出專案根目錄，
 * 並在根目錄附上三個唯讀虛擬資料夾。
 */
export async function listFolder(
  projectId: string,
  projectName: string,
  folderId: string | null,
  viewer: Viewer,
): Promise<FolderListing | null> {
  if (!(await canAccess(projectId, viewer))) return null;

  // 虛擬資料夾：列出該來源的全部附件（不再分層）
  if (folderId && isVirtual(folderId)) {
    const source = virtualSourceOf(folderId);
    if (!source) return null;
    const meta = VIRTUAL_FOLDERS.find((v) => v.source === source)!;
    return {
      breadcrumb: buildBreadcrumb(projectName, [
        { id: folderId, name: meta.name },
      ]),
      nodes: sortNodes(await virtualFiles(projectId, source)),
      folderId,
      readOnly: true,
    };
  }

  const folders = await nodeRepo.listFoldersByProject(projectId);
  const byId = new Map(folders.map((f) => [f.id, f]));

  // 指定資料夾須屬於本專案，避免以 id 跨專案窺看
  if (folderId && !byId.has(folderId)) return null;

  const [children, files, sizes] = await Promise.all([
    nodeRepo.listChildFolders(projectId, folderId),
    nodeRepo.listFilesInFolder(projectId, folderId),
    nodeRepo.folderSizes(projectId),
  ]);

  // 資料夾的大小與筆數要含子層，否則只放子資料夾的資料夾會顯示 0 B
  const subtree = rollupSubtree(folders, sizes);

  const nodes: TreeNode[] = [
    ...children.map((f) => {
      const agg = subtree.get(f.id);
      return {
        id: f.id,
        kind: "folder" as const,
        name: f.name,
        mimeType: null,
        size: agg?.bytes ?? 0,
        updatedAt: f.updatedAt.toISOString(),
        relation: describeFolderContents(agg),
        editable: true,
        contents: agg,
      };
    }),
    ...files.map((f) => ({
      id: f.id,
      kind: "file" as const,
      name: f.fileName,
      mimeType: f.mimeType,
      size: f.size,
      updatedAt: f.updatedAt.toISOString(),
      relation: f.uploadedBy ? `上傳者 ${f.uploadedBy}` : null,
      editable: true,
      url: `/api/file-manager/${f.id}`,
      downloadUrl: `/api/file-manager/${f.id}?download=1`,
    })),
  ];

  // 只有根目錄掛虛擬資料夾，避免每層都重複出現
  if (folderId === null) {
    const counts = await virtualCounts(projectId);
    for (const v of VIRTUAL_FOLDERS) {
      const c = counts[v.source];
      nodes.push({
        id: `${VIRTUAL_PREFIX}${v.source}`,
        kind: "virtual-folder",
        name: v.name,
        mimeType: null,
        size: c.bytes,
        updatedAt: null,
        relation: `系統歸檔 · ${c.files} 個檔案`,
        editable: false,
      });
    }
  }

  return {
    breadcrumb: buildBreadcrumb(
      projectName,
      ancestorChain(folderId, byId as Map<string, { id: string; name: string; parentId: string | null }>),
    ),
    nodes: sortNodes(nodes),
    folderId,
    readOnly: false,
  };
}

/** 資料夾列的「關聯資料」：含子層的內容量。 */
function describeFolderContents(agg: SubtreeCount | undefined): string | null {
  if (!agg) return null;
  const parts: string[] = [];
  if (agg.folders > 0) parts.push(`${agg.folders} 個子資料夾`);
  if (agg.files > 0) parts.push(`${agg.files} 個檔案`);
  return parts.length > 0 ? parts.join("、") : null;
}

/** 三個來源的附件轉為節點（唯讀）。 */
async function virtualFiles(
  projectId: string,
  source: VirtualSource,
): Promise<TreeNode[]> {
  if (source === "ehs") {
    const rows = await ehsRepo.listAllAttachments();
    return rows
      .filter((a) => a.audit.projectId === projectId)
      .map((a) => ({
        id: a.id,
        kind: "file" as const,
        name: a.fileName,
        mimeType: a.mimeType,
        size: a.size,
        updatedAt: a.createdAt.toISOString(),
        relation: `環安衛稽核 · ${a.audit.location ?? a.audit.type}`,
        editable: false,
        url: `/api/ehs/file/${a.id}`,
        downloadUrl: `/api/ehs/file/${a.id}?download=1`,
      }));
  }
  if (source === "faith") {
    const rows = await faithUploadRepo.listAll();
    return rows
      .filter((f) => f.projectId === projectId)
      .map((f) => ({
        id: f.id,
        kind: "file" as const,
        name: f.fileName,
        mimeType: f.mimeType,
        size: f.size,
        updatedAt: f.createdAt.toISOString(),
        relation: `費思 · ${f.taskTitle ?? "一般對話"}`,
        editable: false,
        url: `/api/faith/file/${f.id}`,
        downloadUrl: `/api/faith/file/${f.id}?download=1`,
      }));
  }
  // 簽核文件不隸屬專案（資料模型上無 projectId），故不依專案過濾
  const rows = await approvalRepo.listAllAttachments();
  return rows.map((a) => ({
    id: a.id,
    kind: "file" as const,
    name: a.fileName,
    mimeType: a.mimeType,
    size: a.size,
    updatedAt: a.createdAt.toISOString(),
    relation: `簽核文件 · ${a.document?.title ?? "未命名"}`,
    editable: false,
    url: `/api/files/${a.id}`,
    downloadUrl: `/api/files/${a.id}?download=1`,
  }));
}

async function virtualCounts(projectId: string) {
  const [ehs, approval, faith] = await Promise.all([
    virtualFiles(projectId, "ehs"),
    virtualFiles(projectId, "approval"),
    virtualFiles(projectId, "faith"),
  ]);
  const agg = (list: TreeNode[]) => ({
    bytes: list.reduce((s, n) => s + n.size, 0),
    files: list.length,
  });
  return { ehs: agg(ehs), approval: agg(approval), faith: agg(faith) };
}

// ── 搜尋 ────────────────────────────────────────────────────

export type SearchResult = {
  query: string;
  nodes: TreeNode[];
  /** 結果筆數超過顯示上限而被截斷。 */
  truncated: boolean;
  /** 檔案數超過掃描上限，結果可能不完整（須向使用者說明）。 */
  scanTruncated: boolean;
};

/**
 * 搜尋整個專案的資料夾與檔案（不限於目前所在資料夾）。
 *
 * 一併搜尋三個唯讀來源的附件 —— 若只搜使用者自建的樹，
 * 使用者找不到由環安衛或費思歸檔的檔案會誤判「檔案不見了」。
 * 每筆結果都帶所在路徑，否則同名檔案無法分辨來自何處。
 */
export async function search(
  projectId: string,
  projectName: string,
  rawQuery: string,
  viewer: Viewer,
): Promise<SearchResult | null> {
  if (!(await canAccess(projectId, viewer))) return null;

  const query = normalizeQuery(rawQuery);
  if (!isSearchable(query)) {
    return { query, nodes: [], truncated: false, scanTruncated: false };
  }

  const [folders, fileRows, totalFiles, sizes] = await Promise.all([
    nodeRepo.listFoldersByProject(projectId),
    nodeRepo.scanFilesForSearch(projectId, SEARCH_SCAN_LIMIT),
    nodeRepo.countFiles(projectId),
    nodeRepo.folderSizes(projectId),
  ]);

  const byId = new Map(folders.map((f) => [f.id, f]));
  const subtree = rollupSubtree(folders, sizes);

  /** 某資料夾的顯示路徑（含專案名稱為根）。 */
  const pathOf = (folderId: string | null): string => {
    const chain = ancestorChain(
      folderId,
      byId as Map<string, { id: string; name: string; parentId: string | null }>,
    );
    return joinPath([projectName, ...chain.map((c) => c.name)]);
  };

  const hits: TreeNode[] = [];

  for (const f of folders) {
    if (!matchesQuery(f.name, query)) continue;
    const agg = subtree.get(f.id);
    hits.push({
      id: f.id,
      kind: "folder",
      name: f.name,
      mimeType: null,
      size: agg?.bytes ?? 0,
      updatedAt: f.updatedAt.toISOString(),
      relation: describeFolderContents(agg),
      editable: true,
      contents: agg,
      // 資料夾自身的路徑不含自己，指向其上層
      path: pathOf(f.parentId),
      parentFolderId: f.parentId,
    });
  }

  for (const f of fileRows) {
    if (!matchesQuery(f.fileName, query)) continue;
    hits.push({
      id: f.id,
      kind: "file",
      name: f.fileName,
      mimeType: f.mimeType,
      size: f.size,
      updatedAt: f.updatedAt.toISOString(),
      relation: f.uploadedBy ? `上傳者 ${f.uploadedBy}` : null,
      editable: true,
      url: `/api/file-manager/${f.id}`,
      downloadUrl: `/api/file-manager/${f.id}?download=1`,
      path: pathOf(f.folderId),
      parentFolderId: f.folderId,
    });
  }

  // 唯讀來源：本來就整批載入記憶體，直接沿用同一套比對
  const virtualLists = await Promise.all(
    VIRTUAL_FOLDERS.map(async (v) => ({
      meta: v,
      rows: await virtualFiles(projectId, v.source),
    })),
  );
  for (const { meta, rows } of virtualLists) {
    for (const n of rows) {
      if (!matchesQuery(n.name, query)) continue;
      hits.push({
        ...n,
        path: joinPath([projectName, meta.name]),
        parentFolderId: `${VIRTUAL_PREFIX}${meta.source}`,
      });
    }
  }

  const { items, truncated } = limitResults(sortNodes(hits));
  return {
    query,
    nodes: items,
    truncated,
    scanTruncated: totalFiles > SEARCH_SCAN_LIMIT,
  };
}

// ── 清冊（供費思檢索用） ─────────────────────────────────────

export type InventoryFile = {
  id: string;
  /** 取檔路徑不同，故須隨身帶著來源。 */
  source: "project" | "faith" | "ehs";
  name: string;
  /** 顯示路徑，如「捷運藍線 / 契約文件」。 */
  path: string;
  mimeType: string | null;
  size: number;
  updatedAt: string | null;
};

/**
 * 列出專案內所有檔案（含所在路徑），供費思判斷該調閱哪一份。
 *
 * 與 search 的差別：不比對關鍵字，而是整份清冊 —— 判斷該讀哪一份
 * 是模型的工作，先用關鍵字砍一刀反而會在使用者的問法與檔名不同字時漏掉。
 *
 * 刻意排除簽核文件附件：那批資料在模型上沒有 projectId（見 search 的說明），
 * 於檔案管理只是多顯示一些檔案，但若餵進 AI 回答，
 * 就成了把別案的文件當作本案依據，比讀不到更糟。
 */
export async function inventory(
  projectId: string,
  projectName: string,
  viewer: Viewer,
): Promise<InventoryFile[] | null> {
  if (!(await canAccess(projectId, viewer))) return null;

  const [folders, fileRows] = await Promise.all([
    nodeRepo.listFoldersByProject(projectId),
    nodeRepo.scanFilesForSearch(projectId, SEARCH_SCAN_LIMIT),
  ]);
  const byId = new Map(folders.map((f) => [f.id, f]));
  const pathOf = (folderId: string | null): string =>
    joinPath([
      projectName,
      ...ancestorChain(
        folderId,
        byId as Map<string, { id: string; name: string; parentId: string | null }>,
      ).map((c) => c.name),
    ]);

  const out: InventoryFile[] = fileRows.map((f) => ({
    id: f.id,
    source: "project" as const,
    name: f.fileName,
    path: pathOf(f.folderId),
    mimeType: f.mimeType,
    size: f.size,
    updatedAt: f.updatedAt.toISOString(),
  }));

  for (const source of ["ehs", "faith"] as const) {
    const meta = VIRTUAL_FOLDERS.find((v) => v.source === source)!;
    for (const n of await virtualFiles(projectId, source)) {
      out.push({
        id: n.id,
        source,
        name: n.name,
        path: joinPath([projectName, meta.name]),
        mimeType: n.mimeType,
        size: n.size,
        updatedAt: n.updatedAt,
      });
    }
  }
  return out;
}

/** 本專案的空間使用狀況（不設配額，只呈現事實）。 */
export async function usage(
  projectId: string,
  viewer: Viewer,
): Promise<Usage | null> {
  if (!(await canAccess(projectId, viewer))) return null;
  const [direct, counts] = await Promise.all([
    nodeRepo.projectFileUsage(projectId),
    virtualCounts(projectId),
  ]);
  return summarizeUsage([
    { key: "direct", label: "直接上傳", bytes: direct.bytes, files: direct.files },
    { key: "ehs", label: "環安衛稽核", bytes: counts.ehs.bytes, files: counts.ehs.files },
    { key: "approval", label: "簽核文件", bytes: counts.approval.bytes, files: counts.approval.files },
    { key: "faith", label: "費思對話", bytes: counts.faith.bytes, files: counts.faith.files },
  ]);
}

// ── 變更操作 ────────────────────────────────────────────────

export type MutationResult =
  | { ok: true; id?: string; name?: string }
  | { ok: false; error: string };

/** 新建資料夾。同層重名自動加序號，不讓使用者卡在錯誤訊息。 */
export async function createFolder(
  projectId: string,
  parentId: string | null,
  rawName: string,
  viewer: Viewer,
): Promise<MutationResult> {
  if (!(await canAccess(projectId, viewer))) {
    return { ok: false, error: "無權存取此專案。" };
  }
  if (parentId && isVirtual(parentId)) {
    return { ok: false, error: "系統歸檔資料夾不可新增內容。" };
  }
  const name = sanitizeFolderName(rawName);
  if (!name) return { ok: false, error: "資料夾名稱不合法。" };

  if (parentId) {
    const parent = await nodeRepo.findFolder(parentId);
    if (!parent || parent.projectId !== projectId) {
      return { ok: false, error: "找不到上層資料夾。" };
    }
  }

  const taken = await nodeRepo.takenFolderNames(projectId, parentId);
  const finalName = dedupeName(name, taken);
  const row = await nodeRepo.createFolder({ projectId, parentId, name: finalName });
  return { ok: true, id: row.id, name: finalName };
}

/** 刪除資料夾（含子層與其中檔案，皆為軟刪除）。 */
export async function deleteFolder(
  projectId: string,
  folderId: string,
  viewer: Viewer,
): Promise<MutationResult> {
  if (!(await canAccess(projectId, viewer))) {
    return { ok: false, error: "無權存取此專案。" };
  }
  if (isVirtual(folderId)) {
    return { ok: false, error: "系統歸檔資料夾不可刪除。" };
  }
  const folder = await nodeRepo.findFolder(folderId);
  if (!folder || folder.projectId !== projectId) {
    return { ok: false, error: "找不到資料夾。" };
  }
  await nodeRepo.softDeleteFolderTree(projectId, folderId);
  return { ok: true };
}

export async function deleteFile(
  projectId: string,
  fileId: string,
  viewer: Viewer,
): Promise<MutationResult> {
  if (!(await canAccess(projectId, viewer))) {
    return { ok: false, error: "無權存取此專案。" };
  }
  const r = await nodeRepo.softDeleteFile(projectId, fileId);
  if (r.count === 0) return { ok: false, error: "找不到檔案或已刪除。" };
  return { ok: true };
}

/**
 * 依相對路徑逐層取得（必要時建立）資料夾，回傳最終資料夾 id。
 * 供資料夾整包上傳使用。
 */
export async function ensureFolderPath(
  projectId: string,
  parentId: string | null,
  folders: string[],
): Promise<string | null> {
  let cursor = parentId;
  for (const raw of limitDepth(folders)) {
    const name = sanitizeFolderName(raw);
    if (!name) continue;
    const existing = await nodeRepo.listChildFolders(projectId, cursor);
    const hit = existing.find((f) => f.name === name);
    if (hit) {
      cursor = hit.id;
      continue;
    }
    const row = await nodeRepo.createFolder({ projectId, parentId: cursor, name });
    cursor = row.id;
  }
  return cursor;
}

/** 取檔（含權限判定）。 */
export async function getFile(
  fileId: string,
  viewer: Viewer,
): Promise<
  | { ok: true; buffer: Buffer; mimeType: string; fileName: string }
  | { ok: false; reason: "not-found" | "forbidden" }
> {
  const row = await nodeRepo.findFileForServe(fileId);
  if (!row) return { ok: false, reason: "not-found" };
  if (!(await canAccess(row.projectId, viewer))) {
    return { ok: false, reason: "forbidden" };
  }
  const buffer = await storage.read(row.storedName);
  if (!buffer) return { ok: false, reason: "not-found" };
  return { ok: true, buffer, mimeType: row.mimeType, fileName: row.fileName };
}
