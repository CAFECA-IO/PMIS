import * as projectRepo from "@/repository/project.repository";
import * as obligationRepo from "@/repository/obligation.repository";
import * as scopeRepo from "@/repository/scopeItem.repository";
import * as contractChangeRepo from "@/repository/contractChange.repository";
import * as documentRepo from "@/repository/projectDocument.repository";
import * as projectMemberRepo from "@/repository/projectMember.repository";
import * as accountRepo from "@/repository/account.repository";
import {
  projectStatusMeta,
  projectDocumentCategoryMeta,
} from "@/constant/pmis";
import {
  obligationRiskMeta,
  obligationStageMeta,
  obligationStatusMeta,
  obligationTriggerMeta,
} from "@/constant/obligation";
import {
  findDuplicates,
  hasBlocking,
  type Candidate,
  type DuplicateMatch,
  type ExistingProject,
} from "@/service/project-duplicate";
import type {
  ProjectStatus,
  ObligationStage,
  ObligationRisk,
  ObligationTrigger,
  ObligationStatus,
  ProjectDocumentCategory,
  AccountRole,
  ProjectMemberRole,
} from "@/generated/prisma/enums";
import type { UpdateProjectData } from "@/repository/project.repository";
import { canSeeAllProjects } from "@/lib/auth";
import * as workItemRepo from "@/repository/workItem.repository";
import {
  buildSCurve,
  buildWorkItemSCurve,
  type SCurvePoint,
  type SCurveBasis,
} from "./scurve";
import { lookupReference } from "@/constant/domain-knowledge";
import {
  derivedProgress,
  effectiveObligationActual,
  rolledUpProgress,
  type RollupItem,
  type ProgressWorkItem,
} from "./obligation-rollup";

const VALID_STATUSES = Object.keys(projectStatusMeta) as ProjectStatus[];
const VALID_STAGES = Object.keys(obligationStageMeta) as ObligationStage[];
const VALID_RISKS = Object.keys(obligationRiskMeta) as ObligationRisk[];
const VALID_TRIGGERS = Object.keys(obligationTriggerMeta) as ObligationTrigger[];
const VALID_OB_STATUSES = Object.keys(obligationStatusMeta) as ObligationStatus[];

/** 表單字串收斂為 enum，非法值退回預設。 */
const pickEnum = <T extends string>(valid: T[], v: unknown, fallback: T): T =>
  valid.includes(v as T) ? (v as T) : fallback;
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
/**
 * 單一專案的進度 S-Curve（預定/實際/預測累計 %），支援兩種計算基準：
 *  - "OBLIGATION"（預設）：以「履約事項」權重與期限/實際完成日計算（事件式）。
 *  - "WORKITEM"：以「工程分項」預定工期與 progress 計算（期間式）。
 * 於對應分頁修改資料（履約事項權重/日期、或工程分項起訖日/進度）皆會即時改變此曲線。
 */
export type ObligationLite = {
  id: string;
  weight: number;
  dueDate: Date | null;
  actualDate: Date | null;
};
export type WorkItemDetail = RollupItem & {
  id: string;
  name: string;
  status: string;
  obligationId: string | null;
};

/** 讀取專案工程分項明細（含所屬履約事項 id）。 */
export function getWorkItemDetails(
  projectId: string,
): Promise<WorkItemDetail[]> {
  return workItemRepo.listDetailByProject(projectId);
}

export function computeProjectSCurve(
  obligations: ObligationLite[],
  workItems: WorkItemDetail[],
  basis: SCurveBasis = "OBLIGATION",
): SCurvePoint[] {
  if (basis === "WORKITEM") {
    return buildWorkItemSCurve(
      workItems.map((w) => ({
        plannedStart: w.plannedStart,
        plannedEnd: w.plannedEnd,
        actualStart: w.actualStart,
        actualEnd: w.actualEnd,
        progress: w.progress,
      })),
    );
  }
  // 履約事項基準：實際完成日由其下工程分項上捲（見 obligation-rollup），手動 actualDate 優先。
  return buildSCurve(
    obligations.map((m) => {
      const items = workItems.filter((w) => w.obligationId === m.id);
      return {
        weight: m.weight,
        plannedDate: m.dueDate,
        actualDate: effectiveObligationActual(m.actualDate, items),
      };
    }),
  );
}

/** 每個履約事項由工程分項上捲的達成度與分項數（供履約事項分頁顯示）。 */
export function computeObligationRollups(
  obligations: ObligationLite[],
  workItems: WorkItemDetail[],
): Map<string, { progress: number; count: number }> {
  const map = new Map<string, { progress: number; count: number }>();
  for (const m of obligations) {
    const items = workItems.filter((w) => w.obligationId === m.id);
    map.set(m.id, { progress: derivedProgress(items), count: items.length });
  }
  return map;
}

type OverviewProject = {
  status: string;
  budget: unknown;
  endDate: Date | null;
  obligations: { id: string; weight: number; dueDate: Date | null; actualDate: Date | null }[];
  workItems: ProgressWorkItem[];
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

  // 進度採全系統單一定義：履約事項權重加權，達成由工程分項上捲判定。
  const progress = rolledUpProgress(project.obligations, project.workItems, now);

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

/** 側邊欄「目前專案」切換清單所需的欄位。 */
export type ProjectOption = {
  id: string;
  code: string;
  name: string;
  status: ProjectStatus;
  client: string | null;
  location: string | null;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
};

/** 輕量專案選項，供側邊欄「目前專案」切換用，遵循同樣的存取範圍。 */
export async function listProjectOptions(
  viewer: Viewer,
): Promise<ProjectOption[]> {
  const rows = canSeeAllProjects(viewer.role)
    ? await projectRepo.listOptions()
    : await projectRepo.listOptionsForAccount(viewer.id);
  // Info: Date 轉為 ISO 日期字串，避免跨 server/client 邊界的序列化差異
  const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
  return rows.map((p) => ({
    ...p,
    startDate: day(p.startDate),
    endDate: day(p.endDate),
  }));
}

/** Projects visible to the viewer — ADMIN/MANAGER see all, others see assigned only. */
export async function listProjects(viewer: Viewer) {
  const projects = canSeeAllProjects(viewer.role)
    ? await projectRepo.listWithCounts()
    : await projectRepo.listWithCountsForAccount(viewer.id);

  // 批次讀取各專案工項明細，逐案以「上捲」計算進度（全系統統一定義）
  const wiRows = await workItemRepo.listDetailByProjectIds(
    projects.map((p) => p.id),
  );
  const byProject = new Map<string, ProgressWorkItem[]>();
  for (const r of wiRows) {
    const arr = byProject.get(r.projectId) ?? [];
    arr.push(r);
    byProject.set(r.projectId, arr);
  }

  return projects.map((p) => ({
    ...p,
    progress: rolledUpProgress(p.obligations, byProject.get(p.id) ?? []),
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
  /** 契約簽訂日與開工命令日：履約事項的相對期限以這兩天為基準。 */
  signedDate?: string;
  noticeDate?: string;
  status?: string;
};

export type CreateProjectResult =
  | { ok: true; id: string }
  /** duplicates 只在因重複而未建立時附上，供呼叫端列出是哪些專案。 */
  | { ok: false; error: string; duplicates?: DuplicateMatch[] };

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

// ── 專案建置：一次建立專案 + 履約事項 + 工程分項 ─────────────
export type WizardObligationInput = {
  /** 源自哪一項履約標的（名稱）。 */
  scopeRef?: string;
  code?: string;
  title?: string;
  stage?: string;
  risk?: string;
  triggerType?: string;
  dueDate?: string;
  ownerUnit?: string;
  ownerName?: string;
  contractBasis?: string;
  weight?: number | string;
  commissioning?: boolean;
};

export type WizardWorkItemInput = {
  /** 所屬工程項目（分群）。 */
  workPackage?: string;
  /** 源自哪一項履約標的（名稱）。 */
  scopeRef?: string;
  code?: string;
  name?: string;
  category?: string;
  /** 所屬履約事項「名稱」，建立後再解析為 id。 */
  obligation?: string;
  plannedStart?: string;
  plannedEnd?: string;
  /** 估驗台帳欄位：WBS 代碼、計量單位、契約數量與單價。 */
  wbsCode?: string;
  unit?: string;
  contractQty?: number;
  unitPrice?: number;
};

const asDate = (v?: string) => {
  if (!v?.trim()) return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
};

/**
 * 建立專案，並依序寫入履約事項與工程分項。
 * 工程分項以履約事項「名稱」對應剛建立的 id（名稱重複時取第一筆）。
 * 未提供管制編號時，依專案代號自動編號（如 ABC-001）以滿足唯一性。
 * 專案建立失敗即中止；子項目個別失敗不影響已建立的專案。
 */
/** 建置時傳入的契約履約標的。 */
export type WizardScopeItemInput = {
  code?: string;
  title: string;
  sourceClause?: string;
};

/**
 * 查出可能重複的既有專案。
 *
 * 比對在此處（伺服器端）進行而非交給前端：前端只拿得到自己畫面上的資料，
 * 而重複的另一半在資料庫裡。
 */
export async function checkDuplicates(
  candidate: Candidate,
): Promise<DuplicateMatch[]> {
  const rows = await projectRepo.listForDuplicateCheck();
  const existing: ExistingProject[] = rows.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    contractNo: r.contractNo,
    client: r.client,
    startDate: r.startDate ? r.startDate.toISOString().slice(0, 10) : null,
    endDate: r.endDate ? r.endDate.toISOString().slice(0, 10) : null,
    fileNames: [
      ...r.faithUploads.map((f) => f.fileName),
      ...r.projectFiles.map((f) => f.fileName),
    ],
  }));
  return findDuplicates(candidate, existing);
}

export async function createProjectWithStructure(
  input: CreateProjectInput,
  obligations: WizardObligationInput[] = [],
  workItems: WizardWorkItemInput[] = [],
  /** 契約履約標的（階段一）。履約事項與工程分項由此推導，存下才能溯源。 */
  scopeItems: WizardScopeItemInput[] = [],
  /**
   * 使用者已在確認視窗同意「即使重複也要建立」。
   *
   * 預設 false 並在此處重查一次 —— 前端的檢查是為了讓使用者早點知道，
   * 不能當作把關：呼叫端可以不做檢查就送出，兩次檢查之間也可能有人
   * 剛建了同名專案。
   */
  allowDuplicate = false,
  /** 本次解析使用的檔名，供「同一份契約已被別的專案用過」的判斷。 */
  fileNames: string[] = [],
): Promise<CreateProjectResult> {
  const duplicates = await checkDuplicates({
    code: input.code,
    name: input.name,
    contractNo: input.contractNo,
    client: input.client,
    startDate: input.startDate,
    endDate: input.endDate,
    fileNames,
  });
  /*
    編號撞號一律擋（資料庫的 unique 約束，同意也建不出來）；
    其餘只在使用者尚未確認時擋。
  */
  if (duplicates.length > 0 && (!allowDuplicate || hasBlocking(duplicates))) {
    return {
      ok: false,
      error: hasBlocking(duplicates)
        ? `專案編號「${input.code?.trim()}」已存在。`
        : "偵測到可能重複的專案，請確認後再建立。",
      duplicates,
    };
  }

  const result = await createProject(input);
  if (!result.ok) return result;
  const projectId = result.id;

  // 先建立履約標的，取得「名稱 → id」對照供下游關聯
  const scopeIdByTitle = await scopeRepo.createMany(projectId, scopeItems);

  const prefix = input.code?.trim() || "OB";
  const usedCodes = new Set<string>();
  const idByName = new Map<string, string>();
  let seq = 0;
  for (const m of obligations) {
    const title = m.title?.trim();
    if (!title) continue;
    seq += 1;
    let code = m.code?.trim() || "";
    if (!code || usedCodes.has(code)) {
      code = `${prefix}-${String(seq).padStart(3, "0")}`;
    }
    usedCodes.add(code);
    const weight =
      m.weight != null && !Number.isNaN(Number(m.weight))
        ? Math.max(1, Math.round(Number(m.weight)))
        : 1;
    const created = await obligationRepo.create({
      projectId,
      code,
      title,
      stage: pickEnum(VALID_STAGES, m.stage, "CONSTRUCTION"),
      risk: pickEnum(VALID_RISKS, m.risk, "GREEN"),
      triggerType: pickEnum(VALID_TRIGGERS, m.triggerType, "FIXED_DATE"),
      dueDate: asDate(m.dueDate),
      ownerUnit: m.ownerUnit?.trim() || undefined,
      ownerName: m.ownerName?.trim() || undefined,
      contractBasis: m.contractBasis?.trim() || undefined,
      weight,
      commissioning: m.commissioning === true,
      scopeItemId: m.scopeRef ? (scopeIdByTitle.get(m.scopeRef.trim()) ?? null) : null,
    });
    if (!idByName.has(title)) idByName.set(title, created.id);
  }

  for (const w of workItems) {
    const name = w.name?.trim();
    if (!name) continue;
    await workItemRepo.create({
      projectId,
      code: w.code?.trim() || null,
      name,
      category: w.category?.trim() || null,
      plannedStart: asDate(w.plannedStart) ?? null,
      plannedEnd: asDate(w.plannedEnd) ?? null,
      progress: 0,
      status: "NOT_STARTED",
      obligationId: w.obligation
        ? (idByName.get(w.obligation.trim()) ?? null)
        : null,
      workPackage: w.workPackage?.trim() || null,
      scopeItemId: w.scopeRef ? (scopeIdByTitle.get(w.scopeRef.trim()) ?? null) : null,
      /*
        數量與單價：契約有列才寫入。
        完成量、查驗量、估驗量一律留空 —— 建案當下還沒有任何施作，
        預設為 0 會讓台帳看起來像「已對過帳、數量為零」。
      */
      wbsCode: w.wbsCode?.trim() || null,
      wbsCategory: wbsCategoryOf(name),
      unit: w.unit?.trim() || null,
      contractQty: w.contractQty ?? null,
      unitPrice: w.unitPrice ?? null,
    });
  }

  return result;
}

/**
 * 由分項名稱推得 WBS 類別。
 *
 * 名稱對得上知識庫的參考分項時用它的類別，否則留空由使用者於台帳指定。
 * 不亂猜是刻意的：錯誤的類別會讓「土建完成幾成」這種彙總失真，
 * 而空白至少會被彙整頁歸入「其他」而看得出來未分類。
 */
function wbsCategoryOf(name: string): string | null {
  return lookupReference(name)?.wbs ?? null;
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

// ── 履約事項 ────────────────────────────────────────────────
export type ObligationInput = {
  projectId: string;
  code?: string;
  title?: string;
  stage?: string;
  risk?: string;
  triggerType?: string;
  status?: string;
  dueDate?: string;
  actualDate?: string;
  ownerUnit?: string;
  ownerName?: string;
  contractBasis?: string;
  weight?: string;
  commissioning?: string;
  offsetDays?: string;
  docNo?: string;
  note?: string;
  /** 觸發設定（皆為表單字串）。 */
  relativeAnchor?: string;
  predecessorId?: string;
  conditionKind?: string;
  conditionDetail?: string;
  dueDateOverridden?: string;
};

export async function addObligation(input: ObligationInput) {
  const title = input.title?.trim();
  const code = input.code?.trim();
  if (!input.projectId || !title || !code) return;
  const weight =
    input.weight && !Number.isNaN(Number(input.weight))
      ? Math.max(1, Math.round(Number(input.weight)))
      : 1;
  const offsetDays =
    input.offsetDays && !Number.isNaN(Number(input.offsetDays))
      ? Math.round(Number(input.offsetDays))
      : undefined;
  await obligationRepo.create({
    projectId: input.projectId,
    code,
    title,
    stage: pickEnum(VALID_STAGES, input.stage, "CONSTRUCTION"),
    risk: pickEnum(VALID_RISKS, input.risk, "GREEN"),
    triggerType: pickEnum(VALID_TRIGGERS, input.triggerType, "FIXED_DATE"),
    status: pickEnum(VALID_OB_STATUSES, input.status, "NOT_STARTED"),
    dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
    actualDate: input.actualDate ? new Date(input.actualDate) : undefined,
    ownerUnit: input.ownerUnit?.trim() || undefined,
    ownerName: input.ownerName?.trim() || undefined,
    contractBasis: input.contractBasis?.trim() || undefined,
    weight,
    commissioning: input.commissioning === "on" || input.commissioning === "true",
    offsetDays,
    docNo: input.docNo?.trim() || undefined,
    note: input.note?.trim() || undefined,
    /*
      觸發設定：只保留與所選觸發方式相關的欄位。
      與細節頁的編輯共用同一條規則（見 obligation-edit 的說明）——
      留著不相關的舊設定，日後換回該方式時會沿用一個早已無意義的值。
    */
    relativeAnchor:
      input.triggerType === "RELATIVE_DUE"
        ? input.relativeAnchor?.trim() || undefined
        : undefined,
    predecessorId:
      input.triggerType === "PREDECESSOR"
        ? input.predecessorId?.trim() || undefined
        : undefined,
    conditionKind:
      input.triggerType === "CONDITION"
        ? input.conditionKind?.trim() || undefined
        : undefined,
    conditionDetail:
      input.triggerType === "CONDITION"
        ? input.conditionDetail?.trim() || undefined
        : undefined,
    dueDateOverridden:
      input.triggerType !== "FIXED_DATE" &&
      (input.dueDateOverridden === "on" || input.dueDateOverridden === "true"),
  });
}

/*
  履約事項的「完成」刻意不放在這裡。
  完成必須先確認歸屬的工程分項都已完成，那道關卡在
  obligation.service.completeObligation。留一個未把關的同名函式在此，
  下一個人多半會就近取用，限制便形同虛設。
*/

export async function deleteObligation(id: string) {
  await obligationRepo.softDelete(id);
}

export async function restoreObligation(id: string) {
  await obligationRepo.restore(id);
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
