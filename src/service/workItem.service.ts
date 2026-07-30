import * as workItemRepo from "@/repository/workItem.repository";
import * as memberRepo from "@/repository/projectMember.repository";
import * as obligationRepo from "@/repository/obligation.repository";
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

/** 驗證履約事項屬於該專案，回傳有效 id 或 null。 */
async function resolveObligation(
  obligationId: string | undefined,
  projectId: string,
): Promise<string | null> {
  if (!obligationId) return null;
  const m = await obligationRepo.findById(obligationId);
  return m && m.projectId === projectId ? m.id : null;
}

export type WorkItemInput = {
  projectId: string;
  obligationId?: string;
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

  await workItemRepo.create({
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
    obligationId: await resolveObligation(input.obligationId, input.projectId),
  });
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
  // obligationId 一律依表單設定（空值＝取消歸屬）
  if (input.obligationId !== undefined) {
    await workItemRepo.setObligation(
      id,
      await resolveObligation(input.obligationId, existing.projectId),
    );
  }
  return true;
}

/**
 * 標記工程分項完成。
 *
 * 一併把百分比補到 100、實際完工日補今日 ——
 * 「狀態已完成、進度 60%」的紀錄會讓進度上捲算出比實際更低的數字，
 * 而使用者以為自己已經回報完成了。
 */
export async function completeWorkItem(id: string, actor: Actor) {
  const existing = await workItemRepo.findById(id);
  if (!existing || !(await canAccess(existing.projectId, actor))) return false;

  await workItemRepo.update(id, {
    status: "COMPLETED",
    progress: 100,
    // 已填實際完工日者不覆寫：那是承辦人記錄的真實日期
    actualEnd: existing.actualEnd ?? new Date(),
    actualStart: existing.actualStart ?? undefined,
  });
  return true;
}

/**
 * 只更新完成百分比與實際起訖日（履約事項細節頁用）。
 *
 * 與 updateWorkItem 分開是為了不必回傳名稱、類別等欄位 ——
 * 那張表單不在這裡，硬用同一個入口會把沒送出的欄位清成空值。
 */
export async function updateWorkItemProgress(
  id: string,
  input: { progress?: string; actualStart?: string; actualEnd?: string; status?: string },
  actor: Actor,
) {
  const existing = await workItemRepo.findById(id);
  if (!existing || !(await canAccess(existing.projectId, actor))) return false;

  await workItemRepo.update(id, {
    progress: parseProgress(input.progress),
    status: parseStatus(input.status),
    actualStart: parseDate(input.actualStart),
    actualEnd: parseDate(input.actualEnd),
  });
  return true;
}

export async function deleteWorkItem(id: string, actor: Actor) {
  const existing = await workItemRepo.findById(id);
  if (!existing || !(await canAccess(existing.projectId, actor))) return false;
  await workItemRepo.remove(id);
  return true;
}
