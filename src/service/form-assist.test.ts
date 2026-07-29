import { test } from "node:test";
import assert from "node:assert/strict";

import {
  MAX_SPEC_FIELDS,
  buildFieldSchema,
  coerceValue,
  describeFields,
  displayValueOf,
  fillSummary,
  offerCopy,
  planFill,
  sanitizePatch,
  validateSpec,
  type FormAssistSpec,
  type FormFieldSpec,
} from "./form-assist";

const f = (over: Partial<FormFieldSpec> & { name: string }): FormFieldSpec => ({
  label: over.name,
  kind: "text",
  ...over,
});

const SPEC: FormAssistSpec = {
  id: "demo",
  title: "新增示範",
  purpose: "測試用",
  fields: [
    f({ name: "title", label: "標題" }),
    f({ name: "amount", label: "金額", kind: "number" }),
    f({ name: "dueDate", label: "期限", kind: "date" }),
    f({
      name: "level",
      label: "等級",
      kind: "select",
      options: [
        { value: "LOW", label: "低" },
        { value: "HIGH", label: "高" },
      ],
    }),
    f({ name: "urgent", label: "急件", kind: "checkbox" }),
  ],
};

// ── validateSpec ────────────────────────────────────────────
test("正常規格通過檢核", () => {
  assert.deepEqual(validateSpec(SPEC), []);
});

test("select 沒有選項時報錯（模型會拿到不可用的 enum）", () => {
  const bad = { ...SPEC, fields: [f({ name: "x", kind: "select" })] };
  assert.ok(validateSpec(bad).some((p) => /沒有 options/.test(p)));
});

test("空字串選項要攔下 —— Gemini 會以 400 拒收整個 schema", () => {
  const bad = {
    ...SPEC,
    fields: [
      f({ name: "x", kind: "select", options: [{ value: "", label: "空" }] }),
    ],
  };
  assert.ok(validateSpec(bad).some((p) => /空字串選項/.test(p)));
});

test("重複的欄位 name 要報錯", () => {
  const bad = { ...SPEC, fields: [f({ name: "a" }), f({ name: "a" })] };
  assert.ok(validateSpec(bad).some((p) => /重複/.test(p)));
});

test("欄位數超過上限要報錯", () => {
  const bad = {
    ...SPEC,
    fields: Array.from({ length: MAX_SPEC_FIELDS + 1 }, (_, i) =>
      f({ name: `x${i}` }),
    ),
  };
  assert.ok(validateSpec(bad).some((p) => /超過上限/.test(p)));
});

test("空欄位清單不算有效規格", () => {
  assert.ok(validateSpec({ ...SPEC, fields: [] }).length > 0);
});

// ── describeFields ──────────────────────────────────────────
test("欄位說明含名稱、標籤與型別", () => {
  const text = describeFields(SPEC.fields);
  assert.match(text, /- title（標題）：文字/);
  assert.match(text, /amount（金額）：數字/);
  assert.match(text, /dueDate（期限）：日期（YYYY-MM-DD）/);
});

test("限定選項欄位列出可選值與其中文標籤", () => {
  const text = describeFields(SPEC.fields);
  assert.match(text, /可選值：LOW=低、HIGH=高/);
});

test("hint 一併帶入，讓模型知道單位等約定", () => {
  const text = describeFields([
    f({ name: "budget", label: "金額", kind: "number", hint: "新台幣元" }),
  ]);
  assert.match(text, /新台幣元/);
});

// ── buildFieldSchema ────────────────────────────────────────
test("schema 以 values 承載欄位，且 values 先於 reply 生成", () => {
  const schema = buildFieldSchema(SPEC.fields);
  assert.deepEqual(schema.propertyOrdering, ["values", "reply"]);
  assert.deepEqual(schema.required, ["values"]);
  assert.deepEqual(
    Object.keys(schema.properties!.values.properties!),
    ["title", "amount", "dueDate", "level", "urgent"],
  );
});

test("所有欄位皆為字串型別，判讀不到可省略", () => {
  const values = buildFieldSchema(SPEC.fields).properties!.values.properties!;
  for (const node of Object.values(values)) {
    assert.equal(node.type, "STRING");
  }
  // 沒有任何欄位是必填 —— 逼模型填值會產生假資料
  assert.equal(buildFieldSchema(SPEC.fields).properties!.values.required, undefined);
});

test("select 欄位帶 enum，其餘不帶", () => {
  const values = buildFieldSchema(SPEC.fields).properties!.values.properties!;
  assert.deepEqual(values.level.enum, ["LOW", "HIGH"]);
  assert.equal(values.title.enum, undefined);
});

// ── coerceValue ─────────────────────────────────────────────
test("數字去除千分位與單位", () => {
  const field = f({ name: "a", kind: "number" });
  assert.equal(coerceValue(field, "1,234,567"), "1234567");
  assert.equal(coerceValue(field, "8000000 元"), "8000000");
  assert.equal(coerceValue(field, " 42 "), "42");
  assert.equal(coerceValue(field, 42), "42");
  assert.equal(coerceValue(field, "3.5"), "3.5");
  assert.equal(coerceValue(field, "-7"), "-7");
});

test("非數字內容不得混進數字欄位", () => {
  const field = f({ name: "a", kind: "number" });
  assert.equal(coerceValue(field, "約八百萬"), null);
  assert.equal(coerceValue(field, "N/A"), null);
  assert.equal(coerceValue(field, ""), null);
});

test("日期須為真實存在的一天", () => {
  const field = f({ name: "d", kind: "date" });
  assert.equal(coerceValue(field, "2026-07-27"), "2026-07-27");
  assert.equal(coerceValue(field, "2026-02-30"), null, "2月沒有30日");
  assert.equal(coerceValue(field, "2026-13-01"), null);
  assert.equal(coerceValue(field, "2026/07/27"), null, "格式不符");
  assert.equal(coerceValue(field, "民國115年7月27日"), null);
});

test("閏年 2月29日 合法，平年不合法", () => {
  const field = f({ name: "d", kind: "date" });
  assert.equal(coerceValue(field, "2028-02-29"), "2028-02-29");
  assert.equal(coerceValue(field, "2027-02-29"), null);
});

test("限定選項只接受可選值，也容許模型回中文標籤", () => {
  const field = SPEC.fields.find((x) => x.name === "level")!;
  assert.equal(coerceValue(field, "HIGH"), "HIGH");
  assert.equal(coerceValue(field, "高"), "HIGH", "回標籤時對應回 value");
  assert.equal(coerceValue(field, "URGENT"), null, "不在選項內一律丟棄");
});

test("checkbox 接受多種是否表達", () => {
  const field = SPEC.fields.find((x) => x.name === "urgent")!;
  assert.equal(coerceValue(field, true), "on");
  assert.equal(coerceValue(field, "true"), "on");
  assert.equal(coerceValue(field, "是"), "on");
  assert.equal(coerceValue(field, false), "");
  assert.equal(coerceValue(field, "否"), "");
  assert.equal(coerceValue(field, "也許"), null);
});

test("null 與 undefined 一律不成立", () => {
  assert.equal(coerceValue(f({ name: "a" }), null), null);
  assert.equal(coerceValue(f({ name: "a" }), undefined), null);
});

// ── sanitizePatch ───────────────────────────────────────────
test("規格外的鍵一律丟棄", () => {
  const { patch } = sanitizePatch(SPEC.fields, {
    title: "測試",
    somethingInvented: "模型自己想的欄位",
  });
  assert.deepEqual(patch, { title: "測試" });
});

test("格式錯誤的值列入 rejected 而非硬塞進表單", () => {
  const { patch, rejected } = sanitizePatch(SPEC.fields, {
    title: "測試",
    amount: "約八百萬",
    dueDate: "2026-02-30",
    level: "MAYBE",
  });
  assert.deepEqual(patch, { title: "測試" });
  assert.deepEqual(rejected, ["金額", "期限", "等級"]);
});

test("未提供的欄位不進 patch 也不算被拒", () => {
  const { patch, rejected } = sanitizePatch(SPEC.fields, { title: "只有標題" });
  assert.deepEqual(Object.keys(patch), ["title"]);
  assert.deepEqual(rejected, []);
});

test("checkbox 為否時不進 patch（不需改動表單）", () => {
  const { patch, rejected } = sanitizePatch(SPEC.fields, { urgent: false });
  assert.deepEqual(patch, {});
  assert.deepEqual(rejected, []);
});

test("非物件輸入不得拋錯", () => {
  assert.deepEqual(sanitizePatch(SPEC.fields, null).patch, {});
  assert.deepEqual(sanitizePatch(SPEC.fields, "字串").patch, {});
  assert.deepEqual(sanitizePatch(SPEC.fields, 42).patch, {});
});

// ── planFill：最關鍵的規則 ───────────────────────────────────
test("使用者已填的欄位絕不覆蓋", () => {
  const plan = planFill(
    SPEC.fields,
    { title: "AI 判讀的標題", amount: "5000" },
    { title: "我自己打的標題", amount: "" },
  );
  assert.deepEqual(plan.fill.map((x) => x.name), ["amount"]);
  assert.deepEqual(plan.keptLabels, ["標題"]);
});

test("只有空白的既有值視為未填，可以填入", () => {
  const plan = planFill(SPEC.fields, { title: "AI" }, { title: "   " });
  assert.deepEqual(plan.fill.map((x) => x.name), ["title"]);
  assert.deepEqual(plan.keptLabels, []);
});

test("模型未提供的欄位列為待補", () => {
  const plan = planFill(SPEC.fields, { title: "只有標題" }, {});
  assert.deepEqual(plan.fill.map((x) => x.name), ["title"]);
  assert.deepEqual(plan.missingLabels, ["金額", "期限", "等級", "急件"]);
});

test("空字串的 patch 值不算有值", () => {
  const plan = planFill(SPEC.fields, { title: "" }, {});
  assert.equal(plan.fill.length, 0);
  assert.ok(plan.missingLabels.includes("標題"));
});

test("三種歸類互斥且涵蓋所有欄位", () => {
  const plan = planFill(
    SPEC.fields,
    { title: "A", amount: "1", dueDate: "2026-01-01" },
    { amount: "999" },
  );
  const total =
    plan.fill.length + plan.keptLabels.length + plan.missingLabels.length;
  assert.equal(total, SPEC.fields.length);
});

// ── 文案 ────────────────────────────────────────────────────
test("詢問文案含表單名稱與欄位數", () => {
  const copy = offerCopy({ ...SPEC, accept: ".pdf" });
  assert.match(copy.title, /新增示範/);
  assert.match(copy.description, /5 個欄位/);
  assert.match(copy.description, /上傳/, "可上傳時要說可上傳");
});

test("不可上傳時不謊稱可上傳文件", () => {
  const copy = offerCopy({ ...SPEC, accept: undefined });
  assert.doesNotMatch(copy.description, /上傳/);
});

test("結果說明逐項列出填入的欄位與值", () => {
  const plan = planFill(SPEC.fields, { title: "契約書審查" }, {});
  const text = fillSummary(plan, []);
  assert.match(text, /已為您填入 1 個欄位/);
  assert.match(text, /\*\*標題\*\*：契約書審查/);
  assert.match(text, /核對/, "必須提醒使用者核對");
});

test("完全沒填出東西時不假稱有成果", () => {
  const text = fillSummary(planFill(SPEC.fields, {}, {}), []);
  assert.match(text, /沒有.*判讀出可填入的欄位/);
  assert.doesNotMatch(text, /已為您填入/);
});

test("保留的欄位與被拒的值都要明確告知", () => {
  const plan = planFill(SPEC.fields, { title: "AI" }, { title: "使用者的" });
  const text = fillSummary(plan, ["金額"]);
  assert.match(text, /您已填寫，我保留原值未動：標題/);
  assert.match(text, /不符格式，已捨棄，請手動確認：金額/);
});

test("模型的說明放在最前面，不與欄位清單混雜", () => {
  const plan = planFill(SPEC.fields, { title: "A" }, {});
  const text = fillSummary(plan, [], "這份文件是變更設計核准函。");
  assert.ok(text.startsWith("這份文件是變更設計核准函。"));
});

// ── 顯示值：代碼不該直接給使用者看 ──────────────────────────────
test("限定選項回報中文標籤而非代碼", () => {
  const plan = planFill(SPEC.fields, { level: "HIGH" }, {});
  assert.equal(plan.fill[0].value, "HIGH", "寫進表單的仍是代碼");
  assert.equal(plan.fill[0].display, "高", "給人看的是標籤");
  assert.match(fillSummary(plan, []), /\*\*等級\*\*：高/);
  assert.doesNotMatch(fillSummary(plan, []), /HIGH/);
});

test("勾選欄位回報是／否", () => {
  const plan = planFill(SPEC.fields, { urgent: "on" }, {});
  assert.equal(plan.fill[0].display, "是");
});

test("displayValueOf 對未知代碼退回原值，不隱藏資訊", () => {
  const field = SPEC.fields.find((x) => x.name === "level")!;
  assert.equal(displayValueOf(field, "UNKNOWN_CODE"), "UNKNOWN_CODE");
});

test("被拒的欄位不重複出現在「仍待補」", () => {
  const plan = planFill(SPEC.fields, { title: "A" }, {});
  const text = fillSummary(plan, ["期限"]);
  const occurrences = text.split("期限").length - 1;
  assert.equal(occurrences, 1, "期限只應在「不符格式」出現一次");
  // 專案 target 為 ES2017，不可用 s 旗標，改以 [\s\S] 跨行比對
  assert.match(text, /不符格式[\s\S]*期限/);
});
