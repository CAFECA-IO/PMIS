import { test } from "node:test";
import assert from "node:assert/strict";

import { runExtraction, type WizardEvent } from "./wizardExtract.service";

/**
 * 以 stub 取代 Gemini 回應，驅動真實的編排邏輯（非 mock 掉編排本身）。
 * 每次呼叫依 systemInstruction 判斷是哪一段，回傳對應的假 JSON。
 */
type StubMap = Partial<Record<
  "profile" | "scope" | "obligations" | "owners" | "packages" | "workItems",
  unknown | (() => never)
>>;

function stubGemini(map: StubMap) {
  const calls: string[] = [];
  /** 各段實際送出的使用者內容，用於驗證段落間傳遞的脈絡。 */
  const sent: Record<string, string> = {};
  const original = globalThis.fetch;
  process.env.AI_KEY = "test-key";

  globalThis.fetch = (async (_url: string, init: { body: string }) => {
    const body = JSON.parse(init.body) as {
      systemInstruction: { parts: { text: string }[] };
      contents?: { parts?: { text?: string }[] }[];
    };
    const prompt = body.systemInstruction.parts[0].text;

    // 以各段提示詞獨有的句子辨識；不可只比對「工程分項」等詞，
    // 因為其他段的提示詞會以否定句提到它（如「不要輸出…工程分項」）
    let which: keyof StubMap;
    if (prompt.includes("本次只需擷取「專案基本資料」")) which = "profile";
    else if (prompt.includes("逐項照抄**出來")) which = "scope";
    else if (prompt.includes("本次只需規劃「工程項目」")) which = "packages";
    // 只匹配該段獨有的完整句子：短詞（如「履約標的」）在其他段的提示詞中
    // 也會出現（含出現在否定句裡），會讓 stub 認錯段落
    else if (prompt.includes("本次只需擷取「履約事項」")) which = "obligations";
    else if (prompt.includes("回填責任分工與契約依據")) which = "owners";
    else if (prompt.includes("細分為「工程分項」")) which = "workItems";
    else throw new Error(`stub 無法辨識提示詞：${prompt.slice(0, 80)}`);
    calls.push(which);
    sent[which] = (body.contents ?? [])
      .flatMap((c) => (c.parts ?? []).map((p) => p.text ?? ""))
      .join("\n");

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
    sent,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

/** 解析一定要有契約全文；沒有文件時三段會依設計略過（見 wizard-source）。 */
const DOC = "檔名：契約.docx\n第二條 履約標的…";

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
  scope: {
    reply: "依第二條抄出 3 項",
    scopeItems: [
      { code: "(一)", title: "施工計畫審查", sourceClause: "第二條 履約標的" },
      { code: "(二)", title: "連續壁施作", sourceClause: "第二條 履約標的" },
      { code: "(三)", title: "工區品質巡查", sourceClause: "第二條 履約標的" },
    ],
  },
  packages: {
    reply: "規劃 2 個工程項目",
    packages: [
      { name: "計畫書審查作業", category: "審查", scopeRefs: ["施工計畫審查"] },
      { name: "連續壁工程", category: "結構", scopeRefs: ["連續壁施作"] },
    ],
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
      {
        name: "連續壁施工",
        obligation: "連續壁完成",
        category: "結構",
        workPackage: "連續壁工程",
      },
      { name: "孤兒分項", obligation: "查無此事項", workPackage: "查無此項目" },
    ],
  },
};

test("六個階段依序執行，事件順序為 running → data → done", async () => {
  const stub = stubGemini(FULL);
  try {
    const events = await collect(
      runExtraction({
        messages: [{ role: "user", text: "請解析" }],
        documentText: DOC,
      }),
    );
    assert.deepEqual(stub.calls, [
      "profile",
      "scope",
      "obligations",
      "owners",
      "packages",
      "workItems",
    ]);

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

// ── 階段一：履約標的 ────────────────────────────────────────
test("階段一獨立產出履約標的，並隨 data 事件傳出", async () => {
  const stub = stubGemini(FULL);
  try {
    const events = await collect(runExtraction({ messages: [], documentText: DOC }));
    const data = events.find(
      (e) => e.type === "data" && e.step === "scope",
    ) as { scopeItems?: { code?: string; title: string }[] };
    assert.deepEqual(
      data.scopeItems?.map((s) => s.title),
      ["施工計畫審查", "連續壁施作", "工區品質巡查"],
    );
    assert.equal(data.scopeItems?.[0].code, "(一)");
  } finally {
    stub.restore();
  }
});

test("階段二收到階段一的履約標的清單", async () => {
  const stub = stubGemini(FULL);
  try {
    await collect(runExtraction({ messages: [], documentText: DOC }));
    const sent = stub.sent.packages;
    assert.match(sent, /履約標的/, "應帶入履約標的清單");
    for (const title of ["施工計畫審查", "連續壁施作", "工區品質巡查"]) {
      assert.match(sent, new RegExp(title), `清單應含「${title}」`);
    }
    // 項次編號一併帶入，模型才能沿用契約的編號
    assert.match(sent, /\(一\) 施工計畫審查/);
  } finally {
    stub.restore();
  }
});

test("階段三收到階段二的工程項目清單，而非履約標的", async () => {
  const stub = stubGemini(FULL);
  try {
    await collect(runExtraction({ messages: [], documentText: DOC }));
    const sent = stub.sent.workItems;
    assert.match(sent, /工程項目清單/, "應帶入工程項目");
    assert.match(sent, /計畫書審查作業/);
    assert.match(sent, /連續壁工程/);
    assert.ok(
      sent.indexOf("工程項目清單") < sent.indexOf("可歸屬的履約事項"),
      "工程項目是本段的輸入，應先出現",
    );
  } finally {
    stub.restore();
  }
});

test("工程分項由所屬工程項目繼承來源，可溯源到契約標的", async () => {
  const stub = stubGemini(FULL);
  try {
    const events = await collect(
      runExtraction({ messages: [], documentText: DOC }),
    );
    const data = events.find(
      (e) => e.type === "data" && e.step === "workItems",
    ) as { workItems?: { name: string; workPackage?: string; scopeRef?: string }[] };
    const hit = data.workItems?.find((w) => w.name === "連續壁施工");
    assert.equal(hit?.workPackage, "連續壁工程");
    assert.equal(hit?.scopeRef, "連續壁施作", "來源應由工程項目繼承");

    // 對應不到清單的工程項目名稱要被丟棄，不得留下孤兒分群
    const orphan = data.workItems?.find((w) => w.name === "孤兒分項");
    assert.equal(orphan?.workPackage, undefined);
    assert.equal(orphan?.scopeRef, undefined);
  } finally {
    stub.restore();
  }
});

test("單獨重試階段三時沿用傳入的工程項目", async () => {
  const stub = stubGemini(FULL);
  try {
    await collect(
      runExtraction({
        messages: [],
        documentText: DOC,
        only: ["workItems"],
        known: {
          obligations: [{ title: "連續壁完成" }],
          packages: [{ name: "連續壁工程", scopeRefs: ["連續壁施作"] }],
        },
      }),
    );
    assert.deepEqual(stub.calls, ["workItems"], "只應呼叫階段三");
    assert.match(stub.sent.workItems, /連續壁工程/, "工程項目須沿用");
  } finally {
    stub.restore();
  }
});

test("沒有履約標的時，推導型的段落一律略過而非編造", async () => {
  const stub = stubGemini(FULL);
  try {
    const events = await collect(
      runExtraction({
        messages: [],
        documentText: DOC,
        only: ["obligations", "packages"],
        known: { fields: { code: "AB-1" } },
      }),
    );
    assert.deepEqual(stub.calls, [], "不得呼叫模型");
    for (const step of ["obligations", "packages"]) {
      const skipped = events.find(
        (e) => e.type === "status" && e.step === step && e.state === "skipped",
      ) as { reason?: string } | undefined;
      assert.ok(skipped, `${step} 應略過`);
      assert.match(skipped!.reason ?? "", /履約標的/);
    }
  } finally {
    stub.restore();
  }
});

test("履約標的不混入「已確認草稿」脈絡，避免被當成使用者資料", async () => {
  const stub = stubGemini(FULL);
  try {
    await collect(
      runExtraction({
        messages: [],
        documentText: DOC,
        only: ["profile"],
        known: { scopeItems: [{ title: "只該出現在第四段的工作" }] },
      }),
    );
    assert.doesNotMatch(
      stub.sent.profile ?? "",
      /只該出現在第四段的工作/,
      "scopeItems 不屬於已確認草稿",
    );
  } finally {
    stub.restore();
  }
});

test("階段一沒抄出履約標的時，後續推導段落一律略過", async () => {
  const stub = stubGemini({
    ...FULL,
    scope: { reply: "找不到履約標的條", scopeItems: [] },
  });
  try {
    const events = await collect(runExtraction({ messages: [], documentText: DOC }));
    for (const step of ["obligations", "packages"]) {
      const skipped = events.find(
        (e) => e.type === "status" && e.step === step && e.state === "skipped",
      );
      assert.ok(skipped, `${step} 應略過而非硬跑`);
    }
    assert.ok(!stub.calls.includes("obligations"));
    assert.ok(!stub.calls.includes("packages"));
  } finally {
    stub.restore();
  }
});

test("重複抄錄的履約標的會去重，否則下游也會跟著重複", async () => {
  const stub = stubGemini({
    ...FULL,
    scope: {
      scopeItems: [
        { title: "工區品質巡查" },
        { title: "工區品質巡查" },
        { title: "土石方抽驗" },
      ],
    },
  });
  try {
    const events = await collect(runExtraction({ messages: [], documentText: DOC }));
    const data = events.find(
      (e) => e.type === "data" && e.step === "scope",
    ) as { scopeItems?: { title: string }[] };
    assert.deepEqual(
      data.scopeItems?.map((s) => s.title),
      ["工區品質巡查", "土石方抽驗"],
    );
  } finally {
    stub.restore();
  }
});

test("基本資料回報已填欄位數與總數", async () => {
  const stub = stubGemini(FULL);
  try {
    const events = await collect(runExtraction({ messages: [], documentText: DOC }));
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
    const events = await collect(runExtraction({ messages: [], documentText: DOC }));
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
    const events = await collect(runExtraction({ messages: [], documentText: DOC }));
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
    const events = await collect(runExtraction({ messages: [], documentText: DOC }));

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
    const events = await collect(runExtraction({ messages: [], documentText: DOC }));
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
        documentText: DOC,
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
        documentText: DOC,
        only: ["obligations"],
        known: {
          obligations: [{ title: "開工" }],
          // 前一輪讀出的履約標的由前端帶回，否則本段會因缺上游而略過
          scopeItems: [{ code: "(二)", title: "連續壁施作" }],
        },
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

// ── 重現 2026-07-28：補專案編號時不該重跑契約解析 ──────────────
test("已解析過後只打字補資料：只重跑基本資料，一次模型呼叫", async () => {
  const stub = stubGemini(FULL);
  try {
    const events = await collect(
      runExtraction({
        // 使用者只回了專案編號，沒有再附檔案
        messages: [{ role: "user", text: "AB-0123" }],
        known: {
          fields: { name: "桃園市埔頂計畫區污水下水道系統促參計畫" },
          obligations: [{ title: "每月10日前提送月報" }],
        },
      }),
    );
    assert.deepEqual(
      stub.calls,
      ["profile"],
      "先前會跑四段共約兩分鐘；補一個編號不該重新解讀契約",
    );
    // 其餘三段完全不出現在事件中
    for (const step of ["obligations", "owners", "workItems"]) {
      const seen = events.some((e) => "step" in e && e.step === step);
      assert.equal(seen, false, `${step} 不應執行`);
    }
  } finally {
    stub.restore();
  }
});

test("沒有契約可讀時，三段標為略過並說明如何補救（不得憑空生成）", async () => {
  const stub = stubGemini(FULL);
  try {
    const events = await collect(
      // 沒有 documentText 也沒有附件：紀錄中模型曾在此情況編出整份假的履約標的
      runExtraction({ messages: [{ role: "user", text: "AB-0123" }] }),
    );
    assert.deepEqual(
      stub.calls,
      ["profile"],
      "依賴契約的三段不得呼叫模型",
    );
    for (const step of ["obligations", "owners", "workItems"]) {
      const skipped = events.find(
        (e) =>
          e.type === "status" && e.step === step && e.state === "skipped",
      ) as { reason?: string } | undefined;
      assert.ok(skipped, `${step} 應標為略過`);
      assert.match(skipped!.reason ?? "", /缺少契約文件/);
      assert.match(skipped!.reason ?? "", /重新上傳/, "須告知補救方式");
    }
  } finally {
    stub.restore();
  }
});

test("重試單段時只要有契約（含由歸檔重讀者）就能執行", async () => {
  const stub = stubGemini(FULL);
  try {
    await collect(
      runExtraction({
        messages: [],
        // 伺服器由歸檔重讀契約後填入
        documentText: DOC,
        only: ["obligations"],
        known: {
          fields: { code: "AB-0123" },
          // 前一輪已讀出的履約標的由前端帶回
          scopeItems: [{ code: "(二)", title: "連續壁施作" }],
        },
      }),
    );
    assert.deepEqual(stub.calls, ["obligations"]);
  } finally {
    stub.restore();
  }
});

test("重試單段但完全沒有契約：略過而非編造", async () => {
  const stub = stubGemini(FULL);
  try {
    const events = await collect(
      runExtraction({ messages: [], only: ["obligations"] }),
    );
    assert.deepEqual(stub.calls, [], "不得呼叫模型");
    const skipped = events.find(
      (e) =>
        e.type === "status" && e.step === "obligations" && e.state === "skipped",
    );
    assert.ok(skipped);
  } finally {
    stub.restore();
  }
});

test("重新附上檔案時跑完整四段（換文件本來就該全部重讀）", async () => {
  const stub = stubGemini(FULL);
  try {
    await collect(
      runExtraction({
        messages: [],
        attachment: { mimeType: "application/pdf", data: "AAAA" },
        known: { fields: { code: "AB-0123" }, obligations: [{ title: "舊事項" }] },
      }),
    );
    assert.deepEqual(stub.calls, [
      "profile",
      "scope",
      "obligations",
      "owners",
      "packages",
      "workItems",
    ]);
  } finally {
    stub.restore();
  }
});

test("從未解析過且只有文字描述：仍跑完整流程，給純文字建案的機會", async () => {
  const stub = stubGemini(FULL);
  try {
    await collect(
      runExtraction({
        messages: [{ role: "user", text: "幫我建一個案，每月10日要交月報" }],
        documentText: DOC,
      }),
    );
    assert.equal(stub.calls.length, 6);
  } finally {
    stub.restore();
  }
});
