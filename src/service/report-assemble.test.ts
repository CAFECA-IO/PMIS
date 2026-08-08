import { test } from "node:test";
import assert from "node:assert/strict";

import {
  assembleReport,
  type AssembleInput,
  type DailyReportRow,
  type LedgerWorkItem,
} from "./report-assemble";
import type { WorkItemDetail } from "@/service/project.service";

/**
 * 月報組裝的行為測試。
 *
 * 這裡的每一個案例都對應一個**真的發生過**的缺陷，而且它們全都不是算式錯誤，
 * 是組裝錯誤：餵了「至今」而非期末、預定與完成算在不同母體、
 * 決策 G 只套一半、缺值以 0 代入。先前這一段只有原始碼字串比對守著 ——
 * 那種測試守得住「有沒有人拆掉接線」，守不住「接對了沒」。
 */

const d = (iso: string) => new Date(`${iso}T00:00:00`);

/** 預定 2026-01-01 ~ 2026-12-31、契約量 100 的工項。 */
const wi = (
  id: string,
  over: Partial<WorkItemDetail> = {},
): WorkItemDetail =>
  ({
    id,
    name: id,
    status: "IN_PROGRESS",
    obligationId: null,
    weight: 1,
    plannedStart: d("2026-01-01"),
    plannedEnd: d("2026-12-31"),
    actualStart: null,
    actualEnd: null,
    progress: 0,
    contractQty: 100,
    completedQty: 0,
    ...over,
  }) as WorkItemDetail;

const ledger = (
  id: string,
  over: Partial<LedgerWorkItem> = {},
): LedgerWorkItem => ({
  id,
  code: id,
  wbsCode: null,
  name: id,
  contractQty: 100,
  unitPrice: 1000,
  completedQty: 0,
  progress: 0,
  ...over,
});

const daily = (
  iso: string,
  over: Partial<DailyReportRow> = {},
): DailyReportRow => ({
  reportDate: d(iso),
  weather: "晴",
  summary: "澆置",
  keyNotes: null,
  stopReason: null,
  excludedFromDuration: false,
  status: "SUBMITTED",
  ...over,
});

function build(over: Partial<AssembleInput> = {}) {
  const base: AssembleInput = {
    type: "MONTHLY",
    typeLabel: "月報",
    period: {
      start: d("2026-02-01"),
      end: new Date("2026-02-28T23:59:59.999"),
      label: "2026 年 2 月",
    },
    project: {
      name: "測試工程",
      code: "T-001",
      client: null,
      contractor: null,
      supervisor: null,
      budget: 1_000_000,
      startDate: d("2026-01-01"),
      endDate: d("2026-12-31"),
      contractWorkDays: 365,
      scopeTitles: [],
    },
    dailyReports: [],
    workItemDetails: [wi("a")],
    ledgerWorkItems: [ledger("a")],
    cumulativeQtyTotals: new Map(),
    periodQtyTotals: new Map(),
    ...over,
  };
  return assembleReport(base);
}

// ── 決策 G：草稿不計入，且必須被揭露 ────────────────────────

test("草稿日報不進施工天數，也不進逐日明細", () => {
  /*
    先前只在數量側套決策 G：4.1 的施工天數與 4.2 的逐日明細照樣含草稿，
    3.3 的數量卻只計已提送者 —— 同一份法定文件裡兩套母體。
  */
  const r = build({
    dailyReports: [
      daily("2026-02-03"),
      daily("2026-02-04", { status: "APPROVED" }),
      daily("2026-02-05", { status: "DRAFT", summary: "草稿內容" }),
    ],
  });
  assert.equal(r.template.workDays.total, 2, "草稿不計入工作日統計");
  assert.equal(r.template.dailyLogs.length, 2);
  assert.ok(
    !r.template.dailyLogs.some((l) => l.summary === "草稿內容"),
    "草稿不得出現在逐日明細",
  );
  assert.equal(r.template.excludedDraftDays, 1, "被排除的天數必須揭露");
  assert.ok(r.facts.includes("2 篇"), `事實摘要也要用同一個母體：${r.facts}`);
});

test("全部都是草稿時，excludedDraftDays 等於全部", () => {
  const r = build({
    dailyReports: [
      daily("2026-02-03", { status: "DRAFT" }),
      daily("2026-02-04", { status: "DRAFT" }),
    ],
  });
  assert.equal(r.template.workDays.total, 0);
  assert.equal(r.template.excludedDraftDays, 2);
});

// ── 累計的時間上限 ──────────────────────────────────────────

test("累計欄位只用傳入的「截至期末」加總，不受本期加總影響", () => {
  /*
    補產舊月報時，累計必須是期末當下的值。呼叫端負責把上限傳對
    （`loadDailyQtyTotalsUpTo(projectId, qEnd)`），本函式負責不把兩者搞混：
    累計欄取 cumulative、本期欄取 period，接反了就會印出
    「累計超前」這種當時並不存在的數字。
  */
  const r = build({
    cumulativeQtyTotals: new Map([["a", 30]]),
    periodQtyTotals: new Map([["a", 10]]),
  });
  const row = r.template.workItems[0];
  assert.equal(row.cumulativePercent, 30, "累計＝期初 0 + 截至期末 30");
  assert.equal(row.currentPercent, 10, "本期＝期間內 10");
  assert.equal(row.cumulativeAmount, 30_000);
  assert.equal(row.currentAmount, 10_000);
});

test("期初基準會併入累計，但不影響本期", () => {
  const r = build({
    ledgerWorkItems: [ledger("a", { completedQty: 20 })],
    cumulativeQtyTotals: new Map([["a", 30]]),
    periodQtyTotals: new Map([["a", 10]]),
  });
  assert.equal(r.template.workItems[0].cumulativePercent, 50, "20 期初 + 30");
  assert.equal(r.template.workItems[0].currentPercent, 10);
});

// ── 本期「0」與「無資料」是兩件事 ───────────────────────────

test("本期完全無數量紀錄時，本期欄為 null 而非 0", () => {
  const r = build({ periodQtyTotals: new Map() });
  assert.equal(r.template.workItems[0].currentPercent, null);
  assert.equal(r.template.workItems[0].currentAmount, null);
});

test("本期有紀錄但某工項沒有時，該工項本期為 0", () => {
  const r = build({
    workItemDetails: [wi("a"), wi("b")],
    ledgerWorkItems: [ledger("a"), ledger("b")],
    periodQtyTotals: new Map([["a", 10]]),
  });
  const b = r.template.workItems.find((w) => w.name === "b")!;
  assert.equal(b.currentPercent, 0, "有母體可據時，沒出現＝確實沒做");
});

// ── 預定與完成必須算在同一批工項上 ──────────────────────────

test("無預定起訖日的工項不進整體進度比對，且排除數要揭露", () => {
  /*
    先前完成側納入、預定側排除：1 個排程工項做完 100%、
    另有 3 個無預定日的工項，會算出預定 100%、完成 25%，
    報表宣稱落後 75 個百分點 —— 而那個數字會進入工期展延爭議。
  */
  const done = wi("done", { progress: 100 });
  const unscheduled = [1, 2, 3].map((i) =>
    wi(`u${i}`, { plannedStart: null, plannedEnd: null, progress: 0 }),
  );
  const r = build({
    workItemDetails: [done, ...unscheduled],
    ledgerWorkItems: [ledger("done"), ...unscheduled.map((u) => ledger(u.id))],
  });

  /*
    只有 done 進入比對，所以完成是 100 而不是被三個 0 稀釋成的 25。
    這一項若回歸，數值會掉到 25 而預定仍是排程工項的值 —— 正是那個假落差。
  */
  assert.equal(r.template.progress.cumulativeActual, 100);
  assert.equal(r.template.unscheduledWorkItems, 3);
  assert.ok(
    r.facts.includes("另有 3 項工程分項未設定預定起訖日"),
    `事實摘要須揭露排除數：${r.facts}`,
  );
  // 未納入比對不等於被忽略：3.3 仍列出全部四項
  assert.equal(r.template.workItems.length, 4);
});

test("完全沒有具預定起訖日的工項時，累計預定與完成皆為 null 而非 0", () => {
  /*
    先前以 0 代入，於是沒填預定日的專案會印出「累計預定 0.00%」
    並宣告「超前 45 個百分點」。缺值與 0 在送審文件上意義完全不同。
  */
  const none = wi("x", {
    plannedStart: null,
    plannedEnd: null,
    progress: 45,
  });
  const r = build({
    workItemDetails: [none],
    ledgerWorkItems: [ledger("x")],
  });
  assert.equal(r.template.progress.cumulativePlanned, null);
  assert.equal(r.template.progress.cumulativeActual, null);
  assert.equal(r.template.progress.currentPlanned, null);
  assert.ok(
    r.facts.includes("累計預定進度 —%"),
    `缺值須以「—」呈現，不得寫成 0：${r.facts}`,
  );
  assert.ok(
    r.facts.includes("缺預定或完成值，無法比對落差"),
    "不得宣稱與預定相符",
  );
});

test("同一批工項時，累計預定與完成的母體一致", () => {
  // 全部工項都有預定日 → 排除數為 0，兩側算在同一批上
  const r = build({
    workItemDetails: [wi("a", { progress: 50 }), wi("b", { progress: 50 })],
    ledgerWorkItems: [ledger("a"), ledger("b")],
  });
  assert.equal(r.template.unscheduledWorkItems, 0);
  assert.equal(r.template.progress.cumulativeActual, 50);
  assert.ok(
    r.template.progress.cumulativePlanned != null,
    "有預定日就該算得出預定值",
  );
  assert.ok(r.facts.includes("全部工程分項均已設定預定起訖日"));
});

// ── 缺契約數量：百分比為 null 但金額仍可能有值 ──────────────

test("無契約數量的工項：本期百分比為 null，金額仍算得出來", () => {
  const r = build({
    ledgerWorkItems: [ledger("a", { contractQty: null, unitPrice: 500 })],
    periodQtyTotals: new Map([["a", 4]]),
  });
  const row = r.template.workItems[0];
  assert.equal(row.currentPercent, null, "沒有契約數量就算不出百分比");
  assert.equal(row.currentAmount, 2000, "但單價 × 數量仍是金額");
});

// ── 期間邊界 ────────────────────────────────────────────────

test("本期預定增量以期初前一刻為基準，不把期初當日算進上一期", () => {
  const r = build();
  const { currentPlanned, cumulativePlanned } = r.template.progress;
  assert.ok(currentPlanned != null && cumulativePlanned != null);
  assert.ok(currentPlanned > 0, "二月應有預定增量");
  assert.ok(
    currentPlanned < cumulativePlanned,
    "本期增量必小於累計（專案自一月開工）",
  );
});

// ── 專案基本資料原樣傳遞 ────────────────────────────────────

test("Decimal 型別的契約金額於邊界轉為 number", () => {
  const r = build({
    project: {
      ...build().template.project,
      // Prisma Decimal 在邊界會以字串形式出現
      budget: "2500000" as unknown as number,
      contractWorkDays: 365,
      scopeTitles: ["人孔 20 座"],
    } as AssembleInput["project"],
  });
  assert.equal(r.template.project.budget, 2_500_000);
  assert.deepEqual(r.template.scopeItems, ["人孔 20 座"]);
});
