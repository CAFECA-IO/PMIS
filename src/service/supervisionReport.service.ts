import * as reportRepo from "@/repository/supervisionReport.repository";
import * as memberRepo from "@/repository/projectMember.repository";
import * as inspectionRepo from "@/repository/inspection.repository";
import * as defectRepo from "@/repository/defect.repository";
import { canSeeAllProjects } from "@/lib/auth";
import {
  reportStatusMeta,
  inspectionTypeMeta,
  inspectionResultMeta,
  defectSeverityMeta,
} from "@/constant/pmis";
import type { AccountRole, ReportStatus } from "@/generated/prisma/enums";

/**
 * 監造報表（工程日誌 PMIS-11 之「日報」）服務。
 * 日報由監造人員人工填報，不再由 AI 生成；週/月/季/年報由 AI 彙整（見 report.service）。
 */
export type Actor = { id: string; role: AccountRole; name?: string };

const VALID_STATUSES = Object.keys(reportStatusMeta) as ReportStatus[];

async function canAccess(projectId: string, actor: Actor): Promise<boolean> {
  if (canSeeAllProjects(actor.role)) return true;
  return Boolean(await memberRepo.exists(projectId, actor.id));
}

function parseStatus(v: string | undefined): ReportStatus {
  return VALID_STATUSES.includes(v as ReportStatus)
    ? (v as ReportStatus)
    : "DRAFT";
}

export function listReports(projectId: string) {
  return reportRepo.listByProject(projectId);
}

export function listReportsInPeriod(projectId: string, start: Date, end: Date) {
  return reportRepo.listByProjectInPeriod(projectId, start, end);
}

export type ReportInput = {
  projectId: string;
  reportDate?: string;
  weather?: string;
  summary?: string;
  manpower?: string;
  equipment?: string;
  keyNotes?: string;
  status?: string;
};

/** 新增／更新每日監造報表（同一專案同一日期以更新處理）。 */
export async function fileReport(input: ReportInput, actor: Actor) {
  if (!input.projectId || !input.reportDate) return false;
  if (!(await canAccess(input.projectId, actor))) return false;

  const reportDate = new Date(input.reportDate);
  if (Number.isNaN(reportDate.getTime())) return false;

  const data = {
    weather: input.weather?.trim() || null,
    summary: input.summary?.trim() || null,
    manpower: input.manpower?.trim() || null,
    equipment: input.equipment?.trim() || null,
    keyNotes: input.keyNotes?.trim() || null,
    status: parseStatus(input.status),
  };

  const existing = await reportRepo.findByProjectDate(input.projectId, reportDate);
  if (existing) {
    await reportRepo.update(existing.id, data);
  } else {
    await reportRepo.create(input.projectId, {
      reportDate,
      filedBy: actor.name || null,
      ...data,
    });
  }
  return true;
}

export async function updateReport(
  id: string,
  input: Omit<ReportInput, "projectId" | "reportDate">,
  actor: Actor,
) {
  const existing = await reportRepo.findById(id);
  if (!existing || !(await canAccess(existing.projectId, actor))) return false;
  await reportRepo.update(id, {
    weather: input.weather?.trim() || null,
    summary: input.summary?.trim() || null,
    manpower: input.manpower?.trim() || null,
    equipment: input.equipment?.trim() || null,
    keyNotes: input.keyNotes?.trim() || null,
    status: parseStatus(input.status),
  });
  return true;
}

export async function deleteReport(id: string, actor: Actor) {
  const existing = await reportRepo.findById(id);
  if (!existing || !(await canAccess(existing.projectId, actor))) return false;
  await reportRepo.remove(id);
  return true;
}

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;

/**
 * 依專案與日期，彙整當日查驗與缺失，產生監造報表草稿（施工概況、重要事項），
 * 供日報填報時「一鍵帶入」（串接 PMIS-07）。
 */
export async function suggestReport(
  projectId: string,
  dateISO: string,
  actor: Actor,
): Promise<{ summary: string; keyNotes: string } | null> {
  if (!(await canAccess(projectId, actor))) return null;
  const target = dateISO.slice(0, 10);

  const [inspections, defects] = await Promise.all([
    inspectionRepo.listWithRelations(projectId),
    defectRepo.listWithProject(projectId),
  ]);

  const dayInspections = inspections.filter(
    (i) => ymd(new Date(i.scheduledAt)) === target,
  );
  const dayDefects = defects.filter(
    (d) => ymd(new Date(d.createdAt)) === target,
  );

  const summary =
    dayInspections.length > 0
      ? `當日查驗：${dayInspections
          .map(
            (i) =>
              `${inspectionTypeMeta[i.type].label}｜${
                i.workItem?.name ?? i.location ?? "全案"
              }（${inspectionResultMeta[i.result].label}）`,
          )
          .join("；")}。`
      : "當日無查驗紀錄。";

  const keyNotes =
    dayDefects.length > 0
      ? `當日缺失：${dayDefects
          .map(
            (d) =>
              `${d.title}（${defectSeverityMeta[d.severity].label}${
                d.workItem?.name ? `・${d.workItem.name}` : ""
              }）`,
          )
          .join("；")}。`
      : "當日無新增缺失。";

  return { summary, keyNotes };
}
