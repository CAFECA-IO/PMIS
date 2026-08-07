/**
 * Info: (20260804 - Julian)
 * 五層骨架組裝器測試：法定欄位不遺漏、合計正確、四週期用詞、空資料不崩、圖表圍欄語法正確。
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { buildReportMarkdown, type ReportTemplateInput } from "./report-template";

const base: ReportTemplateInput = {
  type: "MONTHLY",
  periodLabel: "2026 年 5 月",
  periodStart: new Date("2026-05-01"),
  periodEnd: new Date("2026-05-31"),
  generatedAt: new Date("2026-06-01"),
  project: {
    name: "XX 街區清理工程計劃",
    code: "PMIS-2026-001",
    client: "A 單位",
    contractor: "乙公司",
    supervisor: "甲公司",
    budget: 300_000_000,
    startDate: new Date("2024-01-02"),
    endDate: new Date("2030-01-02"),
  },
  scopeItems: ["人孔 20 座", "排水口 300 處"],
  duration: { total: 3000, elapsed: 1000, remaining: 2000, usedPercent: 33.3 },
  progress: {
    currentPlanned: 3,
    currentActual: 4,
    cumulativePlanned: 40.01,
    cumulativeActual: 50,
  },
  curve: [
    { label: "4月", planned: 37.01, actual: 46 },
    { label: "5月", planned: 40.01, actual: 50 },
  ],
  workItems: [
    {
      code: "1-1",
      name: "管線工程",
      contractAmount: 40_000_000,
      cumulativePercent: 70,
      cumulativeAmount: 30_000_000,
      currentPercent: null,
      currentAmount: null,
    },
    {
      code: "1-2",
      name: "雜項",
      contractAmount: 300_000,
      cumulativePercent: 30,
      cumulativeAmount: 800_000,
      currentPercent: null,
      currentAmount: null,
    },
  ],
  workDays: { working: 22, weatherStop: 5, earthquakeStop: 0, holiday: 4, noSchedule: 0, otherStop: 0, unclassified: 0, excludedDays: 0, total: 31 },
  dailyLogs: [
    {
      reportDate: new Date("2026-05-01"),
      weather: "晴",
      summary: "化冀池打除：XX 街 1-10 號。",
      keyNotes: null,
    },
    {
      reportDate: new Date("2026-05-05"),
      weather: "雨",
      summary: "本日下雨，暫停施工。",
      keyNotes: "帷幕滲水待改善",
    },
  ],
  review: "本月完成 4.00%，高於預定 3.00%。",
};

test("五層標題齊備、法定識別欄位不遺漏", () => {
  const md = buildReportMarkdown(base);
  for (const h of [
    "## 一、工程基本資料",
    "## 二、本月摘要",
    "## 三、進度分析",
    "## 四、工作事項",
    "## 五、簽章",
  ]) {
    assert.ok(md.includes(h), `缺少章節 ${h}`);
  }
  for (const field of [
    "主辦單位",
    "監造單位",
    "承攬廠商",
    "工程名稱",
    "開工日期",
    "預定完工日期",
    "契約金額",
    "契約工期",
  ]) {
    assert.ok(md.includes(field), `缺少法定欄位 ${field}`);
  }
  assert.ok(md.includes("A 單位") && md.includes("乙公司") && md.includes("甲公司"));
  assert.ok(md.includes("300,000,000 元"));
  assert.ok(md.includes("3,000 工作天"));
});

test("工程概要逐項條列", () => {
  const md = buildReportMarkdown(base);
  assert.ok(md.includes("- 人孔 20 座"));
  assert.ok(md.includes("- 排水口 300 處"));
});

test("工項明細合計正確（合約金額與累計金額加總）", () => {
  const md = buildReportMarkdown(base);
  assert.ok(md.includes("**合計**"), "應有合計列");
  assert.ok(md.includes("**40,300,000**"), "合約金額合計 = 40,000,000 + 300,000");
  assert.ok(md.includes("**30,800,000**"), "累計金額合計 = 30,000,000 + 800,000");
  assert.ok(md.includes("**100.0%**"), "權重合計應為 100.0%");
});

test("單位權重按合約金額比例計算", () => {
  const md = buildReportMarkdown(base);
  // 40,000,000 / 40,300,000 = 99.256...% → 99.3%
  assert.ok(md.includes("99.3%"), "管線工程權重應為 99.3%");
});

test("落差以「超前 N 個百分點」表述，不使用達成率", () => {
  const md = buildReportMarkdown(base);
  assert.ok(md.includes("超前 9.99 個百分點"));
  assert.ok(!md.includes("達成率"), "不應出現自創指標『達成率』");
});

test("本期無日報數量紀錄時顯示 — 並加註原因", () => {
  // base 的 workItems 兩列的 currentPercent／currentAmount 皆為 null
  const md = buildReportMarkdown(base);
  assert.ok(
    md.includes("尚無已提送或已核備的日報數量紀錄"),
    "應註明本期完成暫缺的原因",
  );
});

test("部分工項無本期數量時，說明合計未含這些項目（避免被誤讀為總和）", () => {
  const md = buildReportMarkdown({
    ...base,
    workItems: [
      {
        code: "1-1",
        name: "管線工程",
        contractAmount: 40_000_000,
        cumulativePercent: 70,
        cumulativeAmount: 30_000_000,
        currentPercent: 2,
        currentAmount: 2_000_000,
      },
      {
        // 未計量工項：本期兩欄恆為 null，其金額不會進合計
        code: "1-2",
        name: "雜項",
        contractAmount: null,
        cumulativePercent: 30,
        cumulativeAmount: null,
        currentPercent: null,
        currentAmount: null,
      },
    ],
  });
  assert.ok(
    md.includes("1 項工程項目本期無日報數量紀錄"),
    "混合情況應說明有幾項缺本期值",
  );
  assert.ok(
    md.includes("合計未包含這些項目"),
    "須明講合計未涵蓋，否則會被讀成全部工項的總和",
  );
  assert.ok(
    !md.includes("本期尚無已提送或已核備的日報數量紀錄"),
    "並非全部缺值，不應印出全缺的說明",
  );
});

test("草稿日報天數列於工作統計，說明其未計入（決策 G）", () => {
  const md = buildReportMarkdown({ ...base, excludedDraftDays: 3 });
  assert.ok(md.includes("草稿未計入"), "應列出被排除的天數");
  assert.ok(md.includes("| 草稿未計入 | 3 天 |"), "天數應正確");
  assert.ok(
    md.includes("尚未提送"),
    "須說明原因，否則會被誤認為資料遺失",
  );
});

test("無草稿日報時不出現草稿列", () => {
  assert.ok(!buildReportMarkdown(base).includes("草稿未計入"));
  assert.ok(
    !buildReportMarkdown({ ...base, excludedDraftDays: 0 }).includes("草稿未計入"),
  );
});

test("有日報數量時填入本期完成欄位，且不再出現暫缺註記", () => {
  // 決策 A：本期完成 = 期間內該工項的日報 dailyQty 之和
  const md = buildReportMarkdown({
    ...base,
    workItems: [
      {
        code: "1-1",
        name: "管線工程",
        contractAmount: 40_000_000,
        cumulativePercent: 70,
        cumulativeAmount: 30_000_000,
        currentPercent: 2,
        currentAmount: 2_000_000,
      },
      {
        code: "1-2",
        name: "雜項",
        contractAmount: 300_000,
        cumulativePercent: 30,
        cumulativeAmount: 800_000,
        // 本期未施作。0 與 null 意義不同：此列為「確實沒做」
        currentPercent: 0,
        currentAmount: 0,
      },
    ],
  });

  assert.ok(
    !md.includes("尚無已提送或已核備的日報數量紀錄"),
    "有資料時不應再出現暫缺註記",
  );
  assert.ok(md.includes("**2,000,000**"), "本期完成金額合計應補齊");
  // 3.2 進度圖的第三欄即本期增量
  assert.ok(md.includes("管線工程, 70, 2"), "進度圖應帶入本期增量作為第三欄");
});

test("圖表圍欄語法正確（custom-scurve / custom-progress / mermaid pie）", () => {
  const md = buildReportMarkdown(base);
  assert.ok(md.includes("```custom-scurve"));
  assert.ok(md.includes("4月, 37.01, 46"), "S-Curve 資料列格式");
  assert.ok(md.includes("```custom-progress"));
  assert.ok(md.includes("管線工程, 70"), "進度圖資料列格式");
  assert.ok(md.includes("```mermaid"));
  assert.ok(md.includes('"天氣因素停工" : 5'));
});

test("逐日明細完整列出，含星期與重要事項", () => {
  const md = buildReportMarkdown(base);
  assert.ok(md.includes("| 05/01 | 五 | 晴 |"));
  assert.ok(md.includes("| 05/05 | 二 | 雨 |"));
  assert.ok(md.includes("重要：帷幕滲水待改善"));
});

test("四種週期用詞正確替換，不寫死本月", () => {
  const weekly = buildReportMarkdown({ ...base, type: "WEEKLY" });
  assert.ok(weekly.includes("## 二、本週摘要"));
  assert.ok(weekly.includes("本週完成百分比"));
  assert.ok(!weekly.includes("本月摘要"));

  const annual = buildReportMarkdown({ ...base, type: "ANNUAL" });
  assert.ok(annual.includes("## 二、本年摘要"));
  assert.ok(annual.includes("年報"), "標題應含報表名稱");
});

test("評述為 null 時以決定論句子回退", () => {
  const md = buildReportMarkdown({ ...base, review: null });
  assert.ok(md.includes("累計完成 50.00%"));
  assert.ok(md.includes("超前 9.99 個百分點"));
});

test("空資料不崩：無工項、無日誌、無概要、契約工期未填", () => {
  const md = buildReportMarkdown({
    ...base,
    scopeItems: [],
    workItems: [],
    dailyLogs: [],
    curve: [],
    workDays: { working: 0, weatherStop: 0, earthquakeStop: 0, holiday: 0, noSchedule: 0, otherStop: 0, unclassified: 0, excludedDays: 0, total: 0 },
    duration: { total: null, elapsed: null, remaining: null, usedPercent: null },
    project: { ...base.project, budget: null, startDate: null, endDate: null },
    review: null,
  });
  assert.ok(md.includes("本期無工程分項資料"));
  assert.ok(md.includes("本期無監造日報填報紀錄"));
  assert.ok(md.includes("## 五、簽章"), "空資料仍應有簽章層");
  assert.ok(!md.includes("undefined") && !md.includes("NaN"));
  assert.ok(!md.includes("```custom-progress"), "無工項時不應輸出進度圖");
});

test("表格單元內的 | 與換行被安全轉義", () => {
  const md = buildReportMarkdown({
    ...base,
    dailyLogs: [
      {
        reportDate: new Date("2026-05-02"),
        weather: "晴",
        summary: "A|B\n第二行",
        keyNotes: null,
      },
    ],
  });
  const row = md.split("\n").find((l) => l.startsWith("| 05/02")) ?? "";
  assert.ok(row.includes("A／B"), "| 應轉為全形以免破壞表格");
  assert.ok(row.includes("<br>"), "換行應轉為 <br>");
  assert.equal(row.split("|").length - 1, 5, "欄數應維持 4 欄（5 個分隔符）");
});
