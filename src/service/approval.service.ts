import * as workflowRepo from "@/repository/approvalWorkflow.repository";
import * as docRepo from "@/repository/approvalDocument.repository";
import * as accountRepo from "@/repository/account.repository";
import * as storage from "@/service/storage.service";
import type { StepDecision, ApprovalStatus } from "@/generated/prisma/enums";

// ── workflows ──────────────────────────────────────────────
export function listWorkflows() {
  return workflowRepo.list();
}

export type WorkflowInput = {
  name?: string;
  description?: string;
  positionIds?: string[];
};

export async function createWorkflow(input: WorkflowInput) {
  const name = input.name?.trim();
  const positionIds = (input.positionIds ?? []).filter((p) => p);
  if (!name || positionIds.length === 0) return;
  await workflowRepo.create({
    name,
    description: input.description?.trim() || undefined,
    steps: positionIds.map((positionId, order) => ({ order, positionId })),
  });
}

export const deleteWorkflow = (id: string) => workflowRepo.softDelete(id);
export const restoreWorkflow = (id: string) => workflowRepo.restore(id);

// ── documents ──────────────────────────────────────────────
export function listDocuments() {
  return docRepo.list();
}

export type SubmittalPeriod =
  | "DAILY"
  | "WEEKLY"
  | "MONTHLY"
  | "QUARTERLY"
  | "ANNUAL"
  | "ALL";

// Info: (20260721 - Luphia) 依週期計算起始時間（以今日為基準），ALL 回傳 null
function periodStart(period: SubmittalPeriod): Date | null {
  if (period === "ALL") return null;
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  switch (period) {
    case "DAILY":
      return new Date(y, m, d, 0, 0, 0, 0);
    case "WEEKLY": {
      const dow = (now.getDay() + 6) % 7; // Info: (20260721 - Luphia) 0 = 星期一
      return new Date(y, m, d - dow, 0, 0, 0, 0);
    }
    case "MONTHLY":
      return new Date(y, m, 1);
    case "QUARTERLY":
      return new Date(y, Math.floor(m / 3) * 3, 1);
    case "ANNUAL":
    default:
      return new Date(y, 0, 1);
  }
}

// Info: (20260721 - Luphia) 簽核總覽：狀態看板 + 我送件/我簽核/待我簽核（可依週期篩選）
export async function getSubmittalOverview(
  user: { id: string; positionId: string | null },
  period: SubmittalPeriod = "ALL",
) {
  const allDocs = await docRepo.list();
  const start = periodStart(period);
  const docs = start
    ? allDocs.filter((d) => new Date(d.createdAt) >= start)
    : allDocs;

  const statusCounts: Record<ApprovalStatus, number> = {
    PENDING: 0,
    APPROVED: 0,
    REJECTED: 0,
    CANCELLED: 0,
  };
  for (const d of docs) statusCounts[d.status] += 1;

  const applied = docs.filter((d) => d.applicantId === user.id).slice(0, 10);
  const signed = docs
    .filter((d) => d.steps.some((s) => s.signedById === user.id))
    .slice(0, 10);

  // Info: (20260721 - Luphia) 待我簽核為即時待辦，不受週期篩選影響
  const pendingMe = user.positionId
    ? allDocs.filter(
        (d) =>
          d.status === "PENDING" &&
          d.steps.some(
            (s) =>
              s.order === d.currentStep &&
              s.decision === "PENDING" &&
              s.positionId === user.positionId,
          ),
      )
    : [];

  return { total: docs.length, statusCounts, applied, signed, pendingMe };
}

export async function getDocument(id: string) {
  const document = await docRepo.findById(id);
  if (!document) return null;
  const accounts = await accountRepo.list();
  return { document, accounts };
}

export const getAttachment = (id: string) => docRepo.findAttachment(id);
export const countActiveDocuments = () => docRepo.countActive();
export const deleteDocument = (id: string) => docRepo.softDelete(id);
export const restoreDocument = (id: string) => docRepo.restore(id);

export type DocumentInput = {
  title?: string;
  description?: string;
  applicantId?: string;
  workflowId?: string;
};

export type DocumentResult = { ok: true; id: string } | { ok: false; error: string };

export async function createDocument(
  input: DocumentInput,
  files: File[],
): Promise<DocumentResult> {
  const title = input.title?.trim();
  if (!title || !input.applicantId || !input.workflowId) {
    return { ok: false, error: "標題、申請者與簽核流程為必填。" };
  }

  const workflow = await workflowRepo.findByIdWithSteps(input.workflowId);
  if (!workflow || workflow.steps.length === 0) {
    return { ok: false, error: "所選流程沒有任何簽核關卡。" };
  }

  const doc = await docRepo.create({
    title,
    description: input.description?.trim() || undefined,
    applicantId: input.applicantId,
    workflowId: input.workflowId,
    steps: workflow.steps.map((s) => ({
      order: s.order,
      positionId: s.positionId,
    })),
  });

  for (const file of files) {
    const saved = await storage.saveFile(file);
    if (saved) await docRepo.addAttachment(doc.id, saved);
  }

  return { ok: true, id: doc.id };
}

/** Sign (approve/reject) the current step of a document. */
export async function signStep(
  stepId: string,
  signerId: string,
  decision: StepDecision,
  comment?: string,
) {
  if (!signerId || (decision !== "APPROVED" && decision !== "REJECTED")) return;

  const step = await docRepo.findStep(stepId);
  if (!step) return;
  const doc = step.document;
  if (doc.status !== "PENDING") return; // already finalised
  if (step.order !== doc.currentStep) return; // not the active step
  if (step.decision !== "PENDING") return; // already signed

  await docRepo.signStep(stepId, {
    signedById: signerId,
    decision,
    comment: comment?.trim() || undefined,
  });

  if (decision === "REJECTED") {
    await docRepo.updateDocument(doc.id, { status: "REJECTED" });
    return;
  }

  const total = await docRepo.countSteps(doc.id);
  const next = step.order + 1;
  if (next >= total) {
    await docRepo.updateDocument(doc.id, { status: "APPROVED", currentStep: total });
  } else {
    await docRepo.updateDocument(doc.id, { currentStep: next });
  }
}
