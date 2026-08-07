import * as reportRepo from "@/repository/report.repository";
import * as supervisionRepo from "@/repository/supervisionReport.repository";
import * as memberRepo from "@/repository/projectMember.repository";
import * as savedReportRepo from "@/repository/generatedReport.repository";
import { getWorkItemDetails } from "@/service/project.service";
import { derivedProgress } from "@/service/obligation-rollup";
import * as faith from "@/service/faith.service";
import { canSeeAllProjects } from "@/lib/auth";
import {
  buildWorkItemSCurve,
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
  loadDailyQtyTotals,
  loadDailyQtyTotalsInPeriod,
} from "@/service/daily-qty.service";
import {
  effectiveCompletedQty,
  effectiveProgress,
} from "@/service/work-item-effective";
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

function periodRange(type: ReportType, ref: Date) {
  const y = ref.getFullYear();
  const m = ref.getMonth();
  switch (type) {
    case "DAILY":
      return {
        start: startOfDay(ref),
        end: endOfDay(ref),
        label: `${formatDate(ref)}`,
      };
    case "WEEKLY": {
      const dow = (ref.getDay() + 6) % 7; // Info: (20260721 - Luphia) 0 = 星期一
      const start = startOfDay(new Date(y, m, ref.getDate() - dow));
      const end = endOfDay(new Date(y, m, ref.getDate() - dow + 6));
      return { start, end, label: `${formatDate(start)} ~ ${formatDate(end)}` };
    }
    case "MONTHLY":
      return {
        start: new Date(y, m, 1),
        end: endOfDay(new Date(y, m + 1, 0)),
        label: `${y} 年 ${m + 1} 月`,
      };
    case "QUARTERLY": {
      const q = Math.floor(m / 3);
      return {
        start: new Date(y, q * 3, 1),
        end: endOfDay(new Date(y, q * 3 + 3, 0)),
        label: `${y} 年 Q${q + 1}`,
      };
    }
    case "ANNUAL":
    default:
      return {
        start: new Date(y, 0, 1),
        end: endOfDay(new Date(y, 11, 31)),
        label: `${y} 年`,
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
  refIso: string | undefined,
  actor: Actor,
): Promise<GeneratedReport | null> {
  if (!(await canAccess(projectId, actor))) return null;
  const project = await reportRepo.getProject(projectId);
  if (!project) return null;

  const ref = refIso ? new Date(refIso) : new Date();
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
  const allDailyReports = await supervisionRepo.listByProjectInPeriod(
    projectId,
    start,
    end,
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
  const [wiDetails, cumulativeQtyTotals, periodQtyTotals] = await Promise.all([
    getWorkItemDetails(projectId),
    // 全期間加總供累計欄位；期間加總供「本期完成」（決策 A）
    loadDailyQtyTotals(projectId),
    loadDailyQtyTotalsInPeriod(projectId, start, end),
  ]);

  // 累計完成：各工項有效進度（決策 F）以預定工期天數加權
  const cumulativeActual = derivedProgress(wiDetails);
  // 累計預定：各工項於預定期間線性展開至期末
  const cumulativePlanned = plannedProgressAt(wiDetails, end);

  /*
    本期預定增量＝期末預定 − 期初前一刻預定。
    取期初「前一刻」而非期初當日，否則期初當日的增量會被算進上一期。
  */
  const beforeStart = new Date(start.getTime() - 1);
  const plannedAtStart = plannedProgressAt(wiDetails, beforeStart);
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
    wiDetails.map((w) => {
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
  const gap =
    cumulativePlanned != null ? cumulativeActual - cumulativePlanned : 0;
  const factsText = [
    `專案：${project.name}（${project.code}）`,
    `期間：${label}（${typeLabel}）`,
    `${periodWord}預定進度 ${currentPlanned ?? "—"}%，${periodWord}完成進度 ${currentActual ?? "—"}%`,
    `累計預定進度 ${cumulativePlanned ?? "—"}%，累計完成進度 ${cumulativeActual}%，${describeGap(gap)}`,
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
    duration,
    progress: {
      currentPlanned,
      currentActual,
      // 無任何具預定起訖日的工項時無從計算；以 0 呈現會誤導，故沿用 null 語意
      cumulativePlanned: cumulativePlanned ?? 0,
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

/**
 * 產出報表並留存一份草稿。
 *
 * 報表的每個數字都是即時推導（決策 A／F／I），同一期間在不同時間產生
 * 會得到不同結果；不留存則「送審出去的是哪一版」在系統中不存在。
 *
 * **僅供使用者明確要求留存時呼叫**，不是每次產生都存 ——
 * 報表畫面會在切換週期或日期時自動重新產生，若一併存檔會堆出大量無意義草稿，
 * 反而讓真正要送審的那一版被淹沒。單純預覽請用 `generateReport`。
 */
export async function generateAndSaveReport(
  projectId: string,
  type: ReportType,
  refIso: string | undefined,
  actor: Actor,
): Promise<{ id: string; report: GeneratedReport } | null> {
  const report = await generateReport(projectId, type, refIso, actor);
  if (!report) return null;

  const ref = refIso ? new Date(refIso) : new Date();
  const { start, end } = periodRange(type, ref);

  const saved = await savedReportRepo.create({
    projectId,
    type,
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
  return { id: saved.id, report };
}

export async function listSavedReports(projectId: string, actor: Actor) {
  if (!(await canAccess(projectId, actor))) return [];
  return savedReportRepo.listByProject(projectId);
}

export async function getSavedReport(id: string, actor: Actor) {
  const row = await savedReportRepo.findById(id);
  if (!row || !(await canAccess(row.projectId, actor))) return null;
  return row;
}

export type ConfirmResult = { ok: true } | { ok: false; error: string };

/**
 * 人工確認定稿。
 *
 * 確認後內容即為當時送審依據的快照，不可再修改或刪除；
 * 需要更新請重新產生一份。同一期間僅允許一份定稿 ——
 * 兩份都宣稱是「那個月的報表」時，無從判斷以何者為準。
 */
export async function confirmSavedReport(
  id: string,
  actor: Actor,
): Promise<ConfirmResult> {
  const row = await savedReportRepo.findById(id);
  if (!row) return { ok: false, error: "找不到此報表。" };
  if (!(await canAccess(row.projectId, actor))) {
    return { ok: false, error: "無權確認此報表。" };
  }
  if (row.status === "CONFIRMED") return { ok: true };

  const existing = await savedReportRepo.findConfirmedForPeriod(
    row.projectId,
    row.type,
    row.periodStart,
  );
  if (existing) {
    return {
      ok: false,
      error: `${row.periodLabel}已有一份定稿報表，請先確認要以何者為準。`,
    };
  }

  await savedReportRepo.confirm(id, {
    confirmedById: actor.id,
    confirmedBy: actor.name || null,
  });
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
  if (row.status === "CONFIRMED") {
    return { ok: false, error: "已確認的報表為送審依據之留存，不可刪除。" };
  }
  await savedReportRepo.remove(id);
  return { ok: true };
}
