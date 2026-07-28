import { test } from "node:test";
import assert from "node:assert/strict";

import { sanitizeSchema, parseJsonLoose } from "./faith.service";

// ── sanitizeSchema ──────────────────────────────────────────
// 回歸測試：enum 內含空字串會讓 Gemini 回 400
// `GenerateContentRequest.generation_config.response_schema cannot be empty`
test("sanitizeSchema 移除 enum 內的空字串", () => {
  const out = sanitizeSchema({
    type: "OBJECT",
    properties: {
      operator: { type: "STRING", enum: ["GTE", "LTE", ""] },
    },
  });
  const props = out?.properties as Record<string, { enum?: string[] }>;
  assert.deepEqual(props.operator.enum, ["GTE", "LTE"]);
});

test("sanitizeSchema 對全為空字串的 enum 整個丟棄該鍵", () => {
  const out = sanitizeSchema({
    type: "OBJECT",
    properties: { anchor: { type: "STRING", enum: ["", "  "] } },
  });
  const props = out?.properties as Record<string, Record<string, unknown>>;
  assert.equal("enum" in props.anchor, false);
  assert.equal(props.anchor.type, "STRING");
});

test("sanitizeSchema 移除空的 properties 物件", () => {
  const out = sanitizeSchema({
    type: "OBJECT",
    properties: { nested: { type: "OBJECT", properties: {} } },
  });
  const props = out?.properties as Record<string, Record<string, unknown>>;
  assert.equal("properties" in props.nested, false);
});

test("sanitizeSchema 遞迴處理陣列 items 與深層巢狀", () => {
  const out = sanitizeSchema({
    type: "OBJECT",
    properties: {
      rules: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: { kind: { type: "STRING", enum: ["A", "", "B"] } },
        },
      },
    },
  });
  const props = out?.properties as Record<string, { items?: { properties?: Record<string, { enum?: string[] }> } }>;
  assert.deepEqual(props.rules.items?.properties?.kind.enum, ["A", "B"]);
});

test("sanitizeSchema 保留合法欄位不變", () => {
  const schema = {
    type: "OBJECT",
    properties: {
      reply: { type: "STRING", description: "說明" },
      count: { type: "INTEGER" },
    },
    required: ["reply"],
    propertyOrdering: ["reply", "count"],
  };
  const out = sanitizeSchema(schema);
  assert.deepEqual(out, schema);
});

test("sanitizeSchema 對空物件與無內容 OBJECT 回傳 null（改走純文字模式）", () => {
  assert.equal(sanitizeSchema({}), null);
  assert.equal(sanitizeSchema({ type: "OBJECT" }), null);
  assert.equal(sanitizeSchema({ type: "OBJECT", properties: {} }), null);
});

// ── parseJsonLoose ──────────────────────────────────────────
test("parseJsonLoose 解析乾淨 JSON", () => {
  assert.deepEqual(parseJsonLoose('{"a":1,"b":"x"}'), { a: 1, b: "x" });
});

test("parseJsonLoose 去除 markdown 圍欄", () => {
  assert.deepEqual(parseJsonLoose('```json\n{"a":1}\n```'), { a: 1 });
});

test("parseJsonLoose 忽略 JSON 前的雜訊", () => {
  assert.deepEqual(parseJsonLoose('好的，結果如下：{"a":1}'), { a: 1 });
});

test("parseJsonLoose 修補被截斷的 JSON，保住已完成的欄位", () => {
  const full = JSON.stringify({
    reply: "ok",
    rule: { name: "進度落後", kind: "CONDITION", threshold: 5 },
  });
  // 在多個位置截斷，皆不應拋錯
  for (let cut = 10; cut < full.length; cut += 7) {
    const r = parseJsonLoose<{ reply?: string; rule?: Record<string, unknown> }>(
      full.slice(0, cut),
    );
    assert.ok(r === null || typeof r === "object", `cut@${cut} 應為 null 或物件`);
  }
  // 截在 rule 內部時，reply 與已完成的鍵應救回
  const cut = full.indexOf('"threshold"');
  const r = parseJsonLoose<{ reply?: string; rule?: Record<string, unknown> }>(
    full.slice(0, cut),
  );
  assert.equal(r?.reply, "ok");
  assert.equal(r?.rule?.name, "進度落後");
});

test("parseJsonLoose 對完全不含 JSON 的散文回傳 null", () => {
  assert.equal(parseJsonLoose("我建議你設定一個進度落後的規則喔！"), null);
});

test("parseJsonLoose 對無法修補的內容回傳 null 而非拋錯", () => {
  assert.equal(parseJsonLoose("{{{{"), null);
});
