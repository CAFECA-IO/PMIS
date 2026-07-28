import { test } from "node:test";
import assert from "node:assert/strict";

import { activityLine, summarizeRun, verdictOf } from "./wizard-summary";
import { initialProgress, type StepProgress } from "./wizard-steps";

const allDone: StepProgress[] = [
  { id: "profile", state: "done", count: 11, total: 11 },
  { id: "obligations", state: "done", count: 7 },
  { id: "owners", state: "done", count: 7, total: 7 },
  { id: "workItems", state: "done", count: 12 },
];

// ── verdictOf：執行狀態與實際成果分離 ───────────────────────
test("呼叫成功但只取得部分欄位 → partial，不是完成", () => {
  assert.equal(
    verdictOf({ id: "profile", state: "done", count: 2, total: 11 }),
    "partial",
  );
});

test("呼叫成功但完全沒取得資料 → empty", () => {
  assert.equal(verdictOf({ id: "obligations", state: "done", count: 0 }), "empty");
  assert.equal(
    verdictOf({ id: "profile", state: "done", count: 0, total: 11 }),
    "empty",
  );
});

test("取滿或無分母且有成果 → complete", () => {
  assert.equal(
    verdictOf({ id: "owners", state: "done", count: 2, total: 2 }),
    "complete",
  );
  assert.equal(
    verdictOf({ id: "workItems", state: "done", count: 2 }),
    "complete",
  );
});

test("失敗與略過各自成一類", () => {
  assert.equal(verdictOf({ id: "owners", state: "failed", error: "x" }), "failed");
  assert.equal(verdictOf({ id: "owners", state: "skipped" }), "skipped");
  assert.equal(verdictOf({ id: "owners", state: "pending" }), "empty");
});

// ── 實際回報的情境（來自使用者截圖）─────────────────────────
test("回歸：基本資料 2/11 時不得聲稱全部完成", () => {
  const md = summarizeRun({
    progress: [
      { id: "profile", state: "done", count: 2, total: 11 },
      { id: "obligations", state: "done", count: 2 },
      { id: "owners", state: "done", count: 2, total: 2 },
      { id: "workItems", state: "done", count: 2 },
    ],
    missingRequired: ["專案編號"],
    missingFields: [
      "專案編號",
      "業主／主辦機關",
      "承包商",
      "監造單位",
      "預算 (TWD)",
      "開工日",
      "完工日",
      "狀態",
      "工程摘要",
    ],
    fileName: "01.契約本文(正).docx",
  });

  assert.doesNotMatch(md, /全部完成/, "成果不完整時不可聲稱全部完成");
  assert.match(md, /3 個階段完整取得、1 個階段資料不完整/);
  // 該段落必須標示為部分擷取，而非打勾
  assert.match(md, /◐ \*\*專案基本資料 2\/11（尚缺 9 項）\*\*/);
  assert.doesNotMatch(md, /✅ \*\*專案基本資料/);
  // 明確列出尚缺哪些欄位，而不是只講必填的那一個
  assert.match(md, /基本資料尚缺：\*\*專案編號、業主／主辦機關/);
  assert.match(md, /工程摘要\*\*/);
  assert.match(md, /仍需補上：\*\*專案編號\*\*/);
});

test("全部取滿才說全部完成", () => {
  const md = summarizeRun({ progress: allDone, fileName: "契約書.pdf" });
  assert.match(md, /已解析 \*\*契約書\.pdf\*\*，4 個階段全部完成。/);
  assert.match(md, /✅ \*\*專案基本資料 11\/11\*\*/);
  assert.match(md, /請核對內容後即可建立專案。/);
});

test("某段回 0 項時標為未取得，並提示可能未載明", () => {
  const md = summarizeRun({
    progress: [
      allDone[0],
      { id: "obligations", state: "done", count: 0 },
      { id: "owners", state: "skipped", error: "尚無履約事項可回填責任分工" },
      { id: "workItems", state: "done", count: 0 },
    ],
  });
  assert.match(md, /⚠️ \*\*履約事項 未取得任何資料\*\*/);
  assert.match(md, /擷取到的內容偏少，可能是文件未載明/);
  assert.doesNotMatch(md, /全部完成/);
});

test("引用各段模型附帶的說法", () => {
  const md = summarizeRun({
    progress: allDone,
    notes: { obligations: "契約第五條列出七項管制事項" },
  });
  assert.match(md, /契約第五條列出七項管制事項/);
});

test("部分失敗：說明比例並提示可單段重試", () => {
  const md = summarizeRun({
    progress: [
      ...allDone.slice(0, 2),
      { id: "owners", state: "failed", error: "Gemini API 錯誤（503）" },
      allDone[3],
    ],
  });
  assert.match(md, /3 個階段完整取得、1 個階段未完成/);
  assert.match(md, /責任分工與契約依據 未完成[\s\S]*503/);
  assert.match(md, /可在左側進度清單點\*\*重試\*\*/);
  assert.match(md, /已取得的資料不會受影響/);
});

test("全部失敗時不謊稱有成果", () => {
  const md = summarizeRun({
    progress: [
      { id: "profile", state: "failed", error: "逾時" },
      { id: "obligations", state: "failed", error: "逾時" },
    ],
  });
  assert.match(md, /各階段均未能取得資料/);
  assert.doesNotMatch(md, /全部完成/);
});

test("略過的段落單獨說明原因與後續", () => {
  const md = summarizeRun({
    progress: [
      allDone[0],
      { id: "obligations", state: "done", count: 3 },
      { id: "owners", state: "skipped", error: "尚無履約事項可回填責任分工" },
      allDone[3],
    ],
  });
  assert.match(md, /責任分工與契約依據 略過[\s\S]*尚無履約事項/);
  assert.match(md, /因缺少前置資料而略過/);
});

test("單段重試時開頭改為說明重試範圍", () => {
  const md = summarizeRun({
    progress: [
      { id: "profile", state: "pending" },
      { id: "obligations", state: "pending" },
      { id: "owners", state: "done", count: 7, total: 7 },
      { id: "workItems", state: "pending" },
    ],
    only: ["owners"],
  });
  assert.match(md, /已重新解析「責任分工與契約依據」/);
  assert.doesNotMatch(md, /專案基本資料/);
});

test("完全未執行時回傳空字串（不留無意義訊息）", () => {
  assert.equal(summarizeRun({ progress: initialProgress() }), "");
  assert.equal(summarizeRun({ progress: [] }), "");
});

// ── activityLine ────────────────────────────────────────────
test("activityLine 顯示目前段落與序號", () => {
  assert.equal(
    activityLine([
      { id: "profile", state: "done" },
      { id: "obligations", state: "running" },
    ]),
    "（2/4）正在解析履約事項…",
  );
});

test("activityLine 沒有進行中的段落時回 null", () => {
  assert.equal(activityLine(allDone), null);
  assert.equal(activityLine(initialProgress()), null);
});
