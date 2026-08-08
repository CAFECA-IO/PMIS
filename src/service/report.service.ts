import * as reportRepo from "@/repository/report.repository";
import * as supervisionRepo from "@/repository/supervisionReport.repository";
import * as memberRepo from "@/repository/projectMember.repository";
import * as savedReportRepo from "@/repository/generatedReport.repository";
import { getWorkItemDetails } from "@/service/project.service";
import { derivedProgress } from "@/service/obligation-rollup";
import * as faith from "@/service/faith.service";
import { canSeeAllProjects } from "@/lib/auth";
import { isPeriodReportFrozen } from "@/constant/pmis";
import {
  buildWorkItemSCurve,
  isSchedulable,
  plannedProgressAt,
  weightedProgressDelta,
} from "@/service/scurve";
import {
  PERIOD_LABEL,
  PERIOD_REPORT_NAME,
  describeGap,
  monthLabel,
  summarizeDuration,
  summarizeWorkDays,
  trimCurveWindow,
} from "@/service/report-period";
import {
  buildReportMarkdown,
  type ProgressCurvePoint,
  type WorkItemRow,
} from "@/service/report-template";
import {
  loadDailyQtyTotalsInPeriod,
  loadDailyQtyTotalsUpTo,
} from "@/service/daily-qty.service";
import {
  effectiveCompletedQty,
  effectiveProgress,
} from "@/service/work-item-effective";
import { parseRefDate, periodKeyFor, weekStart } from "@/service/period-key";
import { multiply, percent } from "@/service/work-item-ledger";
import { countsTowardQty } from "@/constant/pmis";
import { formatDate } from "@/lib/utils";
import type { AccountRole } from "@/generated/prisma/enums";

export type ReportType = "DAILY" | "WEEKLY" | "MONTHLY" | "QUARTERLY" | "ANNUAL";
export type Actor = { id: string; name: string; role: AccountRole };

export const REPORT_TYPES: { value: ReportType; label: string }[] = [
  { value: "DAILY", label: "日報" },
  { value: "WEEKLY", label: "週報" },
  { value: "MONTHLY", label: "月報" },
  { value: "QUARTERLY", label: "季報" },
  { value: "ANNUAL", label: "年報" },
];

const TYPE_LABEL: Record<ReportType, string> = {
  DAILY: "日報",
  WEEKLY: "週報",
  MONTHLY: "月報",
  QUARTERLY: "季報",
  ANNUAL: "年報",
};

const startOfDay = (d: Date) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
const endOfDay = (d: Date) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

/*
  基準日的解析（`parseRefDate`）與期間身分鍵同住在 `period-key.ts`：
  兩者是同一件事的兩半 —— 解析決定「使用者心中的那一天」，
  鍵決定「那一天屬於哪個期間」，拆開放會讓時區慣例再次分岔。
  該檔零相依，故回填腳本與純函式測試都能直接匯入。
*/
export { parseRefDate };

/*
  ── 日曆日與時間點的界線 ───────────────────────────────────

  `SupervisionReport.reportDate` 存的是**日曆日**：它由
  `new Date("YYYY-MM-DD")` 產生，而 JS 對純日期字串一律以 **UTC 午夜**解析。
  但 `periodRange` 的期間邊界是用本地建構子算的。兩套慣例混用時，
  在 UTC 偏移為負的部署（如 UTC−5）中，本地 8/1 00:00 等於 UTC 8/1 05:00，
  於是「8 月 1 日的日報」（UTC 8/1 00:00）會落在 8 月的區間之外
  —— 當月第一天的數量整個消失，而報表看起來完全正常。

  故凡是要拿來和 `reportDate` 比較的邊界，一律先換算成同一個基準：
  取該日期的**日曆日**，再組成 UTC 的當日起／迄。
*/
const utcDayStart = (d: Date) =>
  new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
const utcDayEnd = (d: Date) =>
  new Date(
    Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999),
  );

/**
 * 期間的起訖、顯示標籤與**身分鍵**。
 *
 * `key` 一律取自 `period-key.periodKeyFor`，不在此另寫一份 ——
 * 回填腳本需要同一套算法，兩份實作靠註解約定一致遲早會分岔，
 * 而分岔的後果是新舊資料被當成不同期間，且定稿無法事後修正。
 *
 * 鍵取自 `ref` 的**本地日曆日**，故呼叫端必須先以 `parseRefDate` 解析，
 * 讓 `ref` 代表使用者心中的那一天（見該函式的說明）。
 */
function periodRange(type: ReportType, ref: Date) {
  const y = ref.getFullYear();
  const m = ref.getMonth();
  const key = periodKeyFor(type, ref);
  switch (type) {
    case "DAILY":
      return {
        start: startOfDay(ref),
        end: endOfDay(ref),
        label: `${formatDate(ref)}`,
        key,
      };
    case "WEEKLY": {
      const start = startOfDay(weekStart(ref));
      const end = endOfDay(
        new Date(
          start.getFullYear(),
          start.getMonth(),
          start.getDate() + 6,
        ),
      );
      return {
        start,
        end,
        label: `${formatDate(start)} ~ ${formatDate(end)}`,
        key,
      };
    }
    case "MONTHLY":
      return {
        start: new Date(y, m, 1),
        end: endOfDay(new Date(y, m + 1, 0)),
        label: `${y} 年 ${m + 1} 月`,
        key,
      };
    case "QUARTERLY": {
      const q = Math.floor(m / 3);
      return {
        start: new Date(y, q * 3, 1),
        end: endOfDay(new Date(y, q * 3 + 3, 0)),
        label: `${y} 年 Q${q + 1}`,
        key,
      };
    }
    case "ANNUAL":
    default:
      return {
        start: new Date(y, 0, 1),
        end: endOfDay(new Date(y, 11, 31)),
        label: `${y} 年`,
        key,
      };
  }
}

/** Prisma Decimal → number（於 service 邊界轉換，沿用專案既有慣例）。 */
const toNum = (v: unknown): number | null => {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export async function canAccess(projectId: string, actor: Actor) {
  if (canSeeAllProjects(actor.role)) return true;
  return Boolean(await memberRepo.exists(projectId, actor.id));
}

export type GeneratedReport = {
  title: string;
  periodLabel: string;
  typeLabel: string;
  markdown: string;
  // Info: (20260803 - Julian) 治理：本產出為 AI 草稿，核定前需人工確認（人在迴路）
  isDraft: boolean;
  // Info: (20260803 - Julian) 治理：本次生成引用的數據集來源（稽核可回溯）
  sources: string[];
  // Info: (20260803 - Julian) 稽核：本體是否由 LLM 主導（false = 回退決定論組裝）
  aiAuthored: boolean;
};


/**
 * Info: (20260804 - Julian)
 * 產出監造報表（週／月／季／年），採五層式監造月報範本。
 *
 * 報表結構屬法定格式，故骨架由程式決定論組裝（`report-template`），
 * LLM 僅撰寫「期間評述」一段；評述失敗時以決定論句子回退，報表永遠可產出。
 * 圖表以 custom-scurve / custom-progress / mermaid 圍欄嵌入，於前端渲染。
 */
export async function generateReport(
  projectId: string,
  type: ReportType,
  /**
   * 基準日；由呼叫端以 `parseRefDate` 解析後傳入。
   *
   * 刻意不在此再讀一次時鐘：先前 `generateReportView` 與本函式各自
   * `new Date()`，在跨月的午夜前後產製，`periodLabel` 與 `periodKey`
   * 會落在不同月份 —— 報表標題寫 7 月、留存卻歸在 8 月。
   */
  ref: Date,
  actor: Actor,
): Promise<GeneratedReport | null> {
  if (!(await canAccess(projectId, actor))) return null;
  const project = await reportRepo.getProject(projectId);
  if (!project) return null;

  const { start, end, label } = periodRange(type, ref);
  const typeLabel = TYPE_LABEL[type];
  const periodWord = PERIOD_LABEL[type];

  /*
    月報一律只採計「已提送／已核備」的日報（決策 G）。

    先前此處取全部日報，導致同一份月報混用兩套母體：
    4.1 的施工天數與 4.2 的逐日明細含草稿，3.3 的數量卻只計已提送者
    ——審核時兩邊對不起來，且沒有任何說明。
    月報是法定文件，草稿本就不應計入；被排除的天數另行註明，
    以免報表看起來異常稀疏而讓人誤以為資料遺失。
  */
  // 與 reportDate 同基準（見 utcDayStart 的說明）；直接用本地邊界會漏掉當月第一天
  const qStart = utcDayStart(start);
  const qEnd = utcDayEnd(end);

  const allDailyReports = await supervisionRepo.listByProjectInPeriod(
    projectId,
    qStart,
    qEnd,
  );
  const dailyReports = allDailyReports.filter((r) => countsTowardQty(r.status));
  const excludedDraftDays = allDailyReports.length - dailyReports.length;

  /*
    ── 進度：一律採工程分項基準（決策 I-2）─────────────────────

    先前預定與完成皆取自履約事項（權重 × 期限，階梯式），
    但日報的「當日預定進度」依決策 C 採工程分項基準（預定起訖線性展開）。
    兩者並存會讓日報逐日預定的期末值不等於月報的累計預定，
    等同在預定側製造第二個真實來源 —— 正是決策 A／F 要消滅的問題。
    故此處改為同一基準：權重＝預定工期天數，預定線性展開、完成取有效進度。

    履約事項並未失效，仍是里程碑管理與契約應辦事項的載體；
    只是不再作為月報進度數字的基準。
  */
  /*
    累計一律以**期末**為上限，不是「現在」。

    先前此處取全期間加總（`loadDailyQtyTotals`／無上限的 `getWorkItemDetails`），
    於 8/7 補產 2 月月報時會把 3–7 月的量算進 2 月的累計，
    印出「累計超前」這種當時並不存在的數字 —— 而月報是送審文件。
    同一 codebase 的日報進度條（`getDailyProgress`）本就以當日為界，
    兩者若不同界，同一天會出現兩個「累計完成」，正是決策 A 要消滅的問題。
  */
  const [wiDetails, cumulativeQtyTotals, periodQtyTotals] = await Promise.all([
    getWorkItemDetails(projectId, end),
    loadDailyQtyTotalsUpTo(projectId, qEnd),
    loadDailyQtyTotalsInPeriod(projectId, qStart, qEnd),
  ]);

  /*
    ── 進度比對的母體：只取具預定起訖日的工項 ──────────────────

    預定與完成必須算在同一批工項上。未設定預定起訖者沒有預定值可比，
    先前完成側納入、預定側排除，落差便純粹來自母體不同：
    1 個排程工項做完 100%、另有 20 個無預定日的工項，
    會算出預定 100%、完成 60%，報表宣稱落後 40 個百分點。
    這個數字會進入工期展延爭議。

    被排除的工項不是被忽略 —— 其累計完成仍列於 3.3，
    且排除數量會在報表上明白標示（`unscheduledWorkItems`）。
  */
  const basis = wiDetails.filter(isSchedulable);
  const unscheduledWorkItems = wiDetails.length - basis.length;

  // 累計完成：各工項截至期末的有效進度（決策 F）以預定工期天數加權
  const cumulativeActual = basis.length > 0 ? derivedProgress(basis) : null;
  // 累計預定：各工項於預定期間線性展開至期末
  const cumulativePlanned = plannedProgressAt(basis, end);

  /*
    本期預定增量＝期末預定 − 期初前一刻預定。
    取期初「前一刻」而非期初當日，否則期初當日的增量會被算進上一期。
  */
  const beforeStart = new Date(start.getTime() - 1);
  const plannedAtStart = plannedProgressAt(basis, beforeStart);
  const currentPlanned =
    cumulativePlanned != null && plannedAtStart != null
      ? Math.round((cumulativePlanned - plannedAtStart) * 100) / 100
      : null;

  /*
    本期完成增量：各工項期間內的日報數量占契約數量之比例，同樣加權。
    未計量工項（無契約數量）於本期貢獻 0 —— 其進度僅能人工填報，
    無法得知期間內的增量，此為決策 F 下已知且已於 3.3 註明的限制。
  */
  const currentActual = weightedProgressDelta(
    basis.map((w) => {
      const contract = toNum(w.contractQty);
      const periodQty = periodQtyTotals.get(w.id) ?? 0;
      return {
        plannedStart: w.plannedStart,
        plannedEnd: w.plannedEnd,
        delta:
          contract != null && contract > 0 ? (periodQty / contract) * 100 : 0,
      };
    }),
  );

  // ── S-Curve：同採工程分項基準，與上方數字一致 ──
  const curveAll = buildWorkItemSCurve(wiDetails);
  const curve: ProgressCurvePoint[] = trimCurveWindow(
    curveAll,
    monthLabel(end),
    6,
  ).map((p) => ({
    label: p.label,
    planned: p.planned,
    ...(p.actual != null ? { actual: p.actual } : {}),
  }));

  /*
    ── 工項估驗明細（3.3）──────────────────────────────────────
    自決策 A 起，累計與本期完成皆取自日報數量表：
      累計 = 期初(WorkItem.completedQty) + Σ 全期間 dailyQty
      本期 = Σ 期間內 dailyQty
    先前此處因無期末快照而把本期兩欄填 null（報表顯示「—」），
    已不再需要 WorkItemPeriodSnapshot —— 日報本身就是流水帳。
    僅計入已提送／已核備的日報（決策 G，見 daily-qty.service）。
  */
  /*
    本期無任何日報數量紀錄時，各工項的本期欄位應為「無資料」而非 0。
    兩者意義不同：0 代表「本期確實沒做」，「—」代表「沒有數量紀錄可據」。
    若一律填 0，尚未導入日報填報的專案會被誤讀為本期毫無進展。
    反之，只要本期有任何紀錄，未出現於加總中的工項即為確實未施作 → 0。
  */
  const hasPeriodQty = periodQtyTotals.size > 0;

  const workItems: WorkItemRow[] = project.workItems.map((w) => {
    const qty = toNum(w.contractQty);
    const price = toNum(w.unitPrice);
    const opening = toNum(w.completedQty);

    const cumulativeDone = effectiveCompletedQty(
      opening,
      cumulativeQtyTotals.get(w.id) ?? null,
    );
    const periodDone = hasPeriodQty ? (periodQtyTotals.get(w.id) ?? 0) : null;

    return {
      code: w.wbsCode ?? w.code ?? null,
      name: w.name,
      contractAmount: multiply(qty, price),
      // 已計量工項以數量推導；未計量者沿用人工填報進度（決策 F）
      cumulativePercent: effectiveProgress(
        {
          contractQty: qty,
          unitPrice: price,
          completedQty: cumulativeDone,
          // 估驗狀態不在本表呈現，故不取這兩個量
          inspectedQty: null,
          valuatedQty: null,
        },
        Number.isFinite(w.progress) ? w.progress : 0,
      ),
      cumulativeAmount: multiply(cumulativeDone, price),
      currentPercent: percent(periodDone, qty),
      currentAmount: multiply(periodDone, price),
    };
  });

  const duration = summarizeDuration(
    project.startDate,
    end,
    project.contractWorkDays ?? null,
  );
  const workDays = summarizeWorkDays(
    dailyReports.map((r) => ({
      reportDate: r.reportDate,
      weather: r.weather,
      summary: r.summary,
      // 決策 H：停工原因是判定的權威來源，未傳入則會退回舊的敘述推測分支
      stopReason: r.stopReason,
      excludedFromDuration: r.excludedFromDuration,
    })),
  );

  // ── 期間評述：僅餵摘要層既算數字，LLM 不得引入其他資訊 ──
  /*
    缺任一側就沒有落差可言。先前以 0 代入等於宣稱「與預定相符」，
    而那正是缺值時最容易被當真的一句話。
  */
  const gap =
    cumulativePlanned != null && cumulativeActual != null
      ? cumulativeActual - cumulativePlanned
      : null;
  const factsText = [
    `專案：${project.name}（${project.code}）`,
    `期間：${label}（${typeLabel}）`,
    `${periodWord}預定進度 ${currentPlanned ?? "—"}%，${periodWord}完成進度 ${currentActual ?? "—"}%`,
    `累計預定進度 ${cumulativePlanned ?? "—"}%，累計完成進度 ${cumulativeActual ?? "—"}%，${
      gap != null ? describeGap(gap) : "缺預定或完成值，無法比對落差"
    }`,
    unscheduledWorkItems > 0
      ? `註：另有 ${unscheduledWorkItems} 項工程分項未設定預定起訖日，未納入上述整體進度比對`
      : "全部工程分項均已設定預定起訖日",
    duration.elapsed != null && duration.total != null
      ? `工期使用 ${duration.elapsed} / ${duration.total} 天，剩餘 ${duration.remaining} 天`
      : "工期資料不完整（契約工期或開工日未填）",
    `${periodWord}監造日報 ${workDays.total} 篇：施工 ${workDays.working} 天、天氣因素停工 ${workDays.weatherStop} 天、地震停工 ${workDays.earthquakeStop} 天、例假日 ${workDays.holiday} 天`,
    workItems.length > 0
      ? `工程分項 ${workItems.length} 項，累計完成百分比：${workItems
          .map((w) => `${w.name} ${w.cumulativePercent ?? "—"}%`)
          .join("、")}`
      : "本期無工程分項資料",
  ].join("\n");

  const review = await faith.generatePeriodReview(
    factsText,
    periodWord,
    PERIOD_REPORT_NAME[type],
  );

  const markdown = buildReportMarkdown({
    type,
    periodLabel: label,
    periodStart: start,
    periodEnd: end,
    generatedAt: new Date(),
    project: {
      name: project.name,
      code: project.code,
      client: project.client,
      contractor: project.contractor,
      supervisor: project.supervisor,
      budget: toNum(project.budget),
      startDate: project.startDate,
      endDate: project.endDate,
    },
    scopeItems: project.scopeItems.map((s) => s.title),
    excludedDraftDays,
    unscheduledWorkItems,
    duration,
    progress: {
      currentPlanned,
      currentActual,
      // 無任何具預定起訖日的工項時無從計算；以 0 呈現會誤導，故沿用 null 語意
      cumulativePlanned,
      cumulativeActual,
    },
    curve,
    workItems,
    workDays,
    dailyLogs: dailyReports.map((r) => ({
      reportDate: r.reportDate,
      weather: r.weather,
      summary: r.summary,
      keyNotes: r.keyNotes,
    })),
    review,
  });

  // Info: (20260804 - Julian) 治理：留存本次引用的資料來源，供稽核回溯
  const sources = [
    "專案基本資料（Project）",
    "契約標的－工程概要（ContractScopeItem.title）",
    "履約事項權重與期限（ContractObligation）",
    "工程分項估驗台帳（WorkItem）",
    "監造日報（SupervisionReport）",
  ];

  return {
    title: `${project.name}｜${label}${typeLabel}`,
    periodLabel: label,
    typeLabel,
    markdown,
    isDraft: true,
    sources,
    aiAuthored: Boolean(review),
  };
}

// ── 報表留存（決策 J-a）───────────────────────────────────

export type ReportView = {
  report: GeneratedReport;
  /**
   * 畫面上這一份的留存 id。
   * null 代表未留存 —— 無編輯權限，或本期已有定稿（見 confirmedId）。
   */
  savedId: string | null;
  /** 本期已有定稿時的該份 id；此時畫面上的即時預覽不是送審依據。 */
  confirmedId: string | null;
};

/**
 * 產出報表並**同步留存**畫面上這一份（決策 J-a）。
 *
 * 為何產出即留存，而非另設一顆「留存」按鈕：
 * 報表的每個數字都是即時推導（決策 A／F／I），連期間評述都由 LLM 現寫，
 * 同一期間隔五分鐘產生兩次結果就不同。若按鈕另跑一次產製，
 * 存下來的必然不是使用者讀過的那一份 —— 接著按「確認定稿」，
 * 就凍結了一份沒人讀過的送審文件。故此處只產一次，
 * 回傳的 markdown 與寫進 `GeneratedReport.markdown` 的是同一個字串。
 *
 * 草稿以「同專案／同週期／同期間」覆寫（見 repository 的 `upsertDraft`），
 * 因此反覆切換日期不會堆出大量無意義草稿。
 *
 * 本期已有定稿時不覆寫、也不另存草稿：定稿是當時送審依據的凍結內容，
 * 而預覽仍應顯示現況（否則使用者無從發現現況已與定稿不同）。
 */
export async function generateReportView(
  projectId: string,
  type: ReportType,
  refIso: string | undefined,
  actor: Actor,
  /** 無編輯權限者只讀不寫：純瀏覽不應在留存清單留下紀錄。 */
  persist: boolean,
): Promise<ReportView | null> {
  const ref = parseRefDate(refIso);
  if (!ref) return null;

  // ref 只解析一次，往下傳同一個時點
  const report = await generateReport(projectId, type, ref, actor);
  if (!report) return null;

  const { start, end, key } = periodRange(type, ref);

  const confirmed = await savedReportRepo.findConfirmedForPeriod(
    projectId,
    key,
  );
  if (confirmed || !persist) {
    return { report, savedId: null, confirmedId: confirmed?.id ?? null };
  }

  const saved = await savedReportRepo.upsertDraft({
    projectId,
    type,
    periodKey: key,
    periodStart: start,
    periodEnd: end,
    periodLabel: report.periodLabel,
    title: report.title,
    markdown: report.markdown,
    sources: report.sources.length > 0 ? report.sources.join("\n") : null,
    aiAuthored: report.aiAuthored,
    generatedById: actor.id,
    generatedBy: actor.name || null,
  });
  return { report, savedId: saved.id, confirmedId: null };
}

/**
 * 某期間**已留存**的報表（唯讀）。
 *
 * 存在的理由是把「看報表」與「產報表」拆開。產製一份報表要呼叫 LLM
 * 並寫一列留存，兩者都是有代價的副作用，不該由開啟頁面或改一個日期觸發
 * —— 先前正是如此：光是打開 /logs 就跑一次付費產製並留下一列草稿，
 * 而在日期欄逐鍵輸入年份會連續產生四份。
 *
 * 因此畫面掛載與切換期間一律走本函式（純讀取，不呼叫 LLM、不寫入），
 * 只有使用者明確按下「產生」才走 `generateReportView`。
 *
 * 同期同時有定稿與草稿時回定稿：定稿才是該期間的送審依據。
 */
export async function getPeriodReport(
  projectId: string,
  type: ReportType,
  refIso: string | undefined,
  actor: Actor,
) {
  if (!(await canAccess(projectId, actor))) return null;
  const ref = parseRefDate(refIso);
  if (!ref) return null;
  const { label, key } = periodRange(type, ref);

  const row =
    (await savedReportRepo.findConfirmedForPeriod(projectId, key)) ??
    (await savedReportRepo.findDraftForPeriod(projectId, key));
  if (!row) return { periodLabel: label, saved: null };

  return {
    periodLabel: label,
    saved: {
      id: row.id,
      title: row.title,
      status: row.status,
      markdown: row.markdown,
      generatedAt: row.generatedAt,
      generatedBy: row.generatedBy,
      aiAuthored: row.aiAuthored,
    },
  };
}

/**
 * 某專案的留存清單；無權限時回 `null` 而非空陣列。
 *
 * 兩者在畫面上意義不同：空陣列會顯示「尚無留存的報表」，
 * 而實際情形是「你看不到」—— 使用者會以為報表從未產生過。
 */
export async function listSavedReports(projectId: string, actor: Actor) {
  if (!(await canAccess(projectId, actor))) return null;
  return savedReportRepo.listByProject(projectId);
}

export async function getSavedReport(id: string, actor: Actor) {
  const row = await savedReportRepo.findById(id);
  if (!row || !(await canAccess(row.projectId, actor))) return null;
  return row;
}

export type ConfirmResult = { ok: true } | { ok: false; error: string };

/** 錯誤訊息用的時間格式；要讓使用者對得上畫面上的「產生於」。 */
const formatStamp = (d: Date): string => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

/**
 * 人工確認定稿。
 *
 * 確認後內容即為當時送審依據的快照，不可再修改或刪除；
 * 需要更新請重新產生一份。同一期間僅允許一份定稿 ——
 * 兩份都宣稱是「那個月的報表」時，無從判斷以何者為準。
 *
 * **`expectedGeneratedAt` 是必填的版本守門，不是可選的保險。**
 * 草稿是同一列原地覆寫（`upsertDraft`），所以 id 不足以指明「哪一版」：
 * A 分頁 09:00 看到的草稿，可能在 09:05 被另一個分頁或同事的重新生成
 * 覆寫成完全不同的內容；A 分頁的畫面與 id 都沒變，按下確認就凍結了
 * 一份沒人讀過的送審文件。呼叫端一律傳入「畫面上那一份」的產出時間，
 * 對不上就拒絕 —— 寧可要求使用者重看一次，也不要凍結他沒讀過的東西。
 */
export async function confirmSavedReport(
  id: string,
  actor: Actor,
  /** 畫面上那一份的 `generatedAt`（毫秒）。 */
  expectedGeneratedAt: number,
): Promise<ConfirmResult> {
  const row = await savedReportRepo.findById(id);
  if (!row) return { ok: false, error: "找不到此報表。" };
  if (!(await canAccess(row.projectId, actor))) {
    return { ok: false, error: "無權確認此報表。" };
  }
  if (isPeriodReportFrozen(row.status)) return { ok: true };

  /*
    期間鍵為空的列只可能來自「schema 已加 periodKey，但回填腳本還沒跑」
    的過渡狀態（見 prisma/backfill-period-key.ts 的三步驟）。
    此時放行會寫入 confirmedPeriodKey = ""，而唯一約束是
    (projectId, confirmedPeriodKey) —— 空字串會讓它退化成
    「每個專案只能有一份定稿」：定稿九月時會收到「八月已有定稿」。
    那個錯誤訊息完全指不到真正的原因，故在此擋下並明說要做什麼。
  */
  if (!row.periodKey.trim()) {
    return {
      ok: false,
      error:
        "此留存缺少期間鍵，尚未完成資料回填，暫時無法定稿。請先執行 npm run db:backfill -- --apply。",
    };
  }

  if (row.generatedAt.getTime() !== expectedGeneratedAt) {
    return {
      ok: false,
      error: `此草稿已於 ${formatStamp(row.generatedAt)} 被重新產生，內容與你看到的不同。請重新檢視最新版本後再確認定稿。`,
    };
  }

  /*
    先查一次只為了給出好讀的訊息；**真正的守門是資料庫的唯一約束**
    （`@@unique([projectId, confirmedPeriodKey])`）。
    只靠這裡的檢查是 check-then-write：兩個並行的確認都會通過檢查，
    然後各寫一份定稿，屆時無從判斷哪一份才是送審依據。
  */
  const existing = await savedReportRepo.findConfirmedForPeriod(
    row.projectId,
    row.periodKey,
  );
  if (existing) {
    return {
      ok: false,
      error: `${row.periodLabel}已有一份定稿報表，請先確認要以何者為準。`,
    };
  }

  try {
    await savedReportRepo.confirm(id, row.periodKey, {
      confirmedById: actor.id,
      confirmedBy: actor.name || null,
    });
  } catch (e) {
    // 競態下由資料庫擋下；轉成與上方相同的訊息，使用者不需要知道差別
    if (savedReportRepo.isUniqueViolation(e)) {
      return {
        ok: false,
        error: `${row.periodLabel}已有一份定稿報表，請先確認要以何者為準。`,
      };
    }
    throw e;
  }
  return { ok: true };
}

/** 刪除草稿留存；已確認者不可刪除。 */
export async function deleteSavedReport(
  id: string,
  actor: Actor,
): Promise<ConfirmResult> {
  const row = await savedReportRepo.findById(id);
  if (!row) return { ok: false, error: "找不到此報表。" };
  if (!(await canAccess(row.projectId, actor))) {
    return { ok: false, error: "無權刪除此報表。" };
  }
  if (isPeriodReportFrozen(row.status)) {
    return { ok: false, error: "已確認的報表為送審依據之留存，不可刪除。" };
  }
  await savedReportRepo.remove(id);
  return { ok: true };
}
