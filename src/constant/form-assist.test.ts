import { test } from "node:test";
import assert from "node:assert/strict";

import { FORM_ASSIST_SPECS, findAssistSpec } from "./form-assist";
import { buildFieldSchema, validateSpec } from "@/service/form-assist";
import * as faith from "@/service/faith.service";

/**
 * 規格寫錯的代價是執行期才被模型以 400 拒收，且只有使用者會遇到。
 * 這裡對每一份已註冊的規格做檢核，讓錯誤在測試階段就暴露。
 */
test("每一份已註冊的表單規格都通過檢核", () => {
  for (const [id, spec] of Object.entries(FORM_ASSIST_SPECS)) {
    assert.deepEqual(validateSpec(spec), [], `規格 ${id} 有問題`);
  }
});

test("查表的 id 與規格自身的 id 一致", () => {
  for (const [id, spec] of Object.entries(FORM_ASSIST_SPECS)) {
    assert.equal(spec.id, id);
  }
});

test("每份規格都能產生合法的 schema（無空 enum）", () => {
  for (const spec of Object.values(FORM_ASSIST_SPECS)) {
    const values = buildFieldSchema(spec.fields).properties!.values.properties!;
    for (const [name, node] of Object.entries(values)) {
      if (node.enum) {
        assert.ok(node.enum.length > 0, `${spec.id}.${name} 的 enum 為空`);
        assert.ok(
          node.enum.every((v) => v.trim() !== ""),
          `${spec.id}.${name} 的 enum 含空字串`,
        );
      }
    }
  }
});

test("不納入指向其他紀錄的 id 欄位（模型無從判讀資料庫 id）", () => {
  for (const spec of Object.values(FORM_ASSIST_SPECS)) {
    for (const field of spec.fields) {
      assert.ok(
        !/Id$/.test(field.name),
        `${spec.id} 不應包含 id 欄位：${field.name}`,
      );
    }
  }
});

test("找不到的 id 回 null，不得回一份預設規格", () => {
  assert.equal(findAssistSpec("does-not-exist"), null);
  assert.equal(findAssistSpec(undefined), null);
  assert.equal(findAssistSpec(""), null);
});

test("已註冊的 id 都查得到", () => {
  for (const id of Object.keys(FORM_ASSIST_SPECS)) {
    assert.ok(findAssistSpec(id), `${id} 查不到`);
  }
});

// ── 以 stub 驅動真實的擷取流程 ────────────────────────────────
test("表單助手送出的提示詞含欄位清單與可選值", async () => {
  process.env.AI_KEY = "test-key";
  const spec = FORM_ASSIST_SPECS.obligation;
  let captured: {
    systemInstruction: { parts: { text: string }[] };
    generationConfig: { responseSchema?: unknown; maxOutputTokens?: number };
  } | null = null;
  const original = globalThis.fetch;

  globalThis.fetch = (async (_u: string, init: { body: string }) => {
    captured = JSON.parse(init.body);
    return {
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    values: {
                      title: "每月10日前提送月報",
                      stage: "CONSTRUCTION",
                      weight: "5",
                      // 刻意加入規格外欄位與格式錯誤的值
                      dueDate: "2026-02-30",
                      inventedField: "應被丟棄",
                    },
                    reply: "已判讀契約第五條",
                  }),
                },
              ],
            },
          },
        ],
      }),
    };
  }) as unknown as typeof fetch;

  try {
    const r = await faith.extractFormFields(spec, {
      messages: [{ role: "user", text: "每月10日前要交月報" }],
    });
    const prompt = captured!.systemInstruction.parts[0].text;
    assert.match(prompt, /新增履約事項/, "提示詞應點明表單名稱");
    assert.match(prompt, /title（履約事項）/, "應列出欄位");
    assert.match(prompt, /可選值：/, "限定選項須列出可選值");
    assert.match(prompt, /判讀不到的欄位一律省略/, "須明確禁止臆測");
    assert.equal(r.reply, "已判讀契約第五條");
    assert.equal(
      (r.data as Record<string, unknown>).title,
      "每月10日前提送月報",
    );
  } finally {
    globalThis.fetch = original;
  }
});

test("模型回傳的規格外欄位與錯誤格式，在驗證後不會進入表單", async () => {
  const { sanitizePatch } = await import("@/service/form-assist");
  const spec = FORM_ASSIST_SPECS.obligation;
  const { patch, rejected } = sanitizePatch(spec.fields, {
    title: "每月10日前提送月報",
    stage: "CONSTRUCTION",
    weight: "5",
    dueDate: "2026-02-30",
    inventedField: "應被丟棄",
  });
  assert.deepEqual(Object.keys(patch).sort(), ["stage", "title", "weight"]);
  assert.deepEqual(rejected, ["期限"], "2月30日不存在，應被拒");
  assert.ok(!("inventedField" in patch));
});
