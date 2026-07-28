import { test } from "node:test";
import assert from "node:assert/strict";

import { runExtraction, type WizardEvent } from "./wizardExtract.service";

/**
 * 以 stub 取代 Gemini 回應，驅動真實的編排邏輯（非 mock 掉編排本身）。
 * 每次呼叫依 systemInstruction 判斷是哪一段，回傳對應的假 JSON。
 */
type StubMap = Partial<Record<
  "profile" | "obligations" | "owners" | "workItems",
  unknown | (() => never)
>>;

function stubGemini(map: StubMap) {
  const calls: string[] = [];
  const original = globalThis.fetch;
  process.env.AI_KEY = "test-key";

  globalThis.fetch = (async (_url: string, init: { body: string }) => {
    const body = JSON.parse(init.body) as {
      systemInstruction: { parts: { text: string }[] };
    };
    const prompt = body.systemInstruction.parts[0].text;

    // 以各段提示詞獨有的句子辨識；不可只比對「工程分項」等詞，
    // 因為其他段的提示詞會以否定句提到它（如「不要輸出…工程分項」）
    let which: keyof StubMap;
    if (prompt.includes("本次只需擷取「專案基本資料」")) which = "profile";
    else if (prompt.includes("本次只需擷取「履約事項」")) which = "obligations";
    else if (prompt.includes("回填責任分工與契約依據")) which = "owners";
    else if (prompt.includes("本次只需擷取「工程分項」")) which = "workItems";
    else throw new Error(`stub 無法辨識提示詞：${prompt.slice(0, 80)}`);
    calls.push(which);

    const entry = map[which];
    if (typeof entry === "function") {
      // 模擬該段呼叫失敗
      return { ok: false, status: 500, json: async () => ({ error: { message: "模擬失敗" } }) };
    }
    return {
      ok: true,
      json: async () => ({
        candidates: [
          { content: { parts: [{ text: JSON.stringify(entry ?? {}) }] } },
        ],
      }),
    };
  }) as unknown as typeof fetch;

  return {
    calls,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

async function collect(gen: AsyncGenerator<WizardEvent>) {
  const out: WizardEvent[] = [];
  for await (const e of gen) out.push(e);
  return out;
}

const FULL: StubMap = {
  profile: {
    reply: "已讀取契約首頁",
    fields: {
      code: "PMIS-2026-009",
      name: "測試工程",
      client: "某機關",
      startDate: "2026-01-01",
      endDate: "2027-12-31",
      budget: "1000000",
      status: "ACTIVE",
    },
  },
  obligations: {
    reply: "盤點到 2 項",
    obligations: [
      { title: "開工", stage: "CONSTRUCTION", dueDate: "2026-01-15", weight: 10 },
      { title: "連續壁完成", stage: "CONSTRUCTION", dueDate: "2026-08-30", weight: 30 },
    ],
  },
  owners: {
    owners: [
      { title: "開工", ownerUnit: "工務組", ownerName: "林監造", contractBasis: "契約第五條" },
      { title: "不存在的事項", ownerUnit: "應被忽略" },
    ],
  },
  workItems: {
    workItems: [
      { name: "連續壁施工", obligation: "連續壁完成", category: "結構" },
      { name: "孤兒分項", obligation: "查無此事項" },
    ],
  },
};

test("四段依序執行，事件順序為 running → data → done", async () => {
  const stub = stubGemini(FULL);
  try {
    const events = await collect(
      runExtraction({ messages: [{ role: "user", text: "請解析" }] }),
    );
    assert.deepEqual(stub.calls, ["profile", "obligations", "owners", "workItems"]);

    const profile = events.filter((e) => "step" in e && e.step === "profile");
    assert.equal(profile[0].type, "status");
    assert.equal((profile[0] as { state: string }).state, "running");
    assert.equal(profile[1].type, "data");
    assert.equal((profile[2] as { state: string }).state, "done");

    const last = events.at(-1)!;
    assert.equal(last.type, "done");
    assert.deepEqual((last as { failed: string[] }).failed, []);
  } finally {
    stub.restore();
  }
});

test("基本資料回報已填欄位數與總數", async () => {
  const stub = stubGemini(FULL);
  try {
    const events = await collect(runExtraction({ messages: [] }));
    const done = events.find(
      (e) => e.type === "status" && e.step === "profile" && e.state === "done",
    ) as { count: number; total: number; note?: string };
    assert.equal(done.total, 11);
    assert.equal(done.count, 7, "stub 提供 7 個欄位");
    assert.equal(done.note, "已讀取契約首頁");
  } finally {
    stub.restore();
  }
});

test("責任分工只套用到對應得上的事項，孤兒名稱被忽略", async () => {
  const stub = stubGemini(FULL);
  try {
    const events = await collect(runExtraction({ messages: [] }));
    const data = events.filter(
      (e) => e.type === "data" && e.step === "owners",
    ) as { obligations: { title: string; ownerUnit?: string }[] }[];
    const obs = data[0].obligations;
    assert.equal(obs.length, 2, "不應因孤兒名稱新增事項");
    assert.equal(obs.find((o) => o.title === "開工")!.ownerUnit, "工務組");
    assert.equal(obs.find((o) => o.title === "連續壁完成")!.ownerUnit, undefined);

    const done = events.find(
      (e) => e.type === "status" && e.step === "owners" && e.state === "done",
    ) as { count: number; total: number };
    assert.equal(done.count, 1);
    assert.equal(done.total, 2);
  } finally {
    stub.restore();
  }
});

test("工程分項清掉無法對應的歸屬，並補上編號與起訖日", async () => {
  const stub = stubGemini(FULL);
  try {
    const events = await collect(runExtraction({ messages: [] }));
    const data = events.filter(
      (e) => e.type === "data" && e.step === "workItems",
    ) as {
      workItems: {
        name: string;
        code?: string;
        obligation?: string;
        plannedStart?: string;
      }[];
    }[];
    const items = data[0].workItems;
    assert.equal(items.length, 2);
    assert.equal(items.find((w) => w.name === "連續壁施工")!.obligation, "連續壁完成");
    assert.equal(
      items.find((w) => w.name === "孤兒分項")!.obligation,
      undefined,
      "對應不到的歸屬應清空",
    );
    assert.ok(items.every((w) => w.code), "所有分項都應有編號");
    assert.ok(items.every((w) => w.plannedStart), "起訖日應被補齊");
  } finally {
    stub.restore();
  }
});

test("單段失敗不影響其他段：其餘資料完整保留", async () => {
  const stub = stubGemini({ ...FULL, owners: () => { throw new Error("x"); } });
  try {
    const events = await collect(runExtraction({ messages: [] }));

    const failedEvent = events.find(
      (e) => e.type === "status" && e.state === "failed",
    ) as { step: string; error: string };
    assert.equal(failedEvent.step, "owners");
    assert.match(failedEvent.error, /Gemini API 錯誤|模擬失敗/);

    // 履約事項與工程分項仍有資料
    const obData = events.filter(
      (e) => e.type === "data" && e.step === "obligations",
    ) as { obligations: unknown[] }[];
    assert.equal(obData[0].obligations.length, 2);
    const wiData = events.filter(
      (e) => e.type === "data" && e.step === "workItems",
    ) as { workItems: unknown[] }[];
    assert.equal(wiData[0].workItems.length, 2);

    const last = events.at(-1) as { type: string; failed: string[] };
    assert.deepEqual(last.failed, ["owners"], "done 事件應列出失敗段落");
  } finally {
    stub.restore();
  }
});

test("履約事項為空時，責任分工段標為略過而非失敗", async () => {
  const stub = stubGemini({ ...FULL, obligations: { obligations: [] } });
  try {
    const events = await collect(runExtraction({ messages: [] }));
    const skipped = events.find(
      (e) => e.type === "status" && e.step === "owners",
    ) as { state: string; reason?: string };
    assert.equal(skipped.state, "running");
    const settled = events.find(
      (e) => e.type === "status" && e.step === "owners" && e.state === "skipped",
    ) as { reason: string };
    assert.match(settled.reason, /尚無履約事項/);
    const last = events.at(-1) as { failed: string[] };
    assert.deepEqual(last.failed, [], "略過不算失敗");
  } finally {
    stub.restore();
  }
});

test("only 參數只跑指定段落（單段重試）", async () => {
  const stub = stubGemini(FULL);
  try {
    const events = await collect(
      runExtraction({
        messages: [],
        only: ["owners"],
        known: {
          fields: { code: "KEEP" },
          obligations: [{ title: "開工" }],
          workItems: [],
        },
      }),
    );
    assert.deepEqual(stub.calls, ["owners"], "只應呼叫責任分工一次");
    const data = events.find(
      (e) => e.type === "data" && e.step === "owners",
    ) as { obligations: { title: string; ownerUnit?: string }[] };
    assert.equal(data.obligations[0].ownerUnit, "工務組");
  } finally {
    stub.restore();
  }
});

test("重試時沿用已知草稿，不會重複既有履約事項", async () => {
  const stub = stubGemini(FULL);
  try {
    const events = await collect(
      runExtraction({
        messages: [],
        only: ["obligations"],
        known: { obligations: [{ title: "開工" }] },
      }),
    );
    const data = events.find(
      (e) => e.type === "data" && e.step === "obligations",
    ) as { obligations: { title: string }[] };
    assert.deepEqual(
      data.obligations.map((o) => o.title),
      ["開工", "連續壁完成"],
      "既有的開工不應重複",
    );
  } finally {
    stub.restore();
  }
});
