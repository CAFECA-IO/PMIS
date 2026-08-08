import { countsTowardQty } from "@/constant/pmis";
import { derivedProgress } from "@/service/obligation-rollup";
import {
  buildWorkItemSCurve,
  isSchedulable,
  plannedProgressAt,
  weightedProgressDelta,
} from "@/service/scurve";
import {
  PERIOD_LABEL,
  describeGap,
  monthLabel,
  summarizeDuration,
  summarizeWorkDays,
  trimCurveWindow,
} from "@/service/report-period";
import {
  effectiveCompletedQty,
  effectiveProgress,
} from "@/service/work-item-effective";
import { multiply, percent } from "@/service/work-item-ledger";
import type {
  ProgressCurvePoint,
  ReportTemplateInput,
  WorkItemRow,
} from "@/service/report-template";
import type { WorkItemDetail } from "@/service/project.service";
import type { ReportType } from "@/service/report.service";
import type { ReportStatus, WorkStopReason } from "@/generated/prisma/enums";

/**
 * 監造報表的**組裝核心**（純函式，無 I/O）。
 *
 * 為什麼要獨立成一個檔案：`generateReport` 先前把「取數」與「決定每個數字
 * 是什麼」寫在同一個 async 函式裡，於是那些數字完全無法測試 ——
 * 而歷次出過的問題全都在這一段，且每一個都是**組裝錯誤**而非算式錯誤：
 *
 *  - 累計取「至今」而非期末，補產舊月報時把之後幾個月的量算進去；
 *  - 預定與完成算在不同母體上，20 個沒有預定日的工項讓報表宣稱落後 40 個百分點；
 *  - 決策 G 只套在數量側，施工天數與逐日日誌照樣吃草稿；
 *  - 缺預定值時以 0 代入，於是印出「超前 45 個百分點」。
 *
 * 這些都不是 `plannedProgressAt` 之類純函式算錯，而是**餵錯了東西**。
 * 先前只能以原始碼字串比對（`report-cumulative-bound.test.ts`）勉強守住，
 * 但那種測試守得住「有沒有人拆掉接線」，守不住「接對了沒」。
 * 把組裝抽成純函式後，就能以真實輸入輸出驗證。
 *
 * 保留在 `report.service` 的只剩三件事：取數、呼叫 LLM 寫評述、蓋產出時間。
 */

/** 期間內的一份日報（僅取組裝需要的欄位）。 */
export type DailyReportRow = {
  reportDate: Date;
  weather: string | null;
  summary: string | null;
  keyNotes: string | null;
  stopReason: WorkStopReason | null;
  excludedFromDuration: boolean;
  status: ReportStatus;
};

/** 3.3 估驗明細的一列來源（台帳欄位，Decimal 未轉型）。 */
export type LedgerWorkItem = {
  id: string;
  code: string | null;
  wbsCode: string | null;
  name: string;
  contractQty: unknown;
  unitPrice: unknown;
  completedQty: unknown;
  progress: number;
};

export type AssembleInput = {
  type: ReportType;
  typeLabel: string;
  /** 期間起訖與標籤，由 `periodRange` 產生。 */
  period: { start: Date; end: Date; label: string };
  project: {
    name: string;
    code: string;
    client: string | null;
    contractor: string | null;
    supervisor: string | null;
    budget: unknown;
    startDate: Date | null;
    endDate: Date | null;
    contractWorkDays: number | null;
    scopeTitles: string[];
  };
  /**
   * 期間內的**全部**日報，含草稿。
   *
   * 刻意不要求呼叫端先過濾：決策 G 的「哪些算數」是組裝規則的一部分，
   * 由呼叫端過濾就會出現「有人記得過濾、有人忘記」的兩套母體
   * —— 那正是先前施工天數含草稿而數量不含的成因。
   */
  dailyReports: DailyReportRow[];
  /** 進度基準用的工程分項（`progress` 須為有效進度，截至期末）。 */
  workItemDetails: WorkItemDetail[];
  /** 3.3 明細用的工項列。 */
  ledgerWorkItems: LedgerWorkItem[];
  /** 各工項截至**期末**的日報累計量。 */
  cumulativeQtyTotals: ReadonlyMap<string, number>;
  /** 各工項在**期間內**的日報數量。 */
  periodQtyTotals: ReadonlyMap<string, number>;
};

export type AssembleResult = {
  /** 交給 `buildReportMarkdown` 的輸入，缺產出時間與 LLM 評述。 */
  template: Omit<ReportTemplateInput, "generatedAt" | "review">;
  /** 餵給 LLM 的事實摘要；只含上方已算出的數字，不得引入其他資訊。 */
  facts: string;
};

/** Prisma Decimal → number（沿用專案既有的邊界轉換慣例）。 */
const toNum = (v: unknown): number | null => {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export function assembleReport(input: AssembleInput): AssembleResult {
  const { type, typeLabel, period, project } = input;
  const { start, end, label } = period;
  const periodWord = PERIOD_LABEL[type];

  /*
    決策 G：只採計已提送／已核備的日報。

    先前施工天數與逐日明細取全部日報，數量卻只計已提送者
    —— 同一份法定文件裡兩套母體，審核時對不起來且沒有任何說明。
    被排除的天數另行揭露，否則報表看起來異常稀疏，
    會讓人以為資料遺失而重複填報。
  */
  const counted = input.dailyReports.filter((r) => countsTowardQty(r.status));
  const excludedDraftDays = input.dailyReports.length - counted.length;

  /*
    ── 進度比對的母體：只取具預定起訖日的工項 ──────────────────

    預定與完成必須算在同一批工項上。未設定預定起訖者沒有預定值可比，
    先前完成側納入、預定側排除，落差便純粹來自母體不同：
    1 個排程工項做完 100%、另有 20 個無預定日的工項，
    會算出預定 100%、完成 60%，報表宣稱落後 40 個百分點 ——
    而那個數字會進入工期展延爭議。

    被排除的工項不是被忽略：其累計完成仍列於 3.3，
    排除數量也在報表上明白標示（`unscheduledWorkItems`）。
  */
  const basis = input.workItemDetails.filter(isSchedulable);
  const unscheduledWorkItems = input.workItemDetails.length - basis.length;

  const cumulativeActual = basis.length > 0 ? derivedProgress(basis) : null;
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
      const periodQty = input.periodQtyTotals.get(w.id) ?? 0;
      return {
        plannedStart: w.plannedStart,
        plannedEnd: w.plannedEnd,
        delta:
          contract != null && contract > 0 ? (periodQty / contract) * 100 : 0,
      };
    }),
  );

  // ── S-Curve：同採工程分項基準，與上方數字一致 ──
  const curve: ProgressCurvePoint[] = trimCurveWindow(
    buildWorkItemSCurve(input.workItemDetails),
    monthLabel(end),
    6,
  ).map((p) => ({
    label: p.label,
    planned: p.planned,
    ...(p.actual != null ? { actual: p.actual } : {}),
  }));

  /*
    本期無任何日報數量紀錄時，各工項的本期欄位應為「無資料」而非 0。
    兩者意義不同：0 代表「本期確實沒做」，「—」代表「沒有數量紀錄可據」。
    若一律填 0，尚未導入日報填報的專案會被誤讀為本期毫無進展。
    反之，只要本期有任何紀錄，未出現於加總中的工項即為確實未施作 → 0。
  */
  const hasPeriodQty = input.periodQtyTotals.size > 0;

  const workItems: WorkItemRow[] = input.ledgerWorkItems.map((w) => {
    const qty = toNum(w.contractQty);
    const price = toNum(w.unitPrice);
    const cumulativeDone = effectiveCompletedQty(
      toNum(w.completedQty),
      input.cumulativeQtyTotals.get(w.id) ?? null,
    );
    const periodDone = hasPeriodQty
      ? (input.periodQtyTotals.get(w.id) ?? 0)
      : null;

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
    project.contractWorkDays,
  );
  const workDays = summarizeWorkDays(
    counted.map((r) => ({
      reportDate: r.reportDate,
      weather: r.weather,
      summary: r.summary,
      // 決策 H：停工原因是判定的權威來源，未傳入則會退回舊的敘述推測分支
      stopReason: r.stopReason,
      excludedFromDuration: r.excludedFromDuration,
    })),
  );

  /*
    缺任一側就沒有落差可言。先前以 0 代入等於宣稱「與預定相符」，
    而那正是缺值時最容易被當真的一句話。
  */
  const gap =
    cumulativePlanned != null && cumulativeActual != null
      ? cumulativeActual - cumulativePlanned
      : null;

  const facts = [
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

  return {
    facts,
    template: {
      type,
      periodLabel: label,
      periodStart: start,
      periodEnd: end,
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
      scopeItems: project.scopeTitles,
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
      dailyLogs: counted.map((r) => ({
        reportDate: r.reportDate,
        weather: r.weather,
        summary: r.summary,
        keyNotes: r.keyNotes,
      })),
    },
  };
}
