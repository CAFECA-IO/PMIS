import * as reportRepo from "@/repository/report.repository";
import * as memberRepo from "@/repository/projectMember.repository";
import { computeMilestoneProgress } from "@/service/project.service";
import * as calc from "@/service/carbon.calc";
import * as aiService from "@/service/ai.service";
import { canSeeAllProjects } from "@/lib/auth";
import {
  defectSeverityMeta,
  inspectionResultMeta,
  submittalStatusMeta,
  workItemStatusMeta,
  carbonScopeMeta,
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

  const [defects, open, inspections, submittals, ehs, inventories] =
    await Promise.all([
      reportRepo.defectsInPeriod(projectId, start, end),
      reportRepo.openDefects(projectId),
      reportRepo.inspectionsInPeriod(projectId, start, end),
      reportRepo.submittalsInPeriod(projectId, start, end),
      reportRepo.ehsInPeriod(projectId, start, end),
      reportRepo.carbonInventories(projectId),
    ]);

  const progress = computeMilestoneProgress(
    project.milestones.filter((m) => m.type === "MILESTONE"),
  );

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
  const msDue = project.milestones.filter((m) => inRange(m.plannedDate));
  const msDone = project.milestones.filter((m) => inRange(m.actualDate));

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
    `本期預定里程碑 ${msDue.length} 項、達成 ${msDone.length} 項`,
  ].join("\n");
  const narrative = await aiService.generateReportNarrative(
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

  const md: string[] = [];
  md.push(`# ${title}`);
  md.push(
    `> 專案編號 ${project.code}｜承包商 ${project.contractor ?? "—"}｜監造 ${project.supervisor ?? "—"}｜產生時間 ${formatDate(new Date())}`,
  );
  md.push("");
  md.push("## 摘要");
  md.push(narrative);
  md.push("");

  md.push("## 工程進度");
  md.push(
    `- 整體進度 **${progress.overall}%**（預定 ${progress.planned}%，落差 ${progress.gap}%）`,
  );
  md.push(`- 工期：${formatDate(project.startDate)} ~ ${formatDate(project.endDate)}`);
  md.push("");
  md.push(
    pie(
      "分項工程狀態",
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

  md.push("## 里程碑");
  md.push(`- 本期預定 ${msDue.length} 項、達成 ${msDone.length} 項`);
  if (msDue.length > 0 || msDone.length > 0) {
    md.push("");
    md.push("| 里程碑 | 預定日 | 實際達成 |");
    md.push("| --- | --- | --- |");
    const shown = [...new Set([...msDue, ...msDone])].slice(0, 12);
    for (const m of shown) {
      md.push(
        `| ${m.name} | ${formatDate(m.plannedDate)} | ${m.actualDate ? formatDate(m.actualDate) : "—"} |`,
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

  md.push("---");
  md.push("_本報告由費思 AI 依系統紀錄自動生成，數據僅供監造參考。_");

  return { title, periodLabel: label, typeLabel, markdown: md.join("\n") };
}
