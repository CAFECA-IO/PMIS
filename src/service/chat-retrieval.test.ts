import { test } from "node:test";
import assert from "node:assert/strict";

import {
  MAX_CONTEXT_CHARS,
  MAX_MANIFEST_FILES,
  MAX_NATIVE_BYTES,
  MAX_NATIVE_FILES,
  MAX_TEXT_FILES,
  allowedDatasets,
  applyBudget,
  buildManifest,
  capText,
  contextBlock,
  datasetIds,
  describeManifest,
  planSummary,
  readabilityOf,
  resolvePlan,
  retrievalNote,
  type RawFile,
  type RetrievalManifest,
} from "./chat-retrieval";
import { CHAT_DATASETS } from "@/constant/chat-retrieval";

const file = (over: Partial<RawFile> = {}): RawFile => ({
  id: over.id ?? "f1",
  source: over.source ?? "project",
  name: over.name ?? "契約本文.docx",
  path: over.path ?? "捷運藍線 / 契約文件",
  mimeType:
    over.mimeType === undefined
      ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      : over.mimeType,
  size: over.size ?? 1024,
  updatedAt: over.updatedAt === undefined ? "2026-07-01T00:00:00.000Z" : over.updatedAt,
});

const manifestOf = (files: RawFile[], projectName = "捷運藍線") =>
  buildManifest({
    projectName,
    files,
    datasets: [
      { id: "obligations", label: "履約事項", hint: "期限與狀態" },
      { id: "quality", label: "施工查驗與缺失", hint: "查驗與缺失" },
    ],
  });

// ── 可讀性 ──────────────────────────────────────────────────
test("Office 與純文字檔可轉文字", () => {
  assert.equal(readabilityOf(null, "契約.docx"), "text");
  assert.equal(readabilityOf(null, "工項明細.xlsx"), "text");
  assert.equal(readabilityOf(null, "簡報.pptx"), "text");
  assert.equal(readabilityOf("text/plain", "備註.txt"), "text");
});

test("PDF 與影像須以原檔判讀", () => {
  assert.equal(readabilityOf("application/pdf", "契約.pdf"), "native");
  assert.equal(readabilityOf("image/jpeg", "現場.jpg"), "native");
});

test("舊格式與不明格式標為無法閱讀，而非假裝可讀", () => {
  assert.equal(readabilityOf("application/msword", "舊契約.doc"), "none");
  assert.equal(readabilityOf(null, "圖檔.dwg"), "none");
});

test("MIME 不可靠時以副檔名為準（Office 常見）", () => {
  assert.equal(readabilityOf("application/octet-stream", "契約.docx"), "text");
});

// ── 清單 ────────────────────────────────────────────────────
test("每份檔案取得可指認的代號，由 F1 起算", () => {
  const m = manifestOf([file({ id: "a", name: "a.docx" }), file({ id: "b", name: "b.docx" })]);
  assert.deepEqual(
    m.files.map((f) => f.ref),
    ["F1", "F2"],
  );
});

test("讀不到的檔案排在最後，但仍留在清單上", () => {
  const m = manifestOf([
    file({ id: "bad", name: "舊檔.doc", mimeType: "application/msword" }),
    file({ id: "pdf", name: "契約.pdf", mimeType: "application/pdf" }),
    file({ id: "ok", name: "契約.docx" }),
  ]);
  assert.deepEqual(
    m.files.map((f) => f.id),
    ["ok", "pdf", "bad"],
    "可轉文字 → 原檔判讀 → 無法閱讀",
  );
  assert.equal(m.files.length, 3, "無法閱讀的檔案不可被移除，否則費思會謊稱它不存在");
});

test("同一可讀性內以更新時間新者為先", () => {
  const m = manifestOf([
    file({ id: "old", name: "舊.docx", updatedAt: "2026-01-01T00:00:00.000Z" }),
    file({ id: "new", name: "新.docx", updatedAt: "2026-07-01T00:00:00.000Z" }),
  ]);
  assert.deepEqual(
    m.files.map((f) => f.id),
    ["new", "old"],
  );
});

test("清單超過上限時截斷並標記，且犧牲的是讀不到的檔案", () => {
  const many: RawFile[] = [];
  for (let i = 0; i < MAX_MANIFEST_FILES; i++) {
    many.push(file({ id: `t${i}`, name: `文件${i}.docx` }));
  }
  many.push(file({ id: "bad", name: "讀不到.dwg", mimeType: "application/acad" }));
  const m = manifestOf(many);
  assert.equal(m.files.length, MAX_MANIFEST_FILES);
  assert.equal(m.filesTruncated, true);
  assert.equal(m.totalFiles, MAX_MANIFEST_FILES + 1);
  assert.ok(!m.files.some((f) => f.id === "bad"), "被擠掉的應是無法閱讀者");
});

test("沒有檔案時清單仍成立，不得拋錯", () => {
  const m = manifestOf([]);
  assert.deepEqual(m.files, []);
  assert.equal(m.filesTruncated, false);
  assert.match(describeManifest(m), /沒有任何檔案/);
});

test("清單文字含代號、位置與可讀性，模型才挑得準", () => {
  const text = describeManifest(manifestOf([file({ name: "01.契約本文(正).docx" })]));
  assert.match(text, /F1\. 01\.契約本文\(正\)\.docx/);
  assert.match(text, /捷運藍線 \/ 契約文件/);
  assert.match(text, /可讀/);
  assert.match(text, /obligations：履約事項/);
});

test("PDF 在清單上註明成本較高，讓模型不要無故挑它", () => {
  const text = describeManifest(
    manifestOf([file({ name: "契約.pdf", mimeType: "application/pdf" })]),
  );
  assert.match(text, /成本較高/);
});

test("清單被截斷時明說共有幾份，避免模型以為看到了全部", () => {
  const many: RawFile[] = [];
  for (let i = 0; i <= MAX_MANIFEST_FILES; i++) {
    many.push(file({ id: `t${i}`, name: `文件${i}.docx` }));
  }
  assert.match(describeManifest(manifestOf(many)), /共 81 份/);
});

// ── 權限過濾 ────────────────────────────────────────────────
test("無權限的模組不出現在可查資料中", () => {
  const sets = allowedDatasets((key) => key !== "/finance");
  assert.ok(!sets.some((d) => d.id === "finance"), "沒有財務權限就不該查得到財務");
  assert.ok(sets.some((d) => d.id === "obligations"));
});

test("完全無權限時回空陣列，清單文字明說無可查資料", () => {
  const sets = allowedDatasets(() => false);
  assert.deepEqual(sets, []);
  const m = buildManifest({ projectName: "X", files: [], datasets: sets });
  assert.match(describeManifest(m), /無可查詢/);
});

test("目錄中每一項都對應一個實際模組路由", () => {
  for (const d of CHAT_DATASETS) {
    assert.match(d.module, /^\//, `${d.id} 的 module 應為路由`);
    assert.ok(d.hint.length > 0, `${d.id} 需要說明，否則模型無從判斷該不該查`);
  }
});

test("資料表 id 不重複", () => {
  const ids = CHAT_DATASETS.map((d) => d.id);
  assert.equal(new Set(ids).size, ids.length);
});

// ── 對回實際資料 ────────────────────────────────────────────
test("代號對回實際檔案", () => {
  const m = manifestOf([file({ id: "a", name: "a.docx" }), file({ id: "b", name: "b.docx" })]);
  const r = resolvePlan(m, { needed: true, files: ["F2"], datasets: [] });
  assert.deepEqual(
    r.files.map((f) => f.id),
    ["b"],
  );
});

test("編造的代號一律丟棄，不讓取檔失敗中斷回答", () => {
  const m = manifestOf([file({ id: "a" })]);
  const r = resolvePlan(m, { needed: true, files: ["F1", "F99"], datasets: [] });
  assert.deepEqual(
    r.files.map((f) => f.id),
    ["a"],
  );
  assert.deepEqual(r.unknownRefs, ["F99"], "無效代號要留紀錄才追得到模型在編");
});

test("代號大小寫與空白不影響對應", () => {
  const m = manifestOf([file({ id: "a" })]);
  const r = resolvePlan(m, { needed: true, files: [" f1 "], datasets: [] });
  assert.equal(r.files.length, 1);
});

test("重複挑選同一份只讀一次", () => {
  const m = manifestOf([file({ id: "a" })]);
  const r = resolvePlan(m, { needed: true, files: ["F1", "F1"], datasets: [] });
  assert.equal(r.files.length, 1);
});

test("不在權限內的資料表不被採用", () => {
  const m = manifestOf([file()]);
  const r = resolvePlan(m, { needed: true, files: [], datasets: ["finance"] });
  assert.deepEqual(r.datasets, [], "清單裡沒有財務就不能查");
  assert.deepEqual(r.unknownRefs, ["finance"]);
});

test("判定不需檢索時不讀任何東西", () => {
  const m = manifestOf([file()]);
  const r = resolvePlan(m, {
    needed: false,
    reason: "此為通則問題",
    files: [],
    datasets: [],
  });
  assert.equal(r.needed, false);
  assert.deepEqual(r.files, []);
  assert.equal(r.reason, "此為通則問題");
});

test("說不需要卻列了檔案時以列出的為準（旗標矛盾寧可多讀）", () => {
  const m = manifestOf([file({ id: "a" })]);
  const r = resolvePlan(m, { needed: false, files: ["F1"], datasets: [] });
  assert.equal(r.needed, true);
  assert.equal(r.files.length, 1);
});

test("規劃失敗（無法解析）視為不需檢索，退回一般對話", () => {
  const r = resolvePlan(manifestOf([file()]), null);
  assert.equal(r.needed, false);
  assert.deepEqual(r.files, []);
  assert.match(r.reason, /無法取得/);
});

// ── 閱讀量控制 ──────────────────────────────────────────────
const resolved = (m: RetrievalManifest, refs: string[]) =>
  resolvePlan(m, { needed: true, files: refs, datasets: [] });

test("文字檔超過份數上限時，多的明確列為未讀", () => {
  const files: RawFile[] = [];
  for (let i = 0; i < MAX_TEXT_FILES + 2; i++) {
    files.push(file({ id: `t${i}`, name: `文件${i}.docx` }));
  }
  const m = manifestOf(files);
  const b = applyBudget(resolved(m, m.files.map((f) => f.ref)));
  assert.equal(b.text.length, MAX_TEXT_FILES);
  assert.equal(b.skipped.length, 2);
  assert.ok(b.skipped.every((s) => s.why === "too-many"));
});

test("原檔份數與文字份數各自計算，不互相排擠", () => {
  const m = manifestOf([
    file({ id: "d1", name: "1.docx" }),
    file({ id: "p1", name: "1.pdf", mimeType: "application/pdf" }),
  ]);
  const b = applyBudget(resolved(m, ["F1", "F2"]));
  assert.equal(b.text.length + b.native.length, 2);
  assert.deepEqual(b.skipped, []);
});

test("原檔合計超過大小上限時擋下，不讓請求爆掉", () => {
  const big = Math.floor(MAX_NATIVE_BYTES * 0.8);
  const m = manifestOf([
    file({ id: "p1", name: "1.pdf", mimeType: "application/pdf", size: big }),
    file({ id: "p2", name: "2.pdf", mimeType: "application/pdf", size: big }),
  ]);
  const b = applyBudget(resolved(m, ["F1", "F2"]));
  assert.equal(b.native.length, 1);
  assert.equal(b.skipped[0]?.why, "too-large");
});

test("原檔份數上限比文字嚴（成本考量）", () => {
  assert.ok(MAX_NATIVE_FILES < MAX_TEXT_FILES);
  const m = manifestOf([
    file({ id: "p1", name: "1.pdf", mimeType: "application/pdf" }),
    file({ id: "p2", name: "2.pdf", mimeType: "application/pdf" }),
    file({ id: "p3", name: "3.pdf", mimeType: "application/pdf" }),
  ]);
  const b = applyBudget(resolved(m, ["F1", "F2", "F3"]));
  assert.equal(b.native.length, MAX_NATIVE_FILES);
  assert.equal(b.skipped.length, 1);
});

test("挑到無法閱讀的格式時說明原因，不靜靜忽略", () => {
  const m = manifestOf([
    file({ id: "bad", name: "舊契約.doc", mimeType: "application/msword" }),
  ]);
  const b = applyBudget(resolved(m, ["F1"]));
  assert.equal(b.text.length + b.native.length, 0);
  assert.equal(b.skipped[0]?.why, "unreadable");
});

// ── 上下文 ──────────────────────────────────────────────────
test("上下文開頭交代來源與不得推測", () => {
  const out = contextBlock([{ title: "文件：契約.docx", body: "第一條…" }]);
  assert.ok(out);
  assert.match(out, /本專案實際調閱/);
  assert.match(out, /不要推測/);
  assert.match(out, /【文件：契約\.docx】/);
});

test("全為空內容時回 null，不注入空殼", () => {
  assert.equal(contextBlock([]), null);
  assert.equal(contextBlock([{ title: "x", body: "   " }]), null);
});

test("塞不下時先截斷第一份，而不是整份丟掉換小的進來", () => {
  const long = "字".repeat(MAX_CONTEXT_CHARS * 2);
  const out = contextBlock([
    { title: "契約", body: long },
    { title: "小附註", body: "順便一提" },
  ]);
  assert.ok(out);
  assert.match(out, /【契約】/, "第一份（通常是契約）不得被整份丟棄");
  assert.match(out, /僅節錄前段/);
  assert.match(out, /未納入：小附註/);
  assert.ok(out.length <= MAX_CONTEXT_CHARS + 300, `實際 ${out.length}`);
});

test("剩餘空間太小時不塞殘篇，明說未納入", () => {
  const out = contextBlock([
    { title: "甲", body: "字".repeat(MAX_CONTEXT_CHARS - 200) },
    { title: "乙", body: "字".repeat(1000) },
  ]);
  assert.ok(out);
  assert.match(out, /未納入：乙/);
});

test("單一文件過長時截斷並回報", () => {
  const r = capText("字".repeat(50), 10);
  assert.equal(r.text.length, 10);
  assert.equal(r.truncated, true);
  assert.equal(capText("短", 10).truncated, false);
});

// ── 來源說明 ────────────────────────────────────────────────
test("讀了東西就附上參考來源", () => {
  const m = manifestOf([file({ name: "01.契約本文(正).docx" })]);
  const b = applyBudget(resolvePlan(m, {
    needed: true,
    files: ["F1"],
    datasets: ["obligations"],
  }));
  const note = retrievalNote(b);
  assert.ok(note);
  assert.match(note, /參考：01\.契約本文\(正\)\.docx、履約事項/);
});

test("什麼都沒讀時不留空的參考行", () => {
  const m = manifestOf([file()]);
  assert.equal(retrievalNote(applyBudget(resolvePlan(m, { needed: false }))), null);
});

test("未讀的檔案連同原因一起說明", () => {
  const m = manifestOf([
    file({ id: "bad", name: "舊契約.doc", mimeType: "application/msword" }),
  ]);
  const note = retrievalNote(applyBudget(resolved(m, ["F1"])));
  assert.ok(note);
  assert.match(note, /未讀：舊契約\.doc（格式無法閱讀）/);
});

test("紀錄摘要含挑選數量與無效代號", () => {
  const m = manifestOf([file({ id: "a" })]);
  const plan = resolvePlan(m, {
    needed: true,
    reason: "問的是契約期限",
    files: ["F1", "F42"],
    datasets: ["obligations"],
  });
  const line = planSummary(plan, applyBudget(plan));
  assert.match(line, /需檢索/);
  assert.match(line, /檔案 1\/1/);
  assert.match(line, /無效代號 F42/);
  assert.match(line, /理由：問的是契約期限/);
});

test("不需檢索時摘要也說得出來（供紀錄核對）", () => {
  const m = manifestOf([file()]);
  const plan = resolvePlan(m, { needed: false, reason: "通則問題" });
  assert.match(planSummary(plan, applyBudget(plan)), /不需檢索/);
});

test("送進 schema 的資料表 id 都是目錄內的合法值", () => {
  const ids = datasetIds([
    { id: "obligations", label: "履約事項", hint: "" },
    { id: "bogus", label: "假的", hint: "" },
  ]);
  assert.deepEqual(ids, ["obligations"]);
});
