import * as workflowRepo from "@/repository/approvalWorkflow.repository";
import * as docRepo from "@/repository/approvalDocument.repository";
import * as accountRepo from "@/repository/account.repository";
import * as storage from "@/service/storage.service";
import type { StepDecision } from "@/generated/prisma/enums";

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
