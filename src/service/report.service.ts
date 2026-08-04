import * as reportRepo from "@/repository/report.repository";
import * as supervisionRepo from "@/repository/supervisionReport.repository";
import * as memberRepo from "@/repository/projectMember.repository";
import { getWorkItemDetails } from "@/service/project.service";
import { rolledUpProgress } from "@/service/obligation-rollup";
import * as faith from "@/service/faith.service";
import { canSeeAllProjects } from "@/lib/auth";
import { buildSCurve } from "@/service/scurve";
import {
  PERIOD_LABEL,
  PERIOD_REPORT_NAME,
  describeGap,
  monthLabel,
  periodProgressDelta,
  summarizeDuration,
  summarizeWorkDays,
  trimCurveWindow,
} from "@/service/report-period";
import {
  buildReportMarkdown,
  type ProgressCurvePoint,
  type WorkItemRow,
} from "@/service/report-template";
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

  const dailyReports = await supervisionRepo.listByProjectInPeriod(
    projectId,
    start,
    end,
  );

  // ── 進度：累計取既有上捲邏輯，本期增量由履約事項權重推導（無需期末快照）──
  const wiDetails = await getWorkItemDetails(projectId);
  const rolled = rolledUpProgress(project.obligations, wiDetails);
  const delta = periodProgressDelta(
    project.obligations.map((o) => ({
      weight: o.weight,
      dueDate: o.dueDate,
      actualDate: o.actualDate,
    })),
    start,
    end,
  );

  // ── S-Curve：以本專案履約事項建曲線，截取期末前後區間 ──
  const curveAll = buildSCurve(
    project.obligations.map((o) => ({
      weight: o.weight,
      plannedDate: o.dueDate,
      actualDate: o.actualDate,
    })),
  );
  const curve: ProgressCurvePoint[] = trimCurveWindow(
    curveAll,
    monthLabel(end),
    6,
  ).map((p) => ({
    label: p.label,
    planned: p.planned,
    ...(p.actual != null ? { actual: p.actual } : {}),
  }));

  // ── 工項估驗明細：金額由契約數量×單價推導；本期完成需期末快照，暫為 null ──
  const workItems: WorkItemRow[] = project.workItems.map((w) => {
    const qty = toNum(w.contractQty);
    const price = toNum(w.unitPrice);
    const done = toNum(w.completedQty);
    const contractAmount = qty != null && price != null ? qty * price : null;
    const cumulativeAmount = done != null && price != null ? done * price : null;
    return {
      code: w.wbsCode ?? w.code ?? null,
      name: w.name,
      contractAmount,
      cumulativePercent: Number.isFinite(w.progress) ? w.progress : null,
      cumulativeAmount,
      currentPercent: null,
      currentAmount: null,
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
    })),
  );

  // ── 期間評述：僅餵摘要層既算數字，LLM 不得引入其他資訊 ──
  const gap = rolled.overall - rolled.planned;
  const factsText = [
    `專案：${project.name}（${project.code}）`,
    `期間：${label}（${typeLabel}）`,
    `${periodWord}預定進度 ${delta.planned ?? "—"}%，${periodWord}完成進度 ${delta.actual ?? "—"}%`,
    `累計預定進度 ${rolled.planned}%，累計完成進度 ${rolled.overall}%，${describeGap(gap)}`,
    duration.elapsed != null && duration.total != null
      ? `工期使用 ${duration.elapsed} / ${duration.total} 天，剩餘 ${duration.remaining} 天`
      : "工期資料不完整（契約工期或開工日未填）",
    `${periodWord}監造日報 ${workDays.total} 篇：施工 ${workDays.working} 天、雨天停工 ${workDays.rainStop} 天、例假日 ${workDays.holiday} 天`,
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
    duration,
    progress: {
      currentPlanned: delta.planned,
      currentActual: delta.actual,
      cumulativePlanned: rolled.planned,
      cumulativeActual: rolled.overall,
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
