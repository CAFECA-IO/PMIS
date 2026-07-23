import * as workItemRepo from "@/repository/workItem.repository";
import * as memberRepo from "@/repository/projectMember.repository";
import * as milestoneRepo from "@/repository/milestone.repository";
import { canSeeAllProjects } from "@/lib/auth";
import { workItemStatusMeta } from "@/constant/pmis";
import type { AccountRole, WorkItemStatus } from "@/generated/prisma/enums";

export type Actor = { id: string; role: AccountRole };

const VALID_STATUSES = Object.keys(workItemStatusMeta) as WorkItemStatus[];

async function canAccess(projectId: string, actor: Actor): Promise<boolean> {
  if (canSeeAllProjects(actor.role)) return true;
  return Boolean(await memberRepo.exists(projectId, actor.id));
}

function parseDate(v: string | undefined): Date | null | undefined {
  if (v === undefined) return undefined;
  return v.trim() ? new Date(v) : null;
}

function parseProgress(v: string | undefined): number | undefined {
  if (v === undefined || v.trim() === "" || Number.isNaN(Number(v))) return undefined;
  return Math.min(100, Math.max(0, Math.round(Number(v))));
}

function parseStatus(v: string | undefined): WorkItemStatus | undefined {
  return VALID_STATUSES.includes(v as WorkItemStatus)
    ? (v as WorkItemStatus)
    : undefined;
}

/** 驗證里程碑屬於該專案，回傳有效 id 或 null。 */
async function resolveMilestone(
  milestoneId: string | undefined,
  projectId: string,
): Promise<string | null> {
  if (!milestoneId) return null;
  const m = await milestoneRepo.findById(milestoneId);
  return m && m.projectId === projectId ? m.id : null;
}

export type WorkItemInput = {
  projectId: string;
  milestoneId?: string;
  code?: string;
  name?: string;
  category?: string;
  plannedStart?: string;
  plannedEnd?: string;
  actualStart?: string;
  actualEnd?: string;
  progress?: string;
  status?: string;
};

export async function addWorkItem(input: WorkItemInput, actor: Actor) {
  const name = input.name?.trim();
  if (!input.projectId || !name) return false;
  if (!(await canAccess(input.projectId, actor))) return false;

  const created = await workItemRepo.create({
    projectId: input.projectId,
    code: input.code?.trim() || null,
    name,
    category: input.category?.trim() || null,
    plannedStart: parseDate(input.plannedStart) ?? undefined,
    plannedEnd: parseDate(input.plannedEnd) ?? undefined,
    actualStart: parseDate(input.actualStart) ?? undefined,
    actualEnd: parseDate(input.actualEnd) ?? undefined,
    progress: parseProgress(input.progress) ?? 0,
    status: parseStatus(input.status) ?? "NOT_STARTED",
  });
  const milestoneId = await resolveMilestone(input.milestoneId, input.projectId);
  if (milestoneId) await workItemRepo.setMilestone(created.id, milestoneId);
  return true;
}

export async function updateWorkItem(
  id: string,
  input: Omit<WorkItemInput, "projectId">,
  actor: Actor,
) {
  const existing = await workItemRepo.findById(id);
  if (!existing || !(await canAccess(existing.projectId, actor))) return false;
  const name = input.name?.trim();

  await workItemRepo.update(id, {
    code: input.code !== undefined ? input.code.trim() || null : undefined,
    name: name || undefined,
    category:
      input.category !== undefined ? input.category.trim() || null : undefined,
    plannedStart: parseDate(input.plannedStart),
    plannedEnd: parseDate(input.plannedEnd),
    actualStart: parseDate(input.actualStart),
    actualEnd: parseDate(input.actualEnd),
    progress: parseProgress(input.progress),
    status: parseStatus(input.status),
  });
  // milestoneId 一律依表單設定（空值＝取消歸屬）
  if (input.milestoneId !== undefined) {
    await workItemRepo.setMilestone(
      id,
      await resolveMilestone(input.milestoneId, existing.projectId),
    );
  }
  return true;
}

export async function deleteWorkItem(id: string, actor: Actor) {
  const existing = await workItemRepo.findById(id);
  if (!existing || !(await canAccess(existing.projectId, actor))) return false;
  await workItemRepo.remove(id);
  return true;
}
