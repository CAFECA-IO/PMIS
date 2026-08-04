"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import * as projectService from "@/service/project.service";
import type {
  Candidate,
  DuplicateMatch,
} from "@/service/project-duplicate";
import * as faithUpload from "@/service/faithUpload.service";
import * as workItemService from "@/service/workItem.service";
import * as obligationService from "@/service/obligation.service";
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

// ── 工程分項（WorkItem, PMIS-04）新增/編輯/刪除 ─────────────
export async function createWorkItemAction(formData: FormData) {
  if (!(await canEdit())) return;
  const projectId = field(formData, "projectId");
  if (!projectId) return;
  await workItemService.addWorkItem(
    {
      projectId,
      obligationId: field(formData, "obligationId"),
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
      obligationId: field(formData, "obligationId"),
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
    keyRequirements: field(formData, "keyRequirements"),
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

// ── 專案建置：經專案經理人確認後建立 ───────────────────
export type WizardProfile = {
  code?: string;
  name?: string;
  contractNo?: string;
  location?: string;
  client?: string;
  contractor?: string;
  supervisor?: string;
  budget?: string | number;
  startDate?: string;
  endDate?: string;
  status?: string;
  description?: string;
  /** 關鍵要求重點：影響施工方式的契約／規範條件。 */
  keyRequirements?: string;
};

export type CreateWizardResult =
  | { ok: true; id: string; assignedFiles: number }
  | { ok: false; error: string; duplicates?: DuplicateMatch[] };

/**
 * 查詢可能重複的既有專案。
 *
 * 供建置頁在匯入解析結果後立即提醒 —— 讓使用者在還沒把履約事項核對完
 * 之前就知道「這件可能已經建過了」，而不是填完才被擋。
 * 這支只讀不寫，權限與列表頁一致（看得到專案列表就查得到）。
 */
export async function lookupDuplicateProjects(
  candidate: Candidate,
): Promise<DuplicateMatch[]> {
  if (!(await canEdit())) return [];
  return projectService.checkDuplicates(candidate);
}

export async function createProjectViaWizard(
  profile: WizardProfile,
  obligations: projectService.WizardObligationInput[] = [],
  workItems: projectService.WizardWorkItemInput[] = [],
  /** 建置過程由費思歸檔的檔案 id，建立成功後改歸此專案。 */
  uploadIds: string[] = [],
  /** 契約履約標的（階段一）；履約事項與工程分項以此溯源。 */
  scopeItems: projectService.WizardScopeItemInput[] = [],
  /** 使用者已在確認視窗同意「即使重複也要建立」。 */
  allowDuplicate = false,
  /** 本次解析使用的檔名，供重複判斷。 */
  fileNames: string[] = [],
): Promise<CreateWizardResult> {
  if (!(await canEdit())) {
    return { ok: false, error: "權限不足，無法建立專案。" };
  }
  const me = await actor();
  const result = await projectService.createProjectWithStructure(
    {
      code: profile.code,
      name: profile.name,
      description: profile.description,
      keyRequirements: profile.keyRequirements,
      location: profile.location,
      client: profile.client,
      contractor: profile.contractor,
      supervisor: profile.supervisor,
      budget: profile.budget != null ? String(profile.budget) : undefined,
      startDate: profile.startDate,
      endDate: profile.endDate,
      status: profile.status,
      contractNo: profile.contractNo,
    },
    obligations,
    workItems,
    scopeItems,
    allowDuplicate,
    fileNames,
  );
  if (!result.ok) return { ok: false, error: result.error };

  /*
    把建置過程上傳的契約／決標文件從「未指派」改歸此專案。
    僅處理本人上傳且尚未指派者（條件在倉儲的 where），失敗不影響建案結果 ——
    專案已經建好了，不該因歸屬檔案出錯而讓使用者以為建立失敗。
  */
  let assignedFiles = 0;
  try {
    assignedFiles = await faithUpload.assignToProject(
      uploadIds,
      result.id,
      me.id,
    );
  } catch (error) {
    console.error("[projects] 建置檔案歸屬失敗：", error);
  }

  revalidatePath("/projects");
  revalidatePath("/schedule");
  revalidatePath("/documents");
  revalidatePath("/");
  return { ok: true, id: result.id, assignedFiles };
}

// ── update / add (plain <form action>) ─────────────────────
export async function updateProjectAction(formData: FormData) {
  if (!(await canEdit())) return;
  const id = field(formData, "id");
  if (!id) return;
  await projectService.updateProject(id, {
    name: field(formData, "name"),
    description: field(formData, "description"),
    keyRequirements: field(formData, "keyRequirements"),
    location: field(formData, "location"),
    contractNo: field(formData, "contractNo"),
    client: field(formData, "client"),
    contractor: field(formData, "contractor"),
    supervisor: field(formData, "supervisor"),
    budget: field(formData, "budget"),
    startDate: field(formData, "startDate"),
    endDate: field(formData, "endDate"),
    signedDate: field(formData, "signedDate"),
    noticeDate: field(formData, "noticeDate"),
    status: field(formData, "status"),
  });
  refreshProject(id);
}

export async function addObligationAction(formData: FormData) {
  if (!(await canEdit())) return;
  const projectId = field(formData, "projectId");
  if (!projectId) return;
  await projectService.addObligation({
    projectId,
    code: field(formData, "code"),
    title: field(formData, "title"),
    stage: field(formData, "stage"),
    risk: field(formData, "risk"),
    triggerType: field(formData, "triggerType"),
    status: field(formData, "status"),
    dueDate: field(formData, "dueDate"),
    actualDate: field(formData, "actualDate"),
    ownerUnit: field(formData, "ownerUnit"),
    ownerName: field(formData, "ownerName"),
    contractBasis: field(formData, "contractBasis"),
    weight: field(formData, "weight"),
    commissioning: field(formData, "commissioning"),
    offsetDays: field(formData, "offsetDays"),
    docNo: field(formData, "docNo"),
    relativeAnchor: field(formData, "relativeAnchor"),
    predecessorId: field(formData, "predecessorId"),
    conditionKind: field(formData, "conditionKind"),
    conditionDetail: field(formData, "conditionDetail"),
    dueDateOverridden: field(formData, "dueDateOverridden"),
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

/*
  人力配置的動作已移至帳號管理（src/app/people/actions.ts）。
  這裡不留一份同名的 —— 兩處都能改成員時，權限規則遲早會漂移，
  而漂移的後果是「某個入口能把自己加進任何專案」。
*/

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

export async function deleteObligationAction(id: string, projectId: string) {
  if (!(await canEdit())) return;
  await projectService.deleteObligation(id);
  refreshProject(projectId);
}
export async function restoreObligationAction(id: string, projectId: string) {
  if (!(await canEdit())) return;
  await projectService.restoreObligation(id);
  refreshProject(projectId);
}

/**
 * 表格上的「完成」動作：寫入實際完成日並轉為 DONE。
 *
 * 走 obligationService 而非 projectService，以套用同一道關卡 ——
 * 歸屬的工程分項未全部完成前不得完成。這裡若留一條沒把關的路，
 * 履約事項頁的限制就形同虛設。
 */
export async function completeObligationAction(
  id: string,
  projectId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await canEdit())) {
    return { ok: false, error: "您沒有編輯專案的權限。" };
  }
  const result = await obligationService.completeObligation(
    id,
    await requireUser(),
  );
  if (!result.ok) return result;
  refreshProject(projectId);
  revalidatePath("/obligations");
  return { ok: true };
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

/**
 * 把使用者選取的「未指派」費思上傳檔案歸入指定專案。
 *
 * 用於專案建立後的提示：使用者可能在建置前就用一般對話上傳過相關文件。
 * 安全性沿用 assignToProject 的 where 守則（僅本人上傳且尚未指派），
 * 因此即使傳入他人或已歸屬的 id 也不會生效。
 */
export async function assignUploadsToProjectAction(
  projectId: string,
  uploadIds: string[],
): Promise<{ ok: boolean; assigned: number; error?: string }> {
  if (!(await canEdit())) {
    return { ok: false, assigned: 0, error: "權限不足。" };
  }
  const me = await actor();

  // 確認使用者確實能存取該專案，避免把檔案塞進看不到的案子
  const project = await projectService.getProject(projectId, me);
  if (!project) {
    return { ok: false, assigned: 0, error: "找不到專案或無權存取。" };
  }

  const assigned = await faithUpload.assignToProject(
    uploadIds,
    projectId,
    me.id,
  );
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/documents");
  return { ok: true, assigned };
}
