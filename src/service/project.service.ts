import * as projectRepo from "@/repository/project.repository";
import * as milestoneRepo from "@/repository/milestone.repository";
import * as contractChangeRepo from "@/repository/contractChange.repository";
import * as documentRepo from "@/repository/projectDocument.repository";
import * as projectMemberRepo from "@/repository/projectMember.repository";
import * as accountRepo from "@/repository/account.repository";
import {
  projectStatusMeta,
  milestoneTypeMeta,
  projectDocumentCategoryMeta,
} from "@/constant/pmis";
import type {
  ProjectStatus,
  MilestoneType,
  ProjectDocumentCategory,
  AccountRole,
  ProjectMemberRole,
} from "@/generated/prisma/enums";
import type { UpdateProjectData } from "@/repository/project.repository";
import { canSeeAllProjects } from "@/lib/auth";

const VALID_STATUSES = Object.keys(projectStatusMeta) as ProjectStatus[];
const VALID_MILESTONE_TYPES = Object.keys(milestoneTypeMeta) as MilestoneType[];
const VALID_DOC_CATEGORIES = Object.keys(
  projectDocumentCategoryMeta,
) as ProjectDocumentCategory[];

// ── helpers ────────────────────────────────────────────────
/** undefined = not provided (skip); "" = clear (null); value = set */
function optionalText(v: string | undefined): string | null | undefined {
  if (v === undefined) return undefined;
  const t = v.trim();
  return t.length > 0 ? t : null;
}
function optionalNumber(v: string | undefined): number | null | undefined {
  if (v === undefined) return undefined;
  if (v.trim() === "" || Number.isNaN(Number(v))) return null;
  return Number(v);
}
function optionalDate(v: string | undefined): Date | null | undefined {
  if (v === undefined) return undefined;
  return v.trim() ? new Date(v) : null;
}
function requiredText(v: string | undefined): string | undefined {
  const t = v?.trim();
  return t ? t : undefined;
}

// ── queries ────────────────────────────────────────────────
/** 由里程碑權重計算單一專案的整體/預定進度與落差。 */
export function computeMilestoneProgress(
  milestones: { weight: number; plannedDate: Date | null; actualDate: Date | null }[],
) {
  const now = Date.now();
  const round = (n: number) => Math.round(n * 100) / 100;
  let total = 0;
  let actual = 0;
  let planned = 0;
  for (const m of milestones) {
    total += m.weight;
    if (m.actualDate) actual += m.weight;
    if (m.plannedDate && m.plannedDate.getTime() <= now) planned += m.weight;
  }
  const overall = total > 0 ? round((actual / total) * 100) : 0;
  const plannedPct = total > 0 ? round((planned / total) * 100) : 0;
  return { overall, planned: plannedPct, gap: round(overall - plannedPct) };
}

type OverviewProject = {
  status: string;
  budget: unknown;
  endDate: Date | null;
  milestones: { type: string; weight: number; plannedDate: Date | null; actualDate: Date | null }[];
  defects: { status: string; dueDate: Date | null }[];
  inspections: { result: string }[];
  contractChanges: { amountAfter: unknown }[];
  paymentNodes: { status: string; amount: unknown }[];
};

/** 彙整單一專案總覽所需的關鍵指標（警示、進度、財務、工期）。 */
export function computeProjectOverview(project: OverviewProject) {
  const now = Date.now();
  const day = 86_400_000;
  const num = (v: unknown): number | null =>
    v == null ? null : Number(v as number);

  const progress = computeMilestoneProgress(
    project.milestones.filter((m) => m.type === "MILESTONE"),
  );

  const openDefects = project.defects.filter(
    (d) => d.status === "OPEN" || d.status === "IN_PROGRESS",
  );
  const overdueDefects = openDefects.filter(
    (d) => d.dueDate && new Date(d.dueDate).getTime() < now,
  );
  const pendingInspections = project.inspections.filter(
    (i) => i.result === "PENDING",
  );

  const changes = project.contractChanges;
  const latestChange = changes.length ? changes[changes.length - 1] : null;
  const originalAmount = num(project.budget);
  const currentAmount =
    latestChange && latestChange.amountAfter != null
      ? num(latestChange.amountAfter)
      : originalAmount;

  const paidTotal = project.paymentNodes
    .filter((p) => p.status === "PAID")
    .reduce((s, p) => s + (num(p.amount) ?? 0), 0);
  const paymentBase = currentAmount ?? 0;
  const paidPct = paymentBase > 0 ? Math.round((paidTotal / paymentBase) * 100) : 0;
  const pendingPayments = project.paymentNodes.filter((p) => p.status !== "PAID");

  const endTs = project.endDate ? new Date(project.endDate).getTime() : null;
  const daysLeft = endTs != null ? Math.ceil((endTs - now) / day) : null;
  const overdueSchedule =
    daysLeft != null && daysLeft < 0 && project.status !== "COMPLETED";

  return {
    now,
    progress,
    openCount: openDefects.length,
    overdueCount: overdueDefects.length,
    pendingInspectionCount: pendingInspections.length,
    changeCount: changes.length,
    hasChanges: latestChange != null,
    originalAmount,
    currentAmount,
    paidTotal,
    paidPct,
    pendingPaymentCount: pendingPayments.length,
    daysLeft,
    overdueSchedule,
  };
}

export type Viewer = { id: string; role: AccountRole };

/** Projects visible to the viewer — ADMIN/MANAGER see all, others see assigned only. */
export async function listProjects(viewer: Viewer) {
  const projects = canSeeAllProjects(viewer.role)
    ? await projectRepo.listWithCounts()
    : await projectRepo.listWithCountsForAccount(viewer.id);
  return projects.map((p) => ({
    ...p,
    progress: computeMilestoneProgress(p.milestones),
  }));
}

/** Returns the project only if the viewer may access it, otherwise null. */
export async function getProject(id: string, viewer: Viewer) {
  const project = await projectRepo.findByIdWithRelations(id);
  if (!project) return null;
  if (
    !canSeeAllProjects(viewer.role) &&
    !project.members.some((m) => m.accountId === viewer.id)
  ) {
    return null;
  }
  return project;
}

// ── staffing / members (配置人力) ──────────────────────────
const VALID_MEMBER_ROLES: ProjectMemberRole[] = [
  "MANAGER",
  "SUPERVISOR",
  "INSPECTOR",
  "MEMBER",
];

/** Active accounts that can be assigned to a project. */
export function listAssignableAccounts() {
  return accountRepo.listActive();
}

export type ProjectMemberInput = {
  projectId: string;
  accountId?: string;
  role?: string;
};

export async function addProjectMember(input: ProjectMemberInput) {
  const accountId = input.accountId?.trim();
  if (!input.projectId || !accountId) return;
  const role: ProjectMemberRole = VALID_MEMBER_ROLES.includes(
    input.role as ProjectMemberRole,
  )
    ? (input.role as ProjectMemberRole)
    : "MEMBER";
  await projectMemberRepo.upsert({ projectId: input.projectId, accountId, role });
}

export async function removeProjectMember(id: string) {
  await projectMemberRepo.remove(id);
}

// ── project create / update / delete ───────────────────────
export type CreateProjectInput = {
  code?: string;
  name?: string;
  description?: string;
  location?: string;
  contractNo?: string;
  client?: string;
  contractor?: string;
  supervisor?: string;
  budget?: string;
  startDate?: string;
  endDate?: string;
  status?: string;
};

export type CreateProjectResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

export async function createProject(
  input: CreateProjectInput,
): Promise<CreateProjectResult> {
  const code = input.code?.trim();
  const name = input.name?.trim();
  if (!code || !name) {
    return { ok: false, error: "專案編號與名稱為必填欄位。" };
  }

  const existing = await projectRepo.findByCode(code);
  if (existing) {
    return { ok: false, error: `專案編號「${code}」已存在。` };
  }

  const status: ProjectStatus =
    input.status && VALID_STATUSES.includes(input.status as ProjectStatus)
      ? (input.status as ProjectStatus)
      : "PLANNING";

  const project = await projectRepo.create({
    code,
    name,
    description: input.description?.trim() || undefined,
    location: input.location?.trim() || undefined,
    contractNo: input.contractNo?.trim() || undefined,
    client: input.client?.trim() || undefined,
    contractor: input.contractor?.trim() || undefined,
    supervisor: input.supervisor?.trim() || undefined,
    budget:
      input.budget && !Number.isNaN(Number(input.budget))
        ? Number(input.budget)
        : undefined,
    startDate: input.startDate ? new Date(input.startDate) : undefined,
    endDate: input.endDate ? new Date(input.endDate) : undefined,
    status,
  });

  return { ok: true, id: project.id };
}

export type UpdateProjectInput = Omit<CreateProjectInput, "code">;

export async function updateProject(id: string, input: UpdateProjectInput) {
  const data: UpdateProjectData = {
    name: requiredText(input.name),
    description: optionalText(input.description),
    location: optionalText(input.location),
    contractNo: optionalText(input.contractNo),
    client: optionalText(input.client),
    contractor: optionalText(input.contractor),
    supervisor: optionalText(input.supervisor),
    budget: optionalNumber(input.budget),
    startDate: optionalDate(input.startDate),
    endDate: optionalDate(input.endDate),
    status:
      input.status && VALID_STATUSES.includes(input.status as ProjectStatus)
        ? (input.status as ProjectStatus)
        : undefined,
  };
  await projectRepo.update(id, data);
}

// Deletions are soft (set deletedAt); records stay recoverable for 90 days.
export async function deleteProject(id: string) {
  await projectRepo.softDelete(id);
}

export async function restoreProject(id: string) {
  await projectRepo.restore(id);
}

// ── milestones ─────────────────────────────────────────────
export type MilestoneInput = {
  projectId: string;
  name?: string;
  type?: string;
  plannedDate?: string;
  actualDate?: string;
  weight?: string;
  commissioning?: string;
  docNo?: string;
  note?: string;
};

export async function addMilestone(input: MilestoneInput) {
  const name = input.name?.trim();
  if (!input.projectId || !name) return;
  const type: MilestoneType = VALID_MILESTONE_TYPES.includes(
    input.type as MilestoneType,
  )
    ? (input.type as MilestoneType)
    : "MILESTONE";
  const weight =
    input.weight && !Number.isNaN(Number(input.weight))
      ? Math.max(1, Math.round(Number(input.weight)))
      : 1;
  await milestoneRepo.create({
    projectId: input.projectId,
    name,
    type,
    plannedDate: input.plannedDate ? new Date(input.plannedDate) : undefined,
    actualDate: input.actualDate ? new Date(input.actualDate) : undefined,
    weight,
    commissioning: input.commissioning === "on" || input.commissioning === "true",
    docNo: input.docNo?.trim() || undefined,
    note: input.note?.trim() || undefined,
  });
}

export async function deleteMilestone(id: string) {
  await milestoneRepo.softDelete(id);
}

export async function restoreMilestone(id: string) {
  await milestoneRepo.restore(id);
}

// ── contract changes ───────────────────────────────────────
export type ContractChangeInput = {
  projectId: string;
  sequence?: string;
  description?: string;
  amountAfter?: string;
  daysChanged?: string;
  approvedDate?: string;
  docNo?: string;
};

export async function addContractChange(input: ContractChangeInput) {
  const description = input.description?.trim();
  if (!input.projectId || !description) return;
  const sequence =
    input.sequence && !Number.isNaN(Number(input.sequence))
      ? Number(input.sequence)
      : (await contractChangeRepo.countByProject(input.projectId)) + 1;
  await contractChangeRepo.create({
    projectId: input.projectId,
    sequence,
    description,
    amountAfter:
      input.amountAfter && !Number.isNaN(Number(input.amountAfter))
        ? Number(input.amountAfter)
        : undefined,
    daysChanged:
      input.daysChanged && !Number.isNaN(Number(input.daysChanged))
        ? Number(input.daysChanged)
        : undefined,
    approvedDate: input.approvedDate ? new Date(input.approvedDate) : undefined,
    docNo: input.docNo?.trim() || undefined,
  });
}

export async function deleteContractChange(id: string) {
  await contractChangeRepo.softDelete(id);
}

export async function restoreContractChange(id: string) {
  await contractChangeRepo.restore(id);
}

// ── documents ──────────────────────────────────────────────
export type DocumentInput = {
  projectId: string;
  category?: string;
  name?: string;
  fileNo?: string;
  url?: string;
  issuedDate?: string;
  note?: string;
};

export async function addDocument(input: DocumentInput) {
  const name = input.name?.trim();
  if (!input.projectId || !name) return;
  const category: ProjectDocumentCategory = VALID_DOC_CATEGORIES.includes(
    input.category as ProjectDocumentCategory,
  )
    ? (input.category as ProjectDocumentCategory)
    : "OTHER";
  await documentRepo.create({
    projectId: input.projectId,
    category,
    name,
    fileNo: input.fileNo?.trim() || undefined,
    url: input.url?.trim() || undefined,
    issuedDate: input.issuedDate ? new Date(input.issuedDate) : undefined,
    note: input.note?.trim() || undefined,
  });
}

export async function deleteDocument(id: string) {
  await documentRepo.softDelete(id);
}

export async function restoreDocument(id: string) {
  await documentRepo.restore(id);
}
