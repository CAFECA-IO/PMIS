import { test } from "node:test";
import assert from "node:assert/strict";

import {
  MAX_DEPTH,
  MAX_FOLDER_NAME,
  ancestorChain,
  buildBreadcrumb,
  dedupeName,
  formatBytes,
  limitDepth,
  parseRelativePath,
  rollupSubtree,
  sanitizeFolderName,
  sortNodes,
  summarizeUsage,
  typeLabel,
  type TreeNode,
} from "./file-tree";

// ── sanitizeFolderName ──────────────────────────────────────
test("保留中文與空白，去除前後空白", () => {
  assert.equal(sanitizeFolderName("  契約文件  "), "契約文件");
});

test("去除路徑分隔，防止跨層級建立", () => {
  assert.equal(sanitizeFolderName("a/b"), "ab");
  assert.equal(sanitizeFolderName("a\\b"), "ab");
  assert.equal(sanitizeFolderName("../../etc"), "etc");
});

test("去除控制字元", () => {
  const clean = sanitizeFolderName("\u0000\u001f報告表\u007f");
  assert.equal(clean, "報告表");
});

test("純點名稱視為非法", () => {
  assert.equal(sanitizeFolderName("."), "");
  assert.equal(sanitizeFolderName(".."), "");
  assert.equal(sanitizeFolderName("..."), "");
});

test("空值與純空白視為非法", () => {
  assert.equal(sanitizeFolderName(""), "");
  assert.equal(sanitizeFolderName("   "), "");
  assert.equal(sanitizeFolderName(null), "");
  assert.equal(sanitizeFolderName(undefined), "");
});

test("截斷過長名稱", () => {
  assert.equal(sanitizeFolderName("資".repeat(200)).length, MAX_FOLDER_NAME);
});

test("隱藏檔式名稱去掉開頭點但保留主體", () => {
  assert.equal(sanitizeFolderName(".hidden"), "hidden");
});

// ── dedupeName ──────────────────────────────────────────────
test("同層重名的資料夾自動加序號", () => {
  assert.equal(dedupeName("報告", []), "報告");
  assert.equal(dedupeName("報告", ["報告"]), "報告 (2)");
  assert.equal(dedupeName("報告", ["報告", "報告 (2)"]), "報告 (3)");
});

test("檔案的序號加在副檔名之前", () => {
  assert.equal(dedupeName("圖.png", ["圖.png"], true), "圖 (2).png");
  assert.equal(
    dedupeName("契約.docx", ["契約.docx", "契約 (2).docx"], true),
    "契約 (3).docx",
  );
});

test("無副檔名的檔案直接加在尾端", () => {
  assert.equal(dedupeName("README", ["README"], true), "README (2)");
});

test("開頭為點的檔名不誤判副檔名", () => {
  assert.equal(dedupeName(".env", [".env"], true), ".env (2)");
});

// ── 路徑導覽 ────────────────────────────────────────────────
test("麵包屑第一層固定為專案根目錄", () => {
  const crumbs = buildBreadcrumb("捷運藍線", [
    { id: "f1", name: "契約" },
    { id: "f2", name: "附件" },
  ]);
  assert.deepEqual(crumbs, [
    { id: null, name: "捷運藍線" },
    { id: "f1", name: "契約" },
    { id: "f2", name: "附件" },
  ]);
});

test("根目錄時麵包屑只有專案", () => {
  assert.deepEqual(buildBreadcrumb("捷運藍線", []), [
    { id: null, name: "捷運藍線" },
  ]);
});

test("ancestorChain 由外而內組出祖先", () => {
  const byId = new Map([
    ["f1", { id: "f1", name: "契約", parentId: null }],
    ["f2", { id: "f2", name: "附件", parentId: "f1" }],
    ["f3", { id: "f3", name: "圖說", parentId: "f2" }],
  ]);
  assert.deepEqual(
    ancestorChain("f3", byId).map((a) => a.name),
    ["契約", "附件", "圖說"],
  );
  assert.deepEqual(ancestorChain(null, byId), []);
});

test("ancestorChain 對循環資料不會無限迴圈", () => {
  const byId = new Map([
    ["a", { id: "a", name: "A", parentId: "b" }],
    ["b", { id: "b", name: "B", parentId: "a" }],
  ]);
  const chain = ancestorChain("a", byId);
  assert.ok(chain.length <= 2, "應在偵測到循環時停止");
});

test("ancestorChain 遇到不存在的父層即停止", () => {
  const byId = new Map([["f2", { id: "f2", name: "附件", parentId: "missing" }]]);
  assert.deepEqual(
    ancestorChain("f2", byId).map((a) => a.name),
    ["附件"],
  );
});

// ── parseRelativePath ───────────────────────────────────────
test("解析資料夾上傳的相對路徑", () => {
  assert.deepEqual(parseRelativePath("契約/附件/圖.png"), {
    folders: ["契約", "附件"],
    fileName: "圖.png",
  });
});

test("單一檔案沒有資料夾層級", () => {
  assert.deepEqual(parseRelativePath("圖.png"), {
    folders: [],
    fileName: "圖.png",
  });
});

test("相對路徑中的跳脫層級被略過，不會向上逃出", () => {
  const r = parseRelativePath("../../etc/passwd");
  assert.deepEqual(r.folders, ["etc"], "..被淨化為空而略過");
  assert.equal(r.fileName, "passwd");
});

test("反斜線路徑與重複分隔都能處理", () => {
  assert.deepEqual(parseRelativePath("a\\\\b//c.txt"), {
    folders: ["a", "b"],
    fileName: "c.txt",
  });
});

test("空路徑回空檔名，由呼叫端拒絕", () => {
  assert.deepEqual(parseRelativePath(""), { folders: [], fileName: "" });
  assert.deepEqual(parseRelativePath(null), { folders: [], fileName: "" });
});

test("限制層級深度", () => {
  const deep = Array.from({ length: 20 }, (_, i) => `L${i}`);
  assert.equal(limitDepth(deep).length, MAX_DEPTH);
});

// ── 子樹合計 ────────────────────────────────────────────────
const direct = (entries: [string, number, number][]) =>
  new Map(entries.map(([id, bytes, files]) => [id, { bytes, files }]));

test("子樹合計把子層的大小與筆數往上累加", () => {
  const folders = [
    { id: "a", parentId: null },
    { id: "b", parentId: "a" },
    { id: "c", parentId: "b" },
  ];
  const r = rollupSubtree(
    folders,
    direct([
      ["a", 100, 1],
      ["b", 200, 2],
      ["c", 400, 4],
    ]),
  );
  assert.deepEqual(r.get("c"), { bytes: 400, files: 4, folders: 0 });
  assert.deepEqual(r.get("b"), { bytes: 600, files: 6, folders: 1 });
  assert.deepEqual(r.get("a"), { bytes: 700, files: 7, folders: 2 });
});

test("只放子資料夾的資料夾不會顯示 0（這是原本的錯）", () => {
  const folders = [
    { id: "parent", parentId: null },
    { id: "child", parentId: "parent" },
  ];
  const r = rollupSubtree(folders, direct([["child", 500, 3]]));
  assert.deepEqual(r.get("parent"), { bytes: 500, files: 3, folders: 1 });
});

test("兄弟資料夾各自獨立，不互相污染", () => {
  const folders = [
    { id: "root", parentId: null },
    { id: "x", parentId: "root" },
    { id: "y", parentId: "root" },
  ];
  const r = rollupSubtree(
    folders,
    direct([
      ["x", 10, 1],
      ["y", 20, 2],
    ]),
  );
  assert.deepEqual(r.get("x"), { bytes: 10, files: 1, folders: 0 });
  assert.deepEqual(r.get("y"), { bytes: 20, files: 2, folders: 0 });
  assert.deepEqual(r.get("root"), { bytes: 30, files: 3, folders: 2 });
});

test("沒有檔案的資料夾為 0 而非 undefined", () => {
  const r = rollupSubtree([{ id: "empty", parentId: null }], new Map());
  assert.deepEqual(r.get("empty"), { bytes: 0, files: 0, folders: 0 });
});

test("父子互指的循環資料不會無限迴圈", () => {
  const folders = [
    { id: "a", parentId: "b" },
    { id: "b", parentId: "a" },
  ];
  const r = rollupSubtree(folders, direct([["a", 5, 1]]));
  assert.equal(r.size, 2, "兩個節點都應算出結果");
});

test("父層不存在時仍算出自己的量（孤兒節點）", () => {
  const r = rollupSubtree(
    [{ id: "orphan", parentId: "missing" }],
    direct([["orphan", 42, 2]]),
  );
  assert.deepEqual(r.get("orphan"), { bytes: 42, files: 2, folders: 0 });
});

test("深層結構不爆堆疊", () => {
  const depth = 5000;
  const folders = Array.from({ length: depth }, (_, i) => ({
    id: `f${i}`,
    parentId: i === 0 ? null : `f${i - 1}`,
  }));
  const r = rollupSubtree(folders, direct([[`f${depth - 1}`, 1, 1]]));
  assert.deepEqual(r.get("f0"), { bytes: 1, files: 1, folders: depth - 1 });
});

test("direct 中不存在於 folders 的 id 會被忽略", () => {
  const r = rollupSubtree(
    [{ id: "a", parentId: null }],
    direct([
      ["a", 10, 1],
      ["ghost", 999, 9],
    ]),
  );
  assert.deepEqual(r.get("a"), { bytes: 10, files: 1, folders: 0 });
  assert.equal(r.has("ghost"), false);
});

// ── 排序 ────────────────────────────────────────────────────
const node = (over: Partial<TreeNode> & { id: string; name: string; kind: TreeNode["kind"] }): TreeNode => ({
  mimeType: null,
  size: 0,
  updatedAt: null,
  relation: null,
  editable: true,
  ...over,
});

test("排序：使用者資料夾 → 虛擬資料夾 → 檔案", () => {
  const sorted = sortNodes([
    node({ id: "3", name: "報告.pdf", kind: "file" }),
    node({ id: "2", name: "環安衛", kind: "virtual-folder" }),
    node({ id: "1", name: "契約", kind: "folder" }),
  ]);
  assert.deepEqual(sorted.map((n) => n.id), ["1", "2", "3"]);
});

test("同類型依名稱排序且不改動輸入", () => {
  // 刻意用與語系無關的名稱：中文的排序依 ICU 可能為筆畫或拼音，
  // 寫死順序會讓測試依賴執行環境的 ICU 版本。
  const input = [
    node({ id: "b", name: "B區", kind: "folder" }),
    node({ id: "a", name: "A區", kind: "folder" }),
  ];
  const before = input.map((n) => n.id);
  const sorted = sortNodes(input);
  assert.deepEqual(sorted.map((n) => n.name), ["A區", "B區"]);
  assert.deepEqual(input.map((n) => n.id), before, "不應改動輸入陣列");
});

test("中文名稱以 localeCompare 排序（不斷言特定文化順序）", () => {
  const sorted = sortNodes([
    node({ id: "1", name: "乙區", kind: "folder" }),
    node({ id: "2", name: "甲區", kind: "folder" }),
  ]);
  const expected = ["乙區", "甲區"].sort((a, b) => a.localeCompare(b, "zh-Hant"));
  assert.deepEqual(sorted.map((n) => n.name), expected);
});

// ── formatBytes / typeLabel ─────────────────────────────────
test("formatBytes 各級距", () => {
  assert.equal(formatBytes(0), "0 B");
  assert.equal(formatBytes(512), "512 B");
  assert.equal(formatBytes(545829), "533 KB");
  assert.equal(formatBytes(5 * 1024 * 1024), "5.0 MB");
  assert.equal(formatBytes(3 * 1024 * 1024 * 1024), "3.00 GB");
  assert.equal(formatBytes(-1), "—");
  assert.equal(formatBytes(Number.NaN), "—");
});

test("typeLabel 依 MIME 判斷，資料夾一律為資料夾", () => {
  assert.equal(typeLabel("folder", null), "資料夾");
  assert.equal(typeLabel("virtual-folder", null), "資料夾");
  assert.equal(typeLabel("file", "application/pdf"), "PDF");
  assert.equal(typeLabel("file", "image/png"), "圖片");
  assert.equal(
    typeLabel(
      "file",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ),
    "Word",
  );
  assert.equal(typeLabel("file", "text/csv"), "CSV");
});

test("typeLabel 未知 MIME 退回副檔名", () => {
  assert.equal(typeLabel("file", "application/x-foo", "備份.dwg"), "DWG");
  assert.equal(typeLabel("file", "", "無副檔名"), "檔案");
});

// ── summarizeUsage ──────────────────────────────────────────
test("彙總各來源用量與佔比", () => {
  const u = summarizeUsage([
    { key: "direct", label: "直接上傳", bytes: 600, files: 3 },
    { key: "ehs", label: "環安衛", bytes: 300, files: 2 },
    { key: "faith", label: "費思", bytes: 100, files: 1 },
  ]);
  assert.equal(u.totalBytes, 1000);
  assert.equal(u.totalFiles, 6);
  assert.deepEqual(u.sources.map((s) => s.percent), [60, 30, 10]);
});

test("總量為 0 時佔比皆為 0，不得除以零", () => {
  const u = summarizeUsage([
    { key: "a", label: "A", bytes: 0, files: 0 },
    { key: "b", label: "B", bytes: 0, files: 0 },
  ]);
  assert.equal(u.totalBytes, 0);
  assert.deepEqual(u.sources.map((s) => s.percent), [0, 0]);
});

test("負值視為 0，不影響總量", () => {
  const u = summarizeUsage([
    { key: "a", label: "A", bytes: 100, files: 1 },
    { key: "b", label: "B", bytes: -50, files: -1 },
  ]);
  assert.equal(u.totalBytes, 100);
  assert.equal(u.totalFiles, 1);
});
