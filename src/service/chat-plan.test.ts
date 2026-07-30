import { test } from "node:test";
import assert from "node:assert/strict";

import * as faith from "@/service/faith.service";

/**
 * 驗證送往 Gemini 的實際請求。
 *
 * 兩個已被踩過的地雷 ——
 *  1. enum 內容為空會被 API 以 400 拒收（見 sanitizeSchema）。使用者若沒有
 *     任何模組權限，datasetIds 就是空陣列，正好會產生那種 schema。
 *  2. 欄位生成順序即思考順序：reason 必須排在 needed 之前，
 *     否則模型會先挑好再補理由，挑選品質明顯下降。
 */

type Captured = {
  systemInstruction: { parts: { text: string }[] };
  contents: { role: string; parts: { text?: string }[] }[];
  generationConfig: {
    responseSchema?: {
      properties?: Record<string, { enum?: string[] }>;
      propertyOrdering?: string[];
      required?: string[];
    };
    responseMimeType?: string;
    maxOutputTokens?: number;
    thinkingConfig?: { thinkingBudget?: number };
  };
};

function stub(reply: unknown) {
  process.env.AI_KEY = "test-key";
  const original = globalThis.fetch;
  const sent: Captured[] = [];
  globalThis.fetch = (async (_u: string, init: { body: string }) => {
    sent.push(JSON.parse(init.body) as Captured);
    return {
      ok: true,
      json: async () => ({
        candidates: [
          {
            finishReason: "STOP",
            content: { parts: [{ text: JSON.stringify(reply) }] },
          },
        ],
      }),
    };
  }) as unknown as typeof fetch;
  return { sent, restore: () => void (globalThis.fetch = original) };
}

const MANIFEST = [
  "專案：捷運藍線",
  "",
  "可調閱的檔案（以代號指認）：",
  "- F1. 01.契約本文(正).docx｜位置：捷運藍線 / 契約文件｜大小：200 KB｜可讀",
  "",
  "可查詢的系統資料：",
  "- obligations：履約事項，契約應辦事項的期限與狀態",
].join("\n");

test("規劃結果被正確解析", async () => {
  const { sent, restore } = stub({
    reason: "問的是契約工期，須查契約條文",
    needed: true,
    files: ["F1"],
    datasets: ["obligations"],
  });
  try {
    const plan = await faith.planRetrieval({
      question: "本案工期是多少日曆天？",
      manifest: MANIFEST,
      datasetIds: ["obligations"],
    });
    assert.equal(plan?.needed, true);
    assert.deepEqual(plan?.files, ["F1"]);
    assert.deepEqual(plan?.datasets, ["obligations"]);
    assert.equal(sent.length, 1, "規劃只該呼叫一次");
  } finally {
    restore();
  }
});

test("理由排在挑選之前，迫使模型先判斷再挑", async () => {
  const { sent, restore } = stub({ reason: "x", needed: false, files: [], datasets: [] });
  try {
    await faith.planRetrieval({
      question: "工期？",
      manifest: MANIFEST,
      datasetIds: ["obligations"],
    });
    const ordering = sent[0].generationConfig.responseSchema?.propertyOrdering;
    assert.deepEqual(ordering, ["reason", "needed", "files", "datasets"]);
    assert.equal(ordering?.[0], "reason");
  } finally {
    restore();
  }
});

test("使用者無任何模組權限時不送出空 enum（會被 API 以 400 拒收）", async () => {
  const { sent, restore } = stub({ reason: "x", needed: false, files: [], datasets: [] });
  try {
    await faith.planRetrieval({
      question: "工期？",
      manifest: MANIFEST,
      datasetIds: [],
    });
    const props = sent[0].generationConfig.responseSchema?.properties ?? {};
    for (const [key, value] of Object.entries(props)) {
      assert.ok(
        !("enum" in value) || (value.enum?.length ?? 0) > 0,
        `${key} 不得帶空的 enum`,
      );
    }
  } finally {
    restore();
  }
});

test("清冊與問題都真的送進請求", async () => {
  const { sent, restore } = stub({ reason: "x", needed: false, files: [], datasets: [] });
  try {
    await faith.planRetrieval({
      question: "本案工期是多少日曆天？",
      manifest: MANIFEST,
      datasetIds: ["obligations"],
    });
    const text = sent[0].contents
      .flatMap((c) => c.parts.map((p) => p.text ?? ""))
      .join("\n");
    assert.match(text, /F1\. 01\.契約本文\(正\)\.docx/, "清冊必須送出，否則模型只能猜代號");
    assert.match(text, /本案工期是多少日曆天/);
    assert.match(sent[0].systemInstruction.parts[0].text, /資料檢索規劃者/);
  } finally {
    restore();
  }
});

test("規劃是結構化輸出，且思考預算有明確上限", async () => {
  const { sent, restore } = stub({ reason: "x", needed: false, files: [], datasets: [] });
  try {
    await faith.planRetrieval({
      question: "工期？",
      manifest: MANIFEST,
      datasetIds: ["obligations"],
    });
    const cfg = sent[0].generationConfig;
    assert.equal(cfg.responseMimeType, "application/json");
    assert.ok((cfg.maxOutputTokens ?? 0) > 0);
    assert.ok(
      (cfg.thinkingConfig?.thinkingBudget ?? 0) > 0,
      "未指定思考預算時，思考會吃光輸出額度導致截斷",
    );
    assert.ok(
      (cfg.thinkingConfig?.thinkingBudget ?? 0) < (cfg.maxOutputTokens ?? 0),
      "思考預算須小於總輸出上限",
    );
  } finally {
    restore();
  }
});

test("輸出無法解析時回 null，由呼叫端決定退路", async () => {
  const { restore } = stub("這不是 JSON");
  try {
    const plan = await faith.planRetrieval({
      question: "工期？",
      manifest: MANIFEST,
      datasetIds: ["obligations"],
    });
    assert.equal(plan, null);
  } finally {
    restore();
  }
});

test("回答那一段會帶上檢索到的上下文與多份原檔", async () => {
  const { sent, restore } = stub({});
  try {
    globalThis.fetch = (async (_u: string, init: { body: string }) => {
      sent.push(JSON.parse(init.body) as Captured);
      return {
        ok: true,
        json: async () => ({
          candidates: [
            { finishReason: "STOP", content: { parts: [{ text: "工期為 730 日曆天。" }] } },
          ],
        }),
      };
    }) as unknown as typeof fetch;

    const text = await faith.chat(
      [{ role: "user", text: "本案工期？" }],
      undefined,
      {
        context: "【文件：契約.docx】\n第三條 工期為開工後 730 日曆天。",
        attachments: [
          { mimeType: "application/pdf", data: "AAAA", name: "圖說.pdf" },
          { mimeType: "image/jpeg", data: "BBBB", name: "照片.jpg" },
        ],
      },
    );
    assert.match(text, /730/);

    const body = sent[sent.length - 1];
    const parts = body.contents.flatMap((c) => c.parts as Record<string, unknown>[]);
    const textParts = parts
      .map((p) => (typeof p.text === "string" ? p.text : ""))
      .join("\n");
    assert.match(textParts, /730 日曆天/, "檢索到的上下文必須送出");
    const inline = parts.filter((p) => "inlineData" in p);
    assert.equal(inline.length, 2, "兩份原檔都要送出，不能只送第一份");
    assert.ok(
      (body.generationConfig.maxOutputTokens ?? 0) >= 4096,
      "帶著檢索資料的回答較長，上限須放寬否則會被截斷",
    );
  } finally {
    restore();
  }
});

test("沒有檢索資料時沿用原本較小的輸出上限", async () => {
  const { sent, restore } = stub({});
  try {
    globalThis.fetch = (async (_u: string, init: { body: string }) => {
      sent.push(JSON.parse(init.body) as Captured);
      return {
        ok: true,
        json: async () => ({
          candidates: [{ finishReason: "STOP", content: { parts: [{ text: "好的。" }] } }],
        }),
      };
    }) as unknown as typeof fetch;
    await faith.chat([{ role: "user", text: "你好" }]);
    assert.equal(sent[sent.length - 1].generationConfig.maxOutputTokens, 1024);
  } finally {
    restore();
  }
});
