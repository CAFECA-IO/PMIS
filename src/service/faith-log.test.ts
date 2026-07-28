import { test } from "node:test";
import assert from "node:assert/strict";

import {
  MAX_FIELD_CHARS,
  MAX_MESSAGES,
  clip,
  clipMessages,
  logFileName,
  parseJsonLine,
  toJsonLine,
  type FeedbackEntry,
  type InteractionEntry,
} from "./faith-log";

// ── clip ────────────────────────────────────────────────────
test("clip 短文字原樣保留", () => {
  const r = clip("短內容");
  assert.equal(r.text, "短內容");
  assert.equal(r.chars, 3);
  assert.equal(r.truncated, false);
});

test("clip 長文字截斷並保留原始長度（契約全文不得整份寫入）", () => {
  const long = "契".repeat(60000);
  const r = clip(long);
  assert.equal(r.truncated, true);
  assert.equal(r.chars, 60000, "原始長度必須保留，才知道模型看了多少");
  assert.ok(r.text.length < 2100, "截斷後應遠小於原文");
  assert.match(r.text, /原長 60000/);
});

test("clip 邊界值不截斷", () => {
  const exact = "x".repeat(MAX_FIELD_CHARS);
  assert.equal(clip(exact).truncated, false);
  assert.equal(clip(`${exact}y`).truncated, true);
});

test("clip 處理空值", () => {
  assert.equal(clip(undefined).text, "");
  assert.equal(clip(null).chars, 0);
});

// ── clipMessages ────────────────────────────────────────────
test("clipMessages 只留最後幾則", () => {
  const many = Array.from({ length: 30 }, (_, i) => ({
    role: "user",
    text: `第 ${i} 則`,
  }));
  const out = clipMessages(many);
  assert.equal(out.length, MAX_MESSAGES);
  assert.equal(out.at(-1)!.text, "第 29 則", "應保留最新的訊息");
  assert.equal(out[0].text, "第 18 則");
});

test("clipMessages 正規化角色並逐則截斷", () => {
  const out = clipMessages([
    { role: "assistant", text: "回覆" },
    { role: "model", text: "非標準角色視為 user" },
    { role: "user", text: "字".repeat(5000) },
  ]);
  assert.equal(out[0].role, "assistant");
  assert.equal(out[1].role, "user");
  assert.equal(out[2].chars, 5000, "被截斷者記錄原長");
});

test("clipMessages 空輸入回空陣列", () => {
  assert.deepEqual(clipMessages(undefined), []);
  assert.deepEqual(clipMessages([]), []);
});

// ── logFileName ─────────────────────────────────────────────
test("logFileName 每日一檔，補零", () => {
  assert.equal(logFileName(new Date("2026-07-08T23:00:00Z")), "2026-07-08.jsonl");
  assert.equal(logFileName(new Date("2026-12-31T00:00:00Z")), "2026-12-31.jsonl");
});

// ── JSONL 往返 ──────────────────────────────────────────────
test("互動紀錄可單行序列化並解析回來", () => {
  const entry: InteractionEntry = {
    kind: "interaction",
    ts: "2026-07-28T10:00:00.000Z",
    conversationId: "c1",
    turnId: "t1",
    task: "project-build:obligations",
    ok: true,
    latencyMs: 1234,
    messages: [{ role: "user", text: "請解析" }],
    response: { text: "{...}", chars: 5, truncated: false },
  };
  const line = toJsonLine(entry);
  assert.ok(line.endsWith("\n"), "須以換行結尾，維持 JSONL 格式");
  assert.equal(line.trimEnd().includes("\n"), false, "單筆不得含裸換行");
  assert.deepEqual(parseJsonLine(line), entry);
});

test("含換行的內容不會破壞逐行格式", () => {
  const entry: InteractionEntry = {
    kind: "interaction",
    ts: "2026-07-28T10:00:00.000Z",
    ok: true,
    messages: [{ role: "user", text: "第一行\n第二行\n第三行" }],
  };
  const line = toJsonLine(entry);
  assert.equal(line.split("\n").length, 2, "應只有結尾一個換行");
  const back = parseJsonLine(line) as InteractionEntry;
  assert.equal(back.messages![0].text, "第一行\n第二行\n第三行");
});

test("評價紀錄可往返", () => {
  const entry: FeedbackEntry = {
    kind: "feedback",
    ts: "2026-07-28T10:05:00.000Z",
    conversationId: "c1",
    turnId: "t1",
    rating: "down",
    comment: "履約事項抓太少",
    answer: { text: "已解析…", chars: 5, truncated: false },
    path: "/projects/new",
  };
  assert.deepEqual(parseJsonLine(toJsonLine(entry)), entry);
});

test("parseJsonLine 對空行、壞行與非紀錄物件回 null", () => {
  assert.equal(parseJsonLine(""), null);
  assert.equal(parseJsonLine("   "), null);
  assert.equal(parseJsonLine("{不是 JSON"), null);
  assert.equal(parseJsonLine('{"kind":"other"}'), null);
});

test("評價與互動可用 turnId 對應（追蹤同一次回答）", () => {
  const interaction = toJsonLine({
    kind: "interaction",
    ts: "2026-07-28T10:00:00.000Z",
    conversationId: "c1",
    turnId: "t7",
    ok: true,
  });
  const feedback = toJsonLine({
    kind: "feedback",
    ts: "2026-07-28T10:01:00.000Z",
    conversationId: "c1",
    turnId: "t7",
    rating: "up",
  });
  const rows = [interaction, feedback]
    .map(parseJsonLine)
    .filter((r): r is NonNullable<typeof r> => r !== null);
  const byTurn = rows.filter((r) => r.turnId === "t7");
  assert.equal(byTurn.length, 2);
  assert.deepEqual(byTurn.map((r) => r.kind), ["interaction", "feedback"]);
});
