import * as reportRepo from "@/repository/report.repository";
import * as supervisionRepo from "@/repository/supervisionReport.repository";
import * as memberRepo from "@/repository/projectMember.repository";
import { getWorkItemDetails } from "@/service/project.service";
import { rolledUpProgress } from "@/service/obligation-rollup";
import * as calc from "@/service/carbon.calc";
import * as faith from "@/service/faith.service";
import { canSeeAllProjects } from "@/lib/auth";
import {
  assembleDatasets,
  diffDays,
  type ReportDataset,
  type ReportDatasetInput,
  type DatasetData,
} from "@/service/report-datasets";
import { expandChartDirectives } from "@/service/report-chart-expander";
import {
  defectSeverityMeta,
  inspectionResultMeta,
  submittalStatusMeta,
  submittalCategoryMeta,
  workItemStatusMeta,
  carbonScopeMeta,
  reportStatusMeta,
} from "@/constant/pmis";
import { formatDate } from "@/lib/utils";
import type { AccountRole, CarbonScope } from "@/generated/prisma/enums";

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

function countBy<T>(items: T[], key: (t: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const it of items) {
    const k = key(it);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

// Info: (20260721 - Luphia) 產出 mermaid 圓餅圖區塊；無資料回傳空字串
function pie(title: string, entries: [string, number][]): string {
  const rows = entries.filter(([, v]) => v > 0);
  if (rows.length === 0) return `_（本期無資料）_\n`;
  return [
    "```mermaid",
    "pie showData",
    `  title ${title}`,
    ...rows.map(([l, v]) => `  "${l}" : ${v}`),
    "```",
    "",
  ].join("\n");
}

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

  const [defects, open, inspections, submittals, ehs, inventories, dailyReports] =
    await Promise.all([
      reportRepo.defectsInPeriod(projectId, start, end),
      reportRepo.openDefects(projectId),
      reportRepo.inspectionsInPeriod(projectId, start, end),
      reportRepo.submittalsInPeriod(projectId, start, end),
      reportRepo.ehsInPeriod(projectId, start, end),
      reportRepo.carbonInventories(projectId),
      supervisionRepo.listByProjectInPeriod(projectId, start, end),
    ]);

  const wiDetails = await getWorkItemDetails(projectId);
  const progress = rolledUpProgress(project.obligations, wiDetails);

  const insByResult = countBy(inspections, (i) => i.result);
  const passRate = (() => {
    const decided =
      (insByResult.PASSED ?? 0) +
      (insByResult.CONDITIONAL ?? 0) +
      (insByResult.FAILED ?? 0);
    return decided > 0
      ? Math.round(((insByResult.PASSED ?? 0) / decided) * 100)
      : 0;
  })();
  const openBySeverity = countBy(open, (d) => d.severity);
  const subByStatus = countBy(submittals, (s) => s.status);
  const wiByStatus = countBy(project.workItems, (w) => w.status);

  const carbonEntries = inventories.flatMap((inv) =>
    inv.entries.map((e) => ({
      scope: e.scope,
      co2e: Number(e.co2e),
      status: e.status,
    })),
  );
  const carbon = calc.summarizeEntries(carbonEntries);

  const inRange = (d: Date | null) =>
    d != null && new Date(d) >= start && new Date(d) <= end;
  const msDue = project.obligations.filter((m) => inRange(m.dueDate));
  const msDone = project.obligations.filter((m) => inRange(m.actualDate));

  // Info: 監造日報（人工填報）彙整——供 AI 週/月/季/年報以實際填報內容為依據
  const dailyDigest = dailyReports
    .map(
      (r) =>
        `${formatDate(r.reportDate)}${r.weather ? `(${r.weather})` : ""}：${
          r.summary?.trim() || "—"
        }${r.keyNotes?.trim() ? `；重要：${r.keyNotes.trim()}` : ""}`,
    )
    .join("\n");

  // Info: (20260721 - Luphia) AI 摘要（失敗時以模板回退）
  const factsText = [
    `專案：${project.name}（${project.code}）`,
    `期間：${label}（${typeLabel}）`,
    `整體進度 ${progress.overall}%，預定 ${progress.planned}%，落差 ${progress.gap}%`,
    `本期查驗 ${inspections.length} 件，合格率 ${passRate}%`,
    `未結案缺失 ${open.length} 件，本期新增缺失 ${defects.length} 件`,
    `本期送審 ${submittals.length} 件`,
    `本期環安衛稽核 ${ehs.length} 件`,
    `碳排累計 ${carbon.totalTonnes} tCO₂e`,
    `本期預定履約事項 ${msDue.length} 項、達成 ${msDone.length} 項`,
    `本期監造日報 ${dailyReports.length} 篇${
      dailyDigest ? `，內容如下（請據此彙整重點）：\n${dailyDigest}` : ""
    }`,
  ].join("\n");
  const narrative = await faith.generateReportNarrative(
    factsText,
    typeLabel,
  );

  const title = `${project.name}｜${label}${typeLabel}`;

  const scopeEntries: [string, number][] = (
    Object.keys(carbon.byScopeKg) as CarbonScope[]
  ).map((s) => [
    carbonScopeMeta[s].label,
    Math.round((carbon.byScopeKg[s] / 1000) * 100) / 100,
  ]);

  // ── 白名單數據集：上一期件數比較、改善耗時、審查天數需額外查詢 ──
  const prev = periodRange(type, previousRef(type, ref));
  const [
    prevDefects,
    prevInspections,
    prevSubmittals,
    prevEhs,
    resolvedDefects,
    reviewedSubmittals,
  ] = await Promise.all([
    reportRepo.defectsInPeriod(projectId, prev.start, prev.end),
    reportRepo.inspectionsInPeriod(projectId, prev.start, prev.end),
    reportRepo.submittalsInPeriod(projectId, prev.start, prev.end),
    reportRepo.ehsInPeriod(projectId, prev.start, prev.end),
    reportRepo.defectsResolvedInPeriod(projectId, start, end),
    reportRepo.submittalsReviewedInPeriod(projectId, start, end),
  ]);

  const resolutionDays = resolvedDefects
    .filter((d) => d.resolvedAt)
    .map((d) => diffDays(d.createdAt, d.resolvedAt as Date));

  const reviewGroups = new Map<string, number[]>();
  for (const s of reviewedSubmittals) {
    if (!s.actualSubmitDate || !s.reviewDate) continue;
    const cat = submittalCategoryMeta[s.category].label;
    const arr = reviewGroups.get(cat) ?? [];
    arr.push(diffDays(s.actualSubmitDate, s.reviewDate));
    reviewGroups.set(cat, arr);
  }

  const datasetInput: ReportDatasetInput = {
    workItemStatus: Object.entries(wiByStatus).map(([k, v]) => ({
      label: workItemStatusMeta[k as keyof typeof workItemStatusMeta]?.label ?? k,
      value: v,
    })),
    inspectionResult: Object.entries(insByResult).map(([k, v]) => ({
      label:
        inspectionResultMeta[k as keyof typeof inspectionResultMeta]?.label ?? k,
      value: v,
    })),
    periodCompare: {
      prevLabel: "上期",
      curLabel: "本期",
      rows: [
        { category: "新增缺失", prev: prevDefects.length, cur: defects.length },
        { category: "查驗", prev: prevInspections.length, cur: inspections.length },
        { category: "送審", prev: prevSubmittals.length, cur: submittals.length },
        { category: "環安衛稽核", prev: prevEhs.length, cur: ehs.length },
      ],
    },
    openDefects: open.map((d) => ({
      title: d.title,
      severity: d.severity,
      dueDate: d.dueDate,
    })),
    now: new Date(),
    resolutionDays,
    reviewDaysByCategory: [...reviewGroups.entries()].map(([category, days]) => ({
      category,
      days,
    })),
  };

  const datasets = assembleDatasets(datasetInput);
  const catalog = buildCatalogText(datasets);

  // ── 決定論 fallback：LLM 失敗時沿用原本的組裝（已驗證可用）──
  const deterministicBody = (): string => {
    const md: string[] = [];
    md.push("## 摘要");
    md.push(narrative);
    md.push("");

    if (dailyReports.length > 0) {
    md.push(`## 監造日報彙整（本期 ${dailyReports.length} 篇）`);
    for (const r of dailyReports) {
      md.push(
        `- **${formatDate(r.reportDate)}**${
          r.weather ? `（${r.weather}）` : ""
        } ${reportStatusMeta[r.status].label}：${r.summary?.trim() || "—"}${
          r.keyNotes?.trim() ? ` ｜ 重要：${r.keyNotes.trim()}` : ""
        }`,
      );
    }
    md.push("");
  }

  md.push("## 工程進度");
  md.push(
    `- 整體進度 **${progress.overall}%**（預定 ${progress.planned}%，落差 ${progress.gap}%）`,
  );
  md.push(`- 工期：${formatDate(project.startDate)} ~ ${formatDate(project.endDate)}`);
  md.push("");
  md.push(
    pie(
      "工程分項狀態",
      Object.entries(wiByStatus).map(([k, v]) => [
        workItemStatusMeta[k as keyof typeof workItemStatusMeta]?.label ?? k,
        v,
      ]),
    ),
  );

  md.push("## 品質稽核");
  md.push(`- 本期查驗 ${inspections.length} 件，合格率 ${passRate}%`);
  md.push(`- 未結案缺失 ${open.length} 件，本期新增 ${defects.length} 件`);
  md.push("");
  md.push(
    pie(
      "本期查驗結果",
      Object.entries(insByResult).map(([k, v]) => [
        inspectionResultMeta[k as keyof typeof inspectionResultMeta]?.label ?? k,
        v,
      ]),
    ),
  );
  md.push(
    pie(
      "未結案缺失嚴重度",
      Object.entries(openBySeverity).map(([k, v]) => [
        defectSeverityMeta[k as keyof typeof defectSeverityMeta]?.label ?? k,
        v,
      ]),
    ),
  );

  md.push("## 送審管理");
  md.push(`- 本期送審 ${submittals.length} 件`);
  md.push("");
  md.push(
    pie(
      "本期送審狀態",
      Object.entries(subByStatus).map(([k, v]) => [
        submittalStatusMeta[k as keyof typeof submittalStatusMeta]?.label ?? k,
        v,
      ]),
    ),
  );

  md.push("## 環安衛");
  md.push(`- 本期稽核 ${ehs.length} 件`);
  md.push("");

  md.push("## 碳排放");
  md.push(`- 累計排放 **${carbon.totalTonnes} tCO₂e**`);
  md.push("");
  md.push(pie("碳排放範疇分布 (tCO₂e)", scopeEntries));

  md.push("## 履約事項");
  md.push(`- 本期預定 ${msDue.length} 項、達成 ${msDone.length} 項`);
  if (msDue.length > 0 || msDone.length > 0) {
    md.push("");
    md.push("| 履約事項 | 期限 | 實際達成 |");
    md.push("| --- | --- | --- |");
    const shown = [...new Set([...msDue, ...msDone])].slice(0, 12);
    for (const m of shown) {
      md.push(
        `| ${m.title} | ${formatDate(m.dueDate)} | ${m.actualDate ? formatDate(m.actualDate) : "—"} |`,
      );
    }
  }
  md.push("");

  if (open.length > 0) {
    md.push("## 待改善缺失（前 5 筆）");
    for (const d of open.slice(0, 5)) {
      md.push(
        `- ${d.title}（${defectSeverityMeta[d.severity].label}，期限 ${d.dueDate ? formatDate(d.dueDate) : "未定"}）`,
      );
    }
    md.push("");
  }

    return md.join("\n");
  };

  const header = [
    `# ${title}`,
    `> 專案編號 ${project.code}｜承包商 ${project.contractor ?? "—"}｜監造 ${project.supervisor ?? "—"}｜產生時間 ${formatDate(new Date())}`,
    "> **本報告為費思 AI 生成草稿；數據由系統彙整、圖表由既有數據集展開；核定前請人工確認。**",
  ].join("\n");

  // 主路徑：LLM 主導本體（含 pmis-chart 指令）→ 程式展開為真數據圖；失敗回退決定論組裝
  const llmBody = await faith.generateReportBody(factsText, catalog, typeLabel);
  const body = llmBody
    ? expandChartDirectives(llmBody, datasets)
    : deterministicBody();

  const sources = datasets.map((d) => d.source);
  const sourcesMd =
    sources.length > 0
      ? ["## 資料來源", ...datasets.map((d) => `- ${d.title}：${d.source}`)].join(
          "\n",
        )
      : "";

  const markdown = [
    header,
    "",
    body,
    ...(sourcesMd ? ["", sourcesMd] : []),
    "",
    "---",
    "_本報告由費思 AI 依系統紀錄生成，屬草稿，數據僅供監造參考；核定前請人工確認。_",
  ].join("\n");

  return {
    title,
    periodLabel: label,
    typeLabel,
    markdown,
    isDraft: true,
    sources,
    aiAuthored: Boolean(llmBody),
  };
}

// Info: (20260803 - Julian) 取得上一期的參考日（供本期 vs 上期比較）
function previousRef(type: ReportType, ref: Date): Date {
  const d = new Date(ref);
  switch (type) {
    case "DAILY":
      d.setDate(d.getDate() - 1);
      break;
    case "WEEKLY":
      d.setDate(d.getDate() - 7);
      break;
    case "MONTHLY":
      d.setMonth(d.getMonth() - 1);
      break;
    case "QUARTERLY":
      d.setMonth(d.getMonth() - 3);
      break;
    case "ANNUAL":
    default:
      d.setFullYear(d.getFullYear() - 1);
      break;
  }
  return d;
}

// Info: (20260803 - Julian) 把白名單數據集整理成給 LLM 的目錄文字（含實際數字供其行文引用）
function buildCatalogText(datasets: ReportDataset[]): string {
  if (datasets.length === 0) return "（本期無可用數據集）";
  return datasets
    .map(
      (d) =>
        `- id: ${d.id}｜${d.title}：${d.summary}｜可用圖種: ${d.allowedCharts.join(" / ")}\n  數據: ${previewData(d.data)}`,
    )
    .join("\n");
}

function previewData(data: DatasetData): string {
  switch (data.shape) {
    case "categorical":
      return data.entries.map((e) => `${e.label} ${e.value}`).join("、");
    case "paired":
      return `${data.leftName} vs ${data.rightName}｜${data.rows
        .map((r) => `${r.category} ${r.left}→${r.right}`)
        .join("、")}`;
    case "points":
      return data.points.map((p) => `${p.label}(${p.x},${p.y})`).join("、");
    case "bins":
      return data.bins.map((b) => `${b.label}:${b.count}`).join("、");
    case "boxes":
      return data.boxes
        .map((b) => `${b.label} ${b.min}/${b.q1}/${b.median}/${b.q3}/${b.max}`)
        .join("；");
    default:
      return "";
  }
}
