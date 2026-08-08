/**
 * Info: (20260804 - Julian)
 * 監造報表（週／月／季／年）五層骨架組裝器。
 *
 * 純函式、決定論：輸入已備妥的資料，輸出完整 markdown。不碰 DB、不呼叫 LLM。
 * 報告結構屬法定格式，故骨架由程式產生、不交由 LLM 自由發揮；LLM 僅提供「期間評述」一段文字。
 * 圖表以 PMIS 現有圍欄語法（```custom-scurve / ```custom-progress / ```mermaid）嵌入，於前端渲染。
 */
import type { ReportType } from "@/service/report.service";
import {
  PERIOD_LABEL,
  PERIOD_REPORT_NAME,
  describeGap,
  type DurationSummary,
  type WorkDayStats,
} from "@/service/report-period";

const NA = "—";

/** 工項明細一列；金額與百分比由呼叫端算好（Decimal 於邊界轉 number）。 */
export interface WorkItemRow {
  /** 項次（WBS 代碼；無則由組裝器以序號補） */
  code: string | null;
  name: string;
  /** 合約金額 = 契約數量 × 單價 */
  contractAmount: number | null;
  /** 累計完成百分比 */
  cumulativePercent: number | null;
  /** 累計完成金額 */
  cumulativeAmount: number | null;
  /**
   * 本期完成百分比／金額 = 期間內該工項的日報 dailyQty 之和（決策 A）。
   *
   * null 代表「本期無數量紀錄可據」（例如尚未導入日報填報），
   * 與 0（本期確實未施作）意義不同，呈現上不可混為一談。
   */
  currentPercent: number | null;
  currentAmount: number | null;
}

/** 逐日日誌一列（明細層，完整保留）。 */
export interface DailyLogRow {
  reportDate: Date;
  weather: string | null;
  summary: string | null;
  keyNotes: string | null;
}

/** S-Curve 一點；預定為必填。 */
export interface ProgressCurvePoint {
  label: string;
  planned: number;
  actual?: number;
  forecast?: number;
}

export interface ReportTemplateInput {
  type: ReportType;
  /** 期間標籤，如「2026 年 5 月」 */
  periodLabel: string;
  periodStart: Date;
  periodEnd: Date;
  generatedAt: Date;

  project: {
    name: string;
    code: string;
    client: string | null;
    contractor: string | null;
    supervisor: string | null;
    /** 契約金額 */
    budget: number | null;
    startDate: Date | null;
    endDate: Date | null;
  };
  /** 工程概要：每項一句（如「人孔 20 座」），取自契約標的 title */
  scopeItems: string[];

  /**
   * 因仍為草稿而未計入本報表的日報天數（決策 G）。
   *
   * 需要呈現，否則使用者看到施工天數偏低會誤以為資料遺失，
   * 而實際原因是那些日報尚未提送。
   */
  excludedDraftDays?: number;

  /**
   * 未設定預定起訖日、因而未納入整體進度比對的工程分項數。
   *
   * 整體進度只能算在同時有預定與完成的工項上。若不揭露排除了幾項，
   * 讀報表的人無從判斷那個百分比涵蓋了多少工作 ——
   * 20 項裡只有 1 項參與比對時，「累計完成 100%」是誤導性的真話。
   */
  unscheduledWorkItems?: number;

  duration: DurationSummary;
  progress: {
    /** 本期預定／完成增量（百分點）；無法計算時為 null */
    currentPlanned: number | null;
    currentActual: number | null;
    /**
     * 累計預定／完成（%）；無可比對的工項時為 null。
     *
     * 刻意允許 null 而不以 0 代入：0 代表「確實毫無進度」，
     * 而缺值代表「無從計算」，兩者在送審文件上的意義完全不同。
     * 呈現層以「—」表示，與餵給 LLM 的事實文字一致。
     */
    cumulativePlanned: number | null;
    cumulativeActual: number | null;
  };
  curve: ProgressCurvePoint[];

  workItems: WorkItemRow[];
  workDays: WorkDayStats;
  dailyLogs: DailyLogRow[];

  /** LLM 產出的期間評述；null 時以決定論句子回退 */
  review: string | null;
}

// ── 格式化助手 ────────────────────────────────────────────────
const fmtInt = (n: number | null): string =>
  n == null ? NA : n.toLocaleString("zh-TW");

const fmtPct = (n: number | null, digits = 2): string =>
  n == null ? NA : `${n.toFixed(digits)}%`;

const fmtDate = (d: Date | null): string => {
  if (d == null) return NA;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const WEEKDAY = ["日", "一", "二", "三", "四", "五", "六"];
const fmtMonthDay = (d: Date): string =>
  `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;

/** 表格單元內換行需用 <br>；同時避免 | 破壞表格結構。 */
const cell = (text: string): string =>
  text.replace(/\|/g, "／").replace(/\n+/g, "<br>");

// ── 各層組裝 ──────────────────────────────────────────────────

function sectionHeader(input: ReportTemplateInput): string[] {
  const name = PERIOD_REPORT_NAME[input.type];
  return [
    `# ${input.project.name}｜${input.periodLabel}${name}`,
    "",
    `> 報告期間 ${fmtDate(input.periodStart)} ~ ${fmtDate(input.periodEnd)}｜產生時間 ${fmtDate(input.generatedAt)}`,
    "> **本報告為費思 AI 生成草稿；數字由系統彙整、圖表由既有數據集展開；核定前請人工確認。**",
    "",
  ];
}

function sectionBasics(input: ReportTemplateInput): string[] {
  const p = input.project;
  const out = [
    "## 一、工程基本資料",
    "",
    "| 項目 | 內容 | 項目 | 內容 |",
    "| --- | --- | --- | --- |",
    `| 主辦單位 | ${cell(p.client ?? NA)} | 監造單位 | ${cell(p.supervisor ?? NA)} |`,
    `| 承攬廠商 | ${cell(p.contractor ?? NA)} | 工程名稱 | ${cell(p.name)} |`,
    `| 開工日期 | ${fmtDate(p.startDate)} | 預定完工日期 | ${fmtDate(p.endDate)} |`,
    `| 契約金額 | ${p.budget == null ? NA : `${fmtInt(p.budget)} 元`} | 契約工期 | ${
      input.duration.total == null ? NA : `${fmtInt(input.duration.total)} 工作天`
    } |`,
    "",
  ];

  if (input.scopeItems.length > 0) {
    out.push("**工程概要**", "");
    for (const item of input.scopeItems) out.push(`- ${item}`);
    out.push("");
  }
  return out;
}

function sectionSummary(input: ReportTemplateInput): string[] {
  const period = PERIOD_LABEL[input.type];
  const { progress, duration } = input;
  // 缺任一側就沒有落差可言；以 0 代入等於宣稱「與預定相符」
  const gap =
    progress.cumulativeActual != null && progress.cumulativePlanned != null
      ? progress.cumulativeActual - progress.cumulativePlanned
      : null;

  const out = [
    `## 二、${period}摘要`,
    "",
    `| 指標 | ${period} | 累計 | 落差（完成 − 預定） |`,
    "| --- | --- | --- | --- |",
    `| 預定進度 | ${fmtPct(progress.currentPlanned)} | ${fmtPct(progress.cumulativePlanned)} | ${NA} |`,
    `| 完成進度 | ${fmtPct(progress.currentActual)} | ${fmtPct(progress.cumulativeActual)} | ${
      gap == null ? NA : `累計 **${describeGap(gap)}**`
    } |`,
    `| 工期使用 | ${NA} | ${
      duration.elapsed == null || duration.total == null
        ? NA
        : `${fmtInt(duration.elapsed)} / ${fmtInt(duration.total)} 天（${duration.usedPercent ?? NA}%）`
    } | ${duration.remaining == null ? NA : `剩餘 ${fmtInt(duration.remaining)} 天`} |`,
    "",
  ];

  if (input.curve.length > 0) {
    out.push("**累計進度趨勢**", "");
    out.push("```custom-scurve");
    out.push("title: 累計進度趨勢");
    out.push("yAxis: 累計進度");
    out.push("unit: %");
    for (const pt of input.curve) {
      const cols = [pt.label, String(pt.planned)];
      if (pt.actual !== undefined) cols.push(String(pt.actual));
      if (pt.forecast !== undefined) {
        if (pt.actual === undefined) cols.push("");
        cols.push(String(pt.forecast));
      }
      out.push(cols.join(", "));
    }
    out.push("```", "");
  }

  out.push(`**${period}評述**`, "");
  out.push(
    input.review?.trim() ||
      `${period}累計完成 ${fmtPct(progress.cumulativeActual)}，累計預定 ${fmtPct(
        progress.cumulativePlanned,
      )}，${
        gap == null ? "缺預定或完成值，無法比對落差" : describeGap(gap)
      }。詳細數據見以下各節。`,
  );
  out.push("");
  return out;
}

function sectionProgress(input: ReportTemplateInput): string[] {
  const period = PERIOD_LABEL[input.type];
  const { progress, duration, workItems } = input;

  const out = [
    "## 三、進度分析",
    "",
    "### 3.1 整體進度",
    "",
    "| 項目 | 數值 | 項目 | 數值 |",
    "| --- | --- | --- | --- |",
    `| 累積工期 | ${duration.elapsed == null ? NA : `${fmtInt(duration.elapsed)} 天`} | 剩餘工期 | ${
      duration.remaining == null ? NA : `${fmtInt(duration.remaining)} 天`
    } |`,
    `| ${period}預定進度 | ${fmtPct(progress.currentPlanned)} | 累計預定進度 | ${fmtPct(progress.cumulativePlanned)} |`,
    `| ${period}完成進度 | ${fmtPct(progress.currentActual)} | 累計完成進度 | ${fmtPct(progress.cumulativeActual)} |`,
    "",
  ];

  /*
    整體進度的涵蓋範圍必須寫明。上表的百分比只算在「有預定起訖日」的工項上
    —— 未設定者沒有預定值可比，納入任一側都會使落差來自母體不同。
    不揭露的話，20 項中僅 1 項參與比對時，那個百分比會被當成全案進度。
  */
  if (input.unscheduledWorkItems && input.unscheduledWorkItems > 0) {
    out.push(
      `> 上表整體進度僅涵蓋已設定預定起訖日的工程分項；另有 ${input.unscheduledWorkItems} 項未設定預定起訖日，無預定值可比對，未納入上表。其累計完成量仍列於 3.3。`,
      "",
    );
  }

  if (workItems.length === 0) {
    out.push("_本期無工程分項資料。_", "");
    return out;
  }

  /*
    3.2 累計進度橫條。

    第三欄（本期增量）**要嘛每一列都有、要嘛整個圍欄都不放**。
    先前是逐列判斷 `currentPercent != null`，於是有本期數量的列出三欄、
    沒有的出兩欄，同一個圍欄內欄數不一致 —— 解析器容忍 2–4 欄不會壞，
    但兩欄的那幾列會靜默失去本期標記，讀圖的人無從得知那是「本期為 0」
    還是「這一列沒有本期資料」。整欄有無是一致的呈現決定，不該逐列擺盪。
  */
  const chartRows = workItems.filter((w) => w.cumulativePercent != null);
  if (chartRows.length > 0) {
    const withCurrent = chartRows.every((w) => w.currentPercent != null);
    out.push("### 3.2 各工程項目完成情形", "");
    out.push("```custom-progress");
    out.push("title: 各工程項目累計完成百分比");
    out.push("unit: %");
    out.push("xScale: 100");
    for (const w of chartRows) {
      const cols = [w.name.replace(/,/g, "、"), String(w.cumulativePercent)];
      if (withCurrent) cols.push(String(w.currentPercent));
      out.push(cols.join(", "));
    }
    out.push("```", "");
    if (!withCurrent) {
      out.push(
        `> 部分工程項目本期無日報數量紀錄，故本圖僅呈現累計完成百分比。`,
        "",
      );
    }
  }

  // 3.3 法定明細表 + 合計
  out.push("### 3.3 工程項目估驗明細", "");
  out.push(
    `| 項次 | 工程項目 | 單位權重 | 合約金額 | ${period}完成百分比 | 累計完成百分比 | ${period}完成金額 | 累計完成金額 |`,
  );
  out.push("| --- | --- | --- | --- | --- | --- | --- | --- |");

  const totalContract = workItems.reduce(
    (s, w) => s + (w.contractAmount ?? 0),
    0,
  );
  let totalCumAmount = 0;
  let totalCurAmount = 0;
  let hasCurAmount = false;

  workItems.forEach((w, i) => {
    const weight =
      totalContract > 0 && w.contractAmount != null
        ? (w.contractAmount / totalContract) * 100
        : null;
    totalCumAmount += w.cumulativeAmount ?? 0;
    if (w.currentAmount != null) {
      totalCurAmount += w.currentAmount;
      hasCurAmount = true;
    }
    out.push(
      `| ${w.code ?? String(i + 1)} | ${cell(w.name)} | ${fmtPct(weight, 1)} | ${fmtInt(w.contractAmount)} | ${fmtPct(w.currentPercent)} | ${fmtPct(w.cumulativePercent)} | ${fmtInt(w.currentAmount)} | ${fmtInt(w.cumulativeAmount)} |`,
    );
  });

  out.push(
    `| ${NA} | **合計** | **${totalContract > 0 ? "100.0%" : NA}** | **${fmtInt(totalContract || null)}** | ${NA} | ${NA} | **${hasCurAmount ? fmtInt(totalCurAmount) : NA}** | **${fmtInt(totalCumAmount || null)}** |`,
  );
  out.push("");

  const missingCurrent = workItems.filter((w) => w.currentPercent == null).length;
  if (missingCurrent === workItems.length) {
    out.push(
      `> ${period}完成百分比與金額取自監造日報之數量表；本期尚無已提送或已核備的日報數量紀錄，故以 ${NA} 表示。累計欄位為系統即時彙整值。`,
      "",
    );
  } else if (missingCurrent > 0) {
    /*
      混合情況先前完全無提示，而合計只加了有值的列 ——
      讀者會把它當成全部工項的總和，形成系統性低估。
    */
    out.push(
      `> 其中 ${missingCurrent} 項工程項目本期無日報數量紀錄，${period}兩欄以 ${NA} 表示；**上方${period}完成金額合計未包含這些項目**。`,
      "",
    );
  }
  return out;
}

function sectionWorkLog(input: ReportTemplateInput): string[] {
  const period = PERIOD_LABEL[input.type];
  const { workDays, dailyLogs } = input;

  const out = ["## 四、工作事項", "", "### 4.1 工作統計", ""];
  out.push("| 項目 | 數量 | 說明 |");
  out.push("| --- | --- | --- |");
  out.push(`| 施工天數 | ${workDays.working} 天 | 有施工紀錄之日數 |`);
  out.push(
    `| 天氣因素停工 | ${workDays.weatherStop} 天 | 日報載明因雨或颱風停工之日數 |`,
  );
  /*
    地震停工固定列示（即使為 0）。
    與天候分列是因為兩者處置不同：地震停工後常伴隨結構複檢，
    且在工期展延的契約依據上與天候屬不同款項。
    法定文件中明列 0 也有意義 —— 表示該項已審視過，而非遺漏。
  */
  out.push(
    `| 地震停工 | ${workDays.earthquakeStop} 天 | 日報載明因地震停工之日數 |`,
  );
  out.push(`| 例假日 | ${workDays.holiday} 天 | 日報載明為例假日之日數 |`);
  if (workDays.noSchedule > 0) {
    out.push(`| 未排工 | ${workDays.noSchedule} 天 | 非假日但當日無預定工作 |`);
  }
  if (workDays.otherStop > 0) {
    out.push(`| 其他停工 | ${workDays.otherStop} 天 | 因其他原因未施工，詳見逐日明細 |`);
  }
  if (workDays.unclassified > 0) {
    // 不臆測分類：既無停工原因亦無敘述者單獨列出，避免混入例假日而失真
    out.push(
      `| 未載明 | ${workDays.unclassified} 天 | 日報未填停工原因亦無工作敘述，無從判定 |`,
    );
  }
  out.push(`| 填報日數 | ${workDays.total} 天 | ${period}監造日報篇數 |`);
  /*
    免計工期與停工天數分列：停工不必然免計工期，免計與否是監造依契約條款的宣告。
    此數在結算與工期展延爭議中有金額意義，故即使為 0 也固定列示。
  */
  out.push(
    `| 免計工期 | ${workDays.excludedDays} 天 | 日報載明依契約免計工期之日數 |`,
  );
  if (input.excludedDraftDays && input.excludedDraftDays > 0) {
    out.push(
      `| 草稿未計入 | ${input.excludedDraftDays} 天 | 日報尚未提送，其工作事項與數量均未列入本報表 |`,
    );
  }
  if (input.unscheduledWorkItems && input.unscheduledWorkItems > 0) {
    out.push(
      `| 未納入進度比對 | ${input.unscheduledWorkItems} 項 | 工程分項未設定預定起訖日，無預定值可比對；其累計完成量仍列於 3.3 |`,
    );
  }
  out.push("");

  if (workDays.total > 0) {
    out.push("```mermaid");
    out.push("pie showData");
    out.push(`  title ${period}工作日組成`);
    if (workDays.working > 0) out.push(`  "施工" : ${workDays.working}`);
    if (workDays.weatherStop > 0)
      out.push(`  "天氣因素停工" : ${workDays.weatherStop}`);
    if (workDays.earthquakeStop > 0)
      out.push(`  "地震停工" : ${workDays.earthquakeStop}`);
    if (workDays.holiday > 0) out.push(`  "例假日" : ${workDays.holiday}`);
    if (workDays.noSchedule > 0) out.push(`  "未排工" : ${workDays.noSchedule}`);
    if (workDays.otherStop > 0) out.push(`  "其他停工" : ${workDays.otherStop}`);
    if (workDays.unclassified > 0)
      out.push(`  "未載明" : ${workDays.unclassified}`);
    out.push("```", "");
  }

  out.push("### 4.2 逐日工作事項明細", "");
  if (dailyLogs.length === 0) {
    out.push("_本期無監造日報填報紀錄。_", "");
    return out;
  }

  out.push("| 日期 | 星期 | 天氣 | 工作事項 |");
  out.push("| --- | --- | --- | --- |");
  for (const log of dailyLogs) {
    const notes = log.keyNotes?.trim()
      ? `${log.summary?.trim() || NA}<br>重要：${log.keyNotes.trim()}`
      : log.summary?.trim() || NA;
    out.push(
      `| ${fmtMonthDay(log.reportDate)} | ${WEEKDAY[log.reportDate.getDay()]} | ${cell(log.weather ?? NA)} | ${cell(notes)} |`,
    );
  }
  out.push("");
  return out;
}

function sectionSignature(): string[] {
  return [
    "## 五、簽章",
    "",
    "| 監造單位 | 承攬廠商 | 主辦單位 |",
    "| --- | --- | --- |",
    "| （簽章） | （簽章） | （簽章） |",
    "",
    "---",
    "_本報告由費思 AI 依系統紀錄生成，屬草稿，數據僅供監造參考；核定前請人工確認。_",
  ];
}

/** 組出完整五層監造報表 markdown。 */
export function buildReportMarkdown(input: ReportTemplateInput): string {
  return [
    ...sectionHeader(input),
    ...sectionBasics(input),
    ...sectionSummary(input),
    ...sectionProgress(input),
    ...sectionWorkLog(input),
    ...sectionSignature(),
  ].join("\n");
}
