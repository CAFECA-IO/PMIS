import { test } from "node:test";
import assert from "node:assert/strict";

import * as faith from "@/service/faith.service";
import { DOMAINS } from "@/constant/domain-knowledge";

/**
 * 解讀契約詳細價目表：數量與單價會直接成為對外估驗計價的依據。
 *
 * 因此這裡驗的重點不是「能不能讀到」，而是「讀不確定時會不會亂填」——
 * 模型輸出「約 1,200」「詳如附件」時若被解析成一個數字，
 * 台帳上會出現一個看起來精確、實際上是猜的計價基礎。
 */

type Captured = {
  systemInstruction: { parts: { text: string }[] };
  contents: { parts: { text?: string }[] }[];
  generationConfig: {
    responseSchema?: {
      properties?: {
        workItems?: { items?: { properties?: Record<string, unknown>; propertyOrdering?: string[] } };
      };
    };
  };
};

function stub(workItems: unknown[]) {
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
            content: {
              parts: [{ text: JSON.stringify({ reply: "已解讀", workItems }) }],
            },
          },
        ],
      }),
    };
  }) as unknown as typeof fetch;
  return { sent, restore: () => void (globalThis.fetch = original) };
}

const INPUT = {
  messages: [{ role: "user" as const, text: "請解讀契約的工程分項與數量。" }],
  documentText:
    "本工程詳細價目表：基礎開挖 23,830 m3 單價 1,280 元；ϕ1350mm 主幹管推進 6,400 m。",
};

const PACKAGES = [
  { name: "土建工程", category: "土方", description: "", scopeRefs: ["水資中心"] },
];

test("契約明列的數量與單價被讀入", async () => {
  const { restore } = stub([
    {
      name: "水資中心基礎開挖與支撐",
      workPackage: "土建工程",
      wbsCode: "WBS-1.1",
      unit: "m3",
      contractQty: "23,830",
      unitPrice: "1,280",
    },
  ]);
  try {
    const result = await faith.extractWorkItems(INPUT, [], PACKAGES);
    const w = result.data[0];
    assert.equal(w.unit, "m3");
    assert.equal(w.contractQty, 23830, "千分位逗號應被去除");
    assert.equal(w.unitPrice, 1280);
    assert.equal(w.wbsCode, "WBS-1.1");
  } finally {
    restore();
  }
});

test("模糊或非數字的數量一律留空，不得變成看似精確的數字", async () => {
  const { restore } = stub([
    { name: "甲項", workPackage: "土建工程", contractQty: "約 1200", unitPrice: "詳如附件" },
    { name: "乙項", workPackage: "土建工程", contractQty: "暫估", unitPrice: "" },
    { name: "丙項", workPackage: "土建工程", contractQty: "1,137", unitPrice: "28500" },
  ]);
  try {
    const { data } = await faith.extractWorkItems(INPUT, [], PACKAGES);
    assert.equal(data[0].contractQty, undefined, "「約 1200」不是明確數量");
    assert.equal(data[0].unitPrice, undefined);
    assert.equal(data[1].contractQty, undefined, "「暫估」不是數量");
    assert.equal(data[2].contractQty, 1137, "明確數字仍要讀進來");
    assert.equal(data[2].unitPrice, 28500);
  } finally {
    restore();
  }
});

test("負數與非法數值被拒絕", async () => {
  const { restore } = stub([
    { name: "甲項", workPackage: "土建工程", contractQty: "-50", unitPrice: "NaN" },
  ]);
  try {
    const { data } = await faith.extractWorkItems(INPUT, [], PACKAGES);
    assert.equal(data[0].contractQty, undefined);
    assert.equal(data[0].unitPrice, undefined);
  } finally {
    restore();
  }
});

test("模型漏填單位時，以知識庫的參考單位補上", async () => {
  const water = DOMAINS.find((d) => d.id === "water")!;
  const known = water.workItems.find((w) => w.unit === "組")!;
  const { restore } = stub([{ name: known.name, workPackage: "土建工程" }]);
  try {
    const { data } = await faith.extractWorkItems(INPUT, [], PACKAGES);
    assert.equal(
      data[0].unit,
      known.unit,
      `「${known.name}」應以參考單位 ${known.unit} 補上`,
    );
  } finally {
    restore();
  }
});

test("契約明寫的單位優先於參考單位", async () => {
  const water = DOMAINS.find((d) => d.id === "water")!;
  const known = water.workItems.find((w) => w.unit === "組")!;
  const { restore } = stub([
    { name: known.name, workPackage: "土建工程", unit: "台" },
  ]);
  try {
    const { data } = await faith.extractWorkItems(INPUT, [], PACKAGES);
    assert.equal(data[0].unit, "台", "參考值只是預設，不該蓋掉契約寫的單位");
  } finally {
    restore();
  }
});

test("名稱不在知識庫時單位留空，由使用者於台帳補", async () => {
  const { restore } = stub([
    { name: "某個知識庫沒有的特殊分項", workPackage: "土建工程" },
  ]);
  try {
    const { data } = await faith.extractWorkItems(INPUT, [], PACKAGES);
    assert.equal(data[0].unit, undefined);
  } finally {
    restore();
  }
});

test("送出的 schema 要求單位、數量與單價，且不要求複價", async () => {
  const { sent, restore } = stub([]);
  try {
    await faith.extractWorkItems(INPUT, [], PACKAGES);
    const props =
      sent[0].generationConfig.responseSchema?.properties?.workItems?.items
        ?.properties ?? {};
    for (const key of ["unit", "contractQty", "unitPrice", "wbsCode"]) {
      assert.ok(key in props, `schema 缺少 ${key}`);
    }
    for (const derived of ["contractAmount", "completionRate", "amount"]) {
      assert.ok(
        !(derived in props),
        `${derived} 應由系統計算，不該向模型索取`,
      );
    }
  } finally {
    restore();
  }
});

test("提示詞明確禁止推估數量與單價", async () => {
  const { sent, restore } = stub([]);
  try {
    await faith.extractWorkItems(INPUT, [], PACKAGES);
    const prompt = sent[0].systemInstruction.parts[0].text;
    assert.match(prompt, /只有契約明列時才填/);
    assert.match(prompt, /詳細價目表/);
    assert.match(prompt, /不要輸出複價/);
  } finally {
    restore();
  }
});
