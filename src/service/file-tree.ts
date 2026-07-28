/**
 * 檔案管理的路徑與命名邏輯（純函式，無 I/O，便於單元測試）。
 *
 * 這裡集中處理最容易出錯的部分：
 *  1. 資料夾命名：不得含路徑分隔或控制字元，否則會破壞路徑語意與標頭。
 *  2. 同層重名：檔案系統會拒絕，此處改為自動加序號，避免上傳整包資料夾時失敗。
 *  3. 資料夾上傳的相對路徑：瀏覽器給的 webkitRelativePath 需切成層級並逐層淨化。
 */

/** 節點型別。虛擬資料夾代表既有模組的附件來源，唯讀。 */
export type NodeKind = "folder" | "virtual-folder" | "file";

export type TreeNode = {
  id: string;
  kind: NodeKind;
  name: string;
  /** 檔案的 MIME；資料夾為 null。 */
  mimeType: string | null;
  /** 檔案大小；資料夾為其內容總和。 */
  size: number;
  /** 修改日期（ISO 字串）。 */
  updatedAt: string | null;
  /** 關聯資料：說明此節點來自何處或關聯到哪筆紀錄。 */
  relation: string | null;
  /** 可否重新命名／刪除／搬移。虛擬資料夾與其內容為 false。 */
  editable: boolean;
  /** 檔案的檢視／下載連結。 */
  url?: string;
  downloadUrl?: string;
  /** 資料夾底下（含子層）的內容量，供刪除確認說明連帶影響。 */
  contents?: SubtreeCount;
  /** 搜尋結果所在路徑，如「捷運藍線 / 契約文件」。僅搜尋模式帶入。 */
  path?: string;
  /** 搜尋結果的所在資料夾 id，供點擊路徑跳轉。null 為專案根目錄。 */
  parentFolderId?: string | null;
};

// ── 資料夾命名 ──────────────────────────────────────────────

/** 資料夾名稱長度上限。 */
export const MAX_FOLDER_NAME = 80;

/**
 * 淨化資料夾名稱。
 * 去除路徑分隔、控制字元與前後空白／點（避免 "." ".." 這類特殊名稱）。
 * 回傳空字串表示不是合法名稱，呼叫端應拒絕。
 */
export function sanitizeFolderName(raw: string | null | undefined): string {
  const s = (raw ?? "")
    // 路徑分隔會破壞層級語意
    .replace(/[/\\]/g, "")
    // 控制字元
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    // 前後的點：全點名稱（. ..）在檔案系統有特殊意義
    .replace(/^\.+|\.+$/g, "")
    .trim();
  if (!s) return "";
  return s.length > MAX_FOLDER_NAME ? s.slice(0, MAX_FOLDER_NAME) : s;
}

/**
 * 同層重名時附加序號：報告 → 報告 (2) → 報告 (3)。
 * 檔案則在副檔名之前加：圖.png → 圖 (2).png。
 */
export function dedupeName(
  name: string,
  taken: Iterable<string>,
  isFile = false,
): string {
  const used = new Set(Array.from(taken));
  if (!used.has(name)) return name;

  let stem = name;
  let ext = "";
  if (isFile) {
    const i = name.lastIndexOf(".");
    if (i > 0) {
      stem = name.slice(0, i);
      ext = name.slice(i);
    }
  }
  for (let n = 2; n < 1000; n += 1) {
    const candidate = `${stem} (${n})${ext}`;
    if (!used.has(candidate)) return candidate;
  }
  // 極端情況：以時間戳收尾，確保一定產生唯一名稱
  return `${stem} (${Date.now()})${ext}`;
}

// ── 路徑導覽 ────────────────────────────────────────────────

export type Crumb = { id: string | null; name: string };

/**
 * 由祖先鏈組出麵包屑，開頭固定是專案根目錄（id 為 null）。
 * ancestors 需由外→內排序（根的直接子層在前）。
 */
export function buildBreadcrumb(
  projectName: string,
  ancestors: { id: string; name: string }[],
): Crumb[] {
  return [{ id: null, name: projectName }, ...ancestors.map((a) => ({ ...a }))];
}

/**
 * 由 parentId 對應表往上追出祖先鏈（外→內）。
 * 具備循環防護：資料異常導致自我循環時不會無限迴圈。
 */
export function ancestorChain(
  folderId: string | null,
  byId: Map<string, { id: string; name: string; parentId: string | null }>,
): { id: string; name: string }[] {
  const out: { id: string; name: string }[] = [];
  const seen = new Set<string>();
  let cursor = folderId;
  while (cursor) {
    if (seen.has(cursor)) break; // 循環防護
    seen.add(cursor);
    const node = byId.get(cursor);
    if (!node) break;
    out.unshift({ id: node.id, name: node.name });
    cursor = node.parentId;
  }
  return out;
}

// ── 資料夾上傳的相對路徑 ─────────────────────────────────────

/**
 * 解析 webkitRelativePath（如 "契約/附件/圖.png"）。
 * 回傳逐層淨化後的資料夾層級與檔名；非法層級會被略過而非中斷整批上傳。
 */
export function parseRelativePath(relativePath: string | null | undefined): {
  folders: string[];
  fileName: string;
} {
  const raw = (relativePath ?? "").replace(/\\/g, "/");
  const parts = raw.split("/").filter((p) => p.trim() !== "");
  if (parts.length === 0) return { folders: [], fileName: "" };

  const fileName = parts.pop() ?? "";
  const folders: string[] = [];
  for (const part of parts) {
    const clean = sanitizeFolderName(part);
    // 略過 "." ".." 或淨化後為空的層級，避免向上跳脫
    if (clean) folders.push(clean);
  }
  return { folders, fileName };
}

/** 資料夾層級深度上限，避免異常輸入建出過深的樹。 */
export const MAX_DEPTH = 10;

export function limitDepth(folders: string[]): string[] {
  return folders.slice(0, MAX_DEPTH);
}

// ── 子樹合計 ────────────────────────────────────────────────

/** 資料夾底下（含所有子層）的內容量。 */
export type SubtreeCount = { bytes: number; files: number; folders: number };

/**
 * 由「各資料夾直屬檔案的合計」推出「含子層的合計」。
 *
 * 需要這一步的理由：資料夾列顯示的大小若只算直屬檔案，
 * 一個只放子資料夾的資料夾會顯示 0 B，與使用者對檔案系統的認知不符；
 * 刪除確認也必須知道整個子樹會被連帶刪掉多少內容。
 *
 * @param folders 專案全部資料夾（id 與 parentId）
 * @param direct  各資料夾直屬檔案的合計
 */
export function rollupSubtree(
  folders: { id: string; parentId: string | null }[],
  direct: Map<string, { bytes: number; files: number }>,
): Map<string, SubtreeCount> {
  const childrenOf = new Map<string, string[]>();
  const ids = new Set<string>();
  for (const f of folders) {
    ids.add(f.id);
    if (f.parentId === null) continue;
    const list = childrenOf.get(f.parentId) ?? [];
    list.push(f.id);
    childrenOf.set(f.parentId, list);
  }

  const out = new Map<string, SubtreeCount>();

  // 以顯式堆疊做後序走訪：遞迴在異常深或含循環的資料上會爆堆疊
  for (const root of ids) {
    if (out.has(root)) continue;
    const stack: { id: string; expanded: boolean }[] = [
      { id: root, expanded: false },
    ];
    const onPath = new Set<string>();
    while (stack.length) {
      const frame = stack[stack.length - 1];
      if (!frame.expanded) {
        frame.expanded = true;
        if (out.has(frame.id) || onPath.has(frame.id)) {
          // 已算過，或偵測到循環（父子互指）——不再展開，避免無限迴圈
          stack.pop();
          continue;
        }
        onPath.add(frame.id);
        for (const child of childrenOf.get(frame.id) ?? []) {
          if (!ids.has(child)) continue;
          stack.push({ id: child, expanded: false });
        }
        continue;
      }
      stack.pop();
      onPath.delete(frame.id);
      if (out.has(frame.id)) continue;
      const own = direct.get(frame.id) ?? { bytes: 0, files: 0 };
      let bytes = own.bytes;
      let files = own.files;
      let count = 0;
      for (const child of childrenOf.get(frame.id) ?? []) {
        const sub = out.get(child);
        if (!sub) continue;
        bytes += sub.bytes;
        files += sub.files;
        count += sub.folders + 1;
      }
      out.set(frame.id, { bytes, files, folders: count });
    }
  }

  return out;
}

// ── 排序與顯示 ──────────────────────────────────────────────

/** 資料夾優先，其次依名稱（中文以 localeCompare 排序）。 */
export function sortNodes(nodes: TreeNode[]): TreeNode[] {
  const rank = (n: TreeNode) => (n.kind === "file" ? 1 : 0);
  return [...nodes].sort((a, b) => {
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    // 虛擬資料夾排在使用者資料夾之後，兩者內部再依名稱
    if (a.kind !== b.kind && rank(a) === 0) {
      return a.kind === "folder" ? -1 : 1;
    }
    return a.name.localeCompare(b.name, "zh-Hant");
  });
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/** 由 MIME 與檔名推出可讀的類型標籤。 */
export function typeLabel(
  kind: NodeKind,
  mimeType: string | null,
  fileName?: string,
): string {
  if (kind !== "file") return "資料夾";
  const m = mimeType ?? "";
  if (m === "application/pdf") return "PDF";
  if (m.startsWith("image/")) return "圖片";
  if (m.includes("wordprocessingml") || m === "application/msword") return "Word";
  if (m.includes("spreadsheetml") || m.includes("ms-excel")) return "Excel";
  if (m.includes("presentationml") || m.includes("ms-powerpoint")) return "PowerPoint";
  if (m === "text/csv") return "CSV";
  if (m.startsWith("text/")) return "文字";
  if (m.startsWith("video/")) return "影片";
  const ext = fileName?.split(".").pop();
  return ext && ext !== fileName ? ext.toUpperCase() : "檔案";
}

// ── 使用空間 ────────────────────────────────────────────────

export type UsageSource = {
  key: string;
  label: string;
  bytes: number;
  files: number;
};

export type Usage = {
  totalBytes: number;
  totalFiles: number;
  sources: (UsageSource & { percent: number })[];
};

/** 彙總各來源的用量與佔比。佔比以總量為分母，總量為 0 時皆為 0。 */
export function summarizeUsage(sources: UsageSource[]): Usage {
  const totalBytes = sources.reduce((s, x) => s + Math.max(0, x.bytes), 0);
  const totalFiles = sources.reduce((s, x) => s + Math.max(0, x.files), 0);
  return {
    totalBytes,
    totalFiles,
    sources: sources.map((x) => ({
      ...x,
      percent:
        totalBytes > 0 ? Math.round((Math.max(0, x.bytes) / totalBytes) * 1000) / 10 : 0,
    })),
  };
}
