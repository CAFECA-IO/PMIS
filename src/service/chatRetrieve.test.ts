import { test } from "node:test";
import assert from "node:assert/strict";

import { retrieveForChat, type RetrieveDeps } from "./chatRetrieve.service";
import { buildManifest, type RawFile } from "./chat-retrieval";
import * as faith from "./faith.service";

/**
 * 驅動真實的檢索編排：規劃結果的解讀、上限套用、上下文組裝與來源說明
 * 都跑實際程式碼，只把「打資料庫」與「呼叫模型」換成 stub。
 *
 * 這裡驗的是行為而非實作：問通則不該去讀合約、問合約要讀到合約全文、
 * 被上限擠掉的檔案必須說出來、任何一環失敗都不能讓對話壞掉。
 */

const VIEWER = { id: "u1", name: "王小明", role: "MEMBER" as const };

const CONTRACT: RawFile = {
  id: "pf1",
  source: "project",
  name: "01.契約本文(正).docx",
  path: "捷運藍線 / 契約文件",
  mimeType:
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  size: 200_000,
  updatedAt: "2026-07-01T00:00:00.000Z",
};

const PHOTO: RawFile = {
  id: "fu1",
  source: "faith",
  name: "現場照片.jpg",
  path: "捷運藍線 / 費思對話上傳",
  mimeType: "image/jpeg",
  size: 500_000,
  updatedAt: "2026-07-20T00:00:00.000Z",
};

const manifestOf = (files: RawFile[] = [CONTRACT, PHOTO]) =>
  buildManifest({
    projectName: "捷運藍線",
    files,
    datasets: [
      { id: "obligations", label: "履約事項", hint: "期限與狀態" },
      { id: "overview", label: "專案概況", hint: "進度與金額" },
    ],
  });

type PlanReturn = Awaited<ReturnType<typeof faith.planRetrieval>>;

/** 記錄各層實際收到什麼，供斷言「規劃真的傳到了載入端」。 */
type Spy = {
  planned: { question: string; manifest: string; datasetIds: string[] }[];
  readFiles: string[];
  readDatasets: string[];
};

function makeDeps(
  plan: PlanReturn | (() => never),
  over: Partial<RetrieveDeps> = {},
  files: RawFile[] = [CONTRACT, PHOTO],
): { deps: RetrieveDeps; spy: Spy } {
  const spy: Spy = { planned: [], readFiles: [], readDatasets: [] };
  const deps: RetrieveDeps = {
    manifest: async () => manifestOf(files),
    plan: async (input) => {
      spy.planned.push(input);
      // 以函式表示「這次呼叫會拋錯」；呼叫後不會回來，故其餘路徑仍是純資料
      if (typeof plan === "function") return plan();
      return plan;
    },
    loadFiles: async (budgeted) => {
      spy.readFiles.push(...budgeted.text.map((f) => f.name));
      spy.readFiles.push(...budgeted.native.map((f) => f.name));
      return {
        sections: budgeted.text.map((f) => ({
          title: `文件：${f.name}`,
          body: `${f.name} 的內文：第三條 工期為開工後 730 日曆天。`,
        })),
        attachments: budgeted.native.map((f) => ({
          mimeType: f.mimeType ?? "",
          data: "ZmFrZQ==",
          name: f.name,
        })),
        failed: [],
      };
    },
    loadDatasets: async (budgeted) => {
      spy.readDatasets.push(...budgeted.datasets.map((d) => d.id));
      return {
        sections: budgeted.datasets.map((d) => ({
          title: d.label,
          body: `${d.label} 共 3 筆`,
        })),
        failed: [],
      };
    },
    ...over,
  };
  return { deps, spy };
}

const ask = (text: string) => ({
  projectId: "p1",
  messages: [{ role: "user" as const, text }],
  viewer: VIEWER,
});

// ── 不需檢索的情況 ──────────────────────────────────────────
test("未鎖定專案時完全不檢索（跨專案檢索會混入別案數字）", async () => {
  const { deps, spy } = makeDeps({ needed: true, files: ["F1"], datasets: [] });
  const r = await retrieveForChat({ ...ask("工期多久？"), projectId: null }, deps);
  assert.equal(r.context, undefined);
  assert.equal(r.note, null);
  assert.equal(spy.planned.length, 0, "不該為了規劃而多花一次呼叫");
  assert.match(r.log, /未鎖定專案/);
});

test("通則問題判定不需檢索時，不讀任何資料", async () => {
  const { deps, spy } = makeDeps({
    needed: false,
    reason: "此為送審流程通則，與本案個別資料無關",
    files: [],
    datasets: [],
  });
  const r = await retrieveForChat(ask("材料送審流程怎麼跑？"), deps);
  assert.equal(r.context, undefined);
  assert.equal(r.note, null, "沒讀東西就不該掛參考來源");
  assert.deepEqual(spy.readFiles, []);
  assert.deepEqual(spy.readDatasets, []);
  assert.match(r.log, /不需檢索/);
  assert.match(r.log, /送審流程通則/, "判斷理由要留在紀錄裡才追得到誤判");
});

test("專案內沒有任何可調閱資料時直接跳過規劃", async () => {
  const { deps, spy } = makeDeps({ needed: true, files: [], datasets: [] }, {
    manifest: async () =>
      buildManifest({ projectName: "空案", files: [], datasets: [] }),
  });
  const r = await retrieveForChat(ask("工期多久？"), deps);
  assert.equal(spy.planned.length, 0);
  assert.match(r.log, /無可調閱資料/);
});

// ── 需要檢索的情況 ──────────────────────────────────────────
test("契約問題會讀出契約全文並注入上下文", async () => {
  const { deps, spy } = makeDeps({
    needed: true,
    reason: "須查契約條文",
    files: ["F1"],
    datasets: [],
  });
  const r = await retrieveForChat(ask("本案工期是多少日曆天？"), deps);

  assert.deepEqual(spy.readFiles, ["01.契約本文(正).docx"]);
  assert.ok(r.context, "應注入上下文");
  assert.match(r.context, /730 日曆天/, "文件內文必須真的進到上下文");
  assert.match(r.context, /不要推測/, "上下文須交代不得推測");
  assert.match(r.note ?? "", /參考：01\.契約本文\(正\)\.docx/);
});

test("規劃時模型看得到清冊與問題本身", async () => {
  const { deps, spy } = makeDeps({ needed: true, files: ["F1"], datasets: [] });
  await retrieveForChat(ask("本案工期是多少日曆天？"), deps);
  const sent = spy.planned[0];
  assert.match(sent.question, /工期/);
  assert.match(sent.manifest, /F1\. 01\.契約本文\(正\)\.docx/);
  assert.deepEqual(sent.datasetIds, ["obligations", "overview"]);
});

test("系統資料被查出並與文件一起注入", async () => {
  const { deps, spy } = makeDeps({
    needed: true,
    files: [],
    datasets: ["obligations", "overview"],
  });
  const r = await retrieveForChat(ask("有哪些逾期事項？"), deps);
  assert.deepEqual(spy.readDatasets, ["obligations", "overview"]);
  assert.match(r.context ?? "", /【履約事項】/);
  assert.match(r.context ?? "", /【專案概況】/);
  assert.match(r.note ?? "", /履約事項、專案概況/);
});

test("影像與 PDF 以原檔附件送出，不進文字上下文", async () => {
  const { deps } = makeDeps({ needed: true, files: ["F2"], datasets: [] });
  const r = await retrieveForChat(ask("這張照片有什麼問題？"), deps);
  assert.equal(r.attachments?.length, 1);
  assert.equal(r.attachments?.[0].name, "現場照片.jpg");
  assert.equal(r.context, undefined, "原檔不該被塞進文字上下文");
  assert.match(r.note ?? "", /現場照片\.jpg/);
});

test("沒有原檔時不帶空的附件陣列", async () => {
  const { deps } = makeDeps({ needed: true, files: ["F1"], datasets: [] });
  const r = await retrieveForChat(ask("工期？"), deps);
  assert.equal(r.attachments, undefined);
});

// ── 誠實回報 ────────────────────────────────────────────────
test("超出上限而未讀的檔案一定寫進來源說明", async () => {
  const many: RawFile[] = [];
  for (let i = 0; i < 5; i++) {
    many.push({ ...CONTRACT, id: `pf${i}`, name: `文件${i}.docx` });
  }
  const { deps } = makeDeps(
    { needed: true, files: ["F1", "F2", "F3", "F4", "F5"], datasets: [] },
    {},
    many,
  );
  const r = await retrieveForChat(ask("這些文件說了什麼？"), deps);
  assert.match(r.note ?? "", /未讀：/, "靜靜少讀一份比明說危險");
  assert.match(r.note ?? "", /超過本次可閱讀的份數/);
});

test("讀取失敗（檔案不見了）要說出來，不假裝讀到了", async () => {
  const { deps } = makeDeps({ needed: true, files: ["F1"], datasets: [] }, {
    loadFiles: async () => ({
      sections: [],
      attachments: [],
      failed: [{ name: "01.契約本文(正).docx", why: "無法取得檔案" }],
    }),
  });
  const r = await retrieveForChat(ask("工期？"), deps);
  assert.equal(r.context, undefined);
  assert.match(r.note ?? "", /讀取失敗：01\.契約本文\(正\)\.docx（無法取得檔案）/);
  assert.match(r.log, /失敗 1/);
});

test("查表無權限時列為失敗而非默默回空", async () => {
  const { deps } = makeDeps({ needed: true, files: [], datasets: ["obligations"] }, {
    loadDatasets: async () => ({
      sections: [],
      failed: [{ name: "履約事項", why: "查無資料或無權查詢" }],
    }),
  });
  const r = await retrieveForChat(ask("有哪些逾期事項？"), deps);
  assert.match(r.note ?? "", /查無資料或無權查詢/);
});

test("模型編造不存在的檔案代號時照樣完成，並留下紀錄", async () => {
  const { deps, spy } = makeDeps({
    needed: true,
    files: ["F1", "F77"],
    datasets: [],
  });
  const r = await retrieveForChat(ask("工期？"), deps);
  assert.deepEqual(spy.readFiles, ["01.契約本文(正).docx"]);
  assert.match(r.log, /無效代號 F77/);
});

// ── 失敗降級 ────────────────────────────────────────────────
test("規劃呼叫拋錯時退回一般對話，不讓整次回答失敗", async () => {
  const { deps } = makeDeps(() => {
    throw new Error("費思忙線中");
  });
  const r = await retrieveForChat(ask("工期？"), deps);
  assert.equal(r.context, undefined);
  assert.equal(r.note, null);
  assert.match(r.log, /規劃失敗/);
});

test("規劃回 null（輸出無法解析）時同樣退回一般對話", async () => {
  const { deps } = makeDeps(null);
  const r = await retrieveForChat(ask("工期？"), deps);
  assert.equal(r.context, undefined);
  assert.match(r.log, /不需檢索/);
});

test("無權存取該專案時不檢索，也不洩漏專案存在與否", async () => {
  const { deps } = makeDeps({ needed: true, files: ["F1"], datasets: [] }, {
    manifest: async () => null,
  });
  const r = await retrieveForChat(ask("工期？"), deps);
  assert.equal(r.context, undefined);
  assert.equal(r.note, null);
  assert.match(r.log, /無權存取/);
});

test("清冊建立拋錯時不影響對話", async () => {
  const { deps } = makeDeps({ needed: true, files: [], datasets: [] }, {
    manifest: async () => {
      throw new Error("資料庫連線失敗");
    },
  });
  const r = await retrieveForChat(ask("工期？"), deps);
  assert.equal(r.note, null);
  assert.match(r.log, /清冊建立失敗/);
});

test("沒有使用者提問（僅附件）時不檢索", async () => {
  const { deps, spy } = makeDeps({ needed: true, files: ["F1"], datasets: [] });
  const r = await retrieveForChat(
    { projectId: "p1", messages: [{ role: "assistant", text: "您好" }], viewer: VIEWER },
    deps,
  );
  assert.equal(spy.planned.length, 0);
  assert.equal(r.note, null);
});

test("多輪對話取最後一則使用者訊息規劃", async () => {
  const { deps, spy } = makeDeps({ needed: true, files: ["F1"], datasets: [] });
  await retrieveForChat(
    {
      projectId: "p1",
      messages: [
        { role: "user", text: "先前的問題" },
        { role: "assistant", text: "回答" },
        { role: "user", text: "本案工期是多少？" },
      ],
      viewer: VIEWER,
    },
    deps,
  );
  assert.equal(spy.planned[0].question, "本案工期是多少？");
});
