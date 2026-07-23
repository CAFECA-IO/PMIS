"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import * as projectService from "@/service/project.service";
import * as workItemService from "@/service/workItem.service";
import { requireUser } from "@/service/auth.service";
import { currentUserCanEdit } from "@/service/access.service";

export type ActionState = { error?: string };

async function canEdit() {
  return currentUserCanEdit("/projects");
}

function field(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === "string" ? value : undefined;
}

function refreshProject(id: string) {
  revalidatePath(`/projects/${id}`);
  revalidatePath("/projects");
  revalidatePath("/schedule");
  revalidatePath("/");
}

async function actor() {
  const user = await requireUser();
  return { id: user.id, role: user.role };
}

// ── 分項工程（WorkItem, PMIS-04）新增/編輯/刪除 ─────────────
export async function createWorkItemAction(formData: FormData) {
  if (!(await canEdit())) return;
  const projectId = field(formData, "projectId");
  if (!projectId) return;
  await workItemService.addWorkItem(
    {
      projectId,
      milestoneId: field(formData, "milestoneId"),
      code: field(formData, "code"),
      name: field(formData, "name"),
      category: field(formData, "category"),
      plannedStart: field(formData, "plannedStart"),
      plannedEnd: field(formData, "plannedEnd"),
      actualStart: field(formData, "actualStart"),
      actualEnd: field(formData, "actualEnd"),
      progress: field(formData, "progress"),
      status: field(formData, "status"),
    },
    await actor(),
  );
  refreshProject(projectId);
}

export async function updateWorkItemAction(formData: FormData) {
  if (!(await canEdit())) return;
  const id = field(formData, "id");
  const projectId = field(formData, "projectId");
  if (!id || !projectId) return;
  await workItemService.updateWorkItem(
    id,
    {
      milestoneId: field(formData, "milestoneId"),
      code: field(formData, "code"),
      name: field(formData, "name"),
      category: field(formData, "category"),
      plannedStart: field(formData, "plannedStart"),
      plannedEnd: field(formData, "plannedEnd"),
      actualStart: field(formData, "actualStart"),
      actualEnd: field(formData, "actualEnd"),
      progress: field(formData, "progress"),
      status: field(formData, "status"),
    },
    await actor(),
  );
  refreshProject(projectId);
}

export async function deleteWorkItemAction(id: string, projectId: string) {
  if (!(await canEdit())) return;
  await workItemService.deleteWorkItem(id, await actor());
  refreshProject(projectId);
}

// ── create (useActionState form) ───────────────────────────
export async function createProject(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (!(await canEdit())) return { error: "權限不足，無法編輯此模組。" };
  const result = await projectService.createProject({
    code: field(formData, "code"),
    name: field(formData, "name"),
    description: field(formData, "description"),
    location: field(formData, "location"),
    client: field(formData, "client"),
    contractor: field(formData, "contractor"),
    supervisor: field(formData, "supervisor"),
    budget: field(formData, "budget"),
    startDate: field(formData, "startDate"),
    endDate: field(formData, "endDate"),
    status: field(formData, "status"),
  });
  if (!result.ok) return { error: result.error };
  revalidatePath("/projects");
  revalidatePath("/");
  redirect("/projects");
}

// ── update / add (plain <form action>) ─────────────────────
export async function updateProjectAction(formData: FormData) {
  if (!(await canEdit())) return;
  const id = field(formData, "id");
  if (!id) return;
  await projectService.updateProject(id, {
    name: field(formData, "name"),
    description: field(formData, "description"),
    location: field(formData, "location"),
    contractNo: field(formData, "contractNo"),
    client: field(formData, "client"),
    contractor: field(formData, "contractor"),
    supervisor: field(formData, "supervisor"),
    budget: field(formData, "budget"),
    startDate: field(formData, "startDate"),
    endDate: field(formData, "endDate"),
    status: field(formData, "status"),
  });
  refreshProject(id);
}

export async function addMilestoneAction(formData: FormData) {
  if (!(await canEdit())) return;
  const projectId = field(formData, "projectId");
  if (!projectId) return;
  await projectService.addMilestone({
    projectId,
    name: field(formData, "name"),
    type: field(formData, "type"),
    plannedDate: field(formData, "plannedDate"),
    actualDate: field(formData, "actualDate"),
    weight: field(formData, "weight"),
    commissioning: field(formData, "commissioning"),
    docNo: field(formData, "docNo"),
    note: field(formData, "note"),
  });
  refreshProject(projectId);
}

export async function addContractChangeAction(formData: FormData) {
  if (!(await canEdit())) return;
  const projectId = field(formData, "projectId");
  if (!projectId) return;
  await projectService.addContractChange({
    projectId,
    sequence: field(formData, "sequence"),
    description: field(formData, "description"),
    amountAfter: field(formData, "amountAfter"),
    daysChanged: field(formData, "daysChanged"),
    approvedDate: field(formData, "approvedDate"),
    docNo: field(formData, "docNo"),
  });
  refreshProject(projectId);
}

export async function addProjectMemberAction(formData: FormData) {
  if (!(await canEdit())) return;
  const projectId = field(formData, "projectId");
  if (!projectId) return;
  await projectService.addProjectMember({
    projectId,
    accountId: field(formData, "accountId"),
    role: field(formData, "role"),
  });
  refreshProject(projectId);
}

export async function removeProjectMemberAction(id: string, projectId: string) {
  if (!(await canEdit())) return;
  await projectService.removeProjectMember(id);
  refreshProject(projectId);
}

export async function addDocumentAction(formData: FormData) {
  if (!(await canEdit())) return;
  const projectId = field(formData, "projectId");
  if (!projectId) return;
  await projectService.addDocument({
    projectId,
    category: field(formData, "category"),
    name: field(formData, "name"),
    fileNo: field(formData, "fileNo"),
    url: field(formData, "url"),
    issuedDate: field(formData, "issuedDate"),
    note: field(formData, "note"),
  });
  refreshProject(projectId);
}

// ── soft delete / restore (called directly from client) ────
export async function deleteProjectAction(id: string) {
  if (!(await canEdit())) return;
  await projectService.deleteProject(id);
  revalidatePath("/projects");
  revalidatePath("/");
}
export async function restoreProjectAction(id: string) {
  if (!(await canEdit())) return;
  await projectService.restoreProject(id);
  revalidatePath("/projects");
  revalidatePath("/");
}

export async function deleteMilestoneAction(id: string, projectId: string) {
  if (!(await canEdit())) return;
  await projectService.deleteMilestone(id);
  refreshProject(projectId);
}
export async function restoreMilestoneAction(id: string, projectId: string) {
  if (!(await canEdit())) return;
  await projectService.restoreMilestone(id);
  refreshProject(projectId);
}

export async function deleteContractChangeAction(id: string, projectId: string) {
  if (!(await canEdit())) return;
  await projectService.deleteContractChange(id);
  refreshProject(projectId);
}
export async function restoreContractChangeAction(
  id: string,
  projectId: string,
) {
  if (!(await canEdit())) return;
  await projectService.restoreContractChange(id);
  refreshProject(projectId);
}

export async function deleteDocumentAction(id: string, projectId: string) {
  if (!(await canEdit())) return;
  await projectService.deleteDocument(id);
  refreshProject(projectId);
}
export async function restoreDocumentAction(id: string, projectId: string) {
  if (!(await canEdit())) return;
  await projectService.restoreDocument(id);
  refreshProject(projectId);
}
