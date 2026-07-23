import * as inspectionRepo from "@/repository/inspection.repository";
import * as defectRepo from "@/repository/defect.repository";
import * as workItemRepo from "@/repository/workItem.repository";
import * as memberRepo from "@/repository/projectMember.repository";
import { canSeeAllProjects } from "@/lib/auth";
import {
  inspectionTypeMeta,
  inspectionResultMeta,
  defectSeverityMeta,
  defectStatusMeta,
} from "@/constant/pmis";
import type {
  AccountRole,
  InspectionType,
  InspectionResult,
  DefectSeverity,
  DefectStatus,
} from "@/generated/prisma/enums";

export type Actor = { id: string; role: AccountRole; name?: string };

const VALID_INS_TYPES = Object.keys(inspectionTypeMeta) as InspectionType[];
const VALID_INS_RESULTS = Object.keys(inspectionResultMeta) as InspectionResult[];
const VALID_DEF_SEVERITIES = Object.keys(defectSeverityMeta) as DefectSeverity[];
const VALID_DEF_STATUSES = Object.keys(defectStatusMeta) as DefectStatus[];

async function canAccess(projectId: string, actor: Actor): Promise<boolean> {
  if (canSeeAllProjects(actor.role)) return true;
  return Boolean(await memberRepo.exists(projectId, actor.id));
}

/** 驗證工項屬於該專案，回傳有效的 workItemId 或 null。 */
async function resolveWorkItem(
  workItemId: string | undefined,
  projectId: string,
): Promise<string | null> {
  if (!workItemId) return null;
  const wi = await workItemRepo.findById(workItemId);
  return wi && wi.projectId === projectId ? wi.id : null;
}

export async function getQuality(projectId?: string) {
  const [inspections, defects] = await Promise.all([
    inspectionRepo.listWithRelations(projectId),
    defectRepo.listWithProject(projectId),
  ]);
  return { inspections, defects };
}

/** 專案的工項清單，供查驗/缺失表單的「所屬工項」下拉。 */
export function listWorkItems(projectId: string) {
  return workItemRepo.listByProject(projectId);
}

export type InspectionInput = {
  projectId: string;
  workItemId?: string;
  type?: string;
  scheduledAt?: string;
  inspector?: string;
  result?: string;
  location?: string;
  notes?: string;
};

export async function addInspection(input: InspectionInput, actor: Actor) {
  if (!input.projectId) return false;
  if (!(await canAccess(input.projectId, actor))) return false;

  const type = VALID_INS_TYPES.includes(input.type as InspectionType)
    ? (input.type as InspectionType)
    : "PROCESS";
  const result = VALID_INS_RESULTS.includes(input.result as InspectionResult)
    ? (input.result as InspectionResult)
    : "PENDING";

  await inspectionRepo.create({
    projectId: input.projectId,
    workItemId: await resolveWorkItem(input.workItemId, input.projectId),
    type,
    scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : new Date(),
    inspector: input.inspector?.trim() || actor.name || null,
    result,
    location: input.location?.trim() || null,
    notes: input.notes?.trim() || null,
  });
  return true;
}

export type DefectInput = {
  projectId: string;
  workItemId?: string;
  title?: string;
  description?: string;
  severity?: string;
  status?: string;
  assignedTo?: string;
  dueDate?: string;
};

export async function addDefect(input: DefectInput, actor: Actor) {
  const title = input.title?.trim();
  if (!input.projectId || !title) return false;
  if (!(await canAccess(input.projectId, actor))) return false;

  const severity = VALID_DEF_SEVERITIES.includes(input.severity as DefectSeverity)
    ? (input.severity as DefectSeverity)
    : "MEDIUM";
  const status = VALID_DEF_STATUSES.includes(input.status as DefectStatus)
    ? (input.status as DefectStatus)
    : "OPEN";

  await defectRepo.create({
    projectId: input.projectId,
    workItemId: await resolveWorkItem(input.workItemId, input.projectId),
    title,
    description: input.description?.trim() || null,
    severity,
    status,
    reportedBy: actor.name || null,
    assignedTo: input.assignedTo?.trim() || null,
    dueDate: input.dueDate ? new Date(input.dueDate) : null,
  });
  return true;
}
