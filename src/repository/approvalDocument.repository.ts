import { prisma } from "./client";
import type { ApprovalStatus, StepDecision } from "@/generated/prisma/enums";

export type DocStepInput = { order: number; positionId: string };

export function list() {
  return prisma.approvalDocument.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: "desc" },
    include: {
      applicant: true,
      workflow: true,
      steps: { orderBy: { order: "asc" } },
    },
  });
}

export function findById(id: string) {
  return prisma.approvalDocument.findFirst({
    where: { id, deletedAt: null },
    include: {
      applicant: true,
      workflow: true,
      steps: {
        orderBy: { order: "asc" },
        include: { position: true, signedBy: true },
      },
      attachments: { orderBy: { createdAt: "asc" } },
    },
  });
}

export function create(data: {
  title: string;
  description?: string;
  applicantId: string;
  workflowId: string;
  steps: DocStepInput[];
}) {
  return prisma.approvalDocument.create({
    data: {
      title: data.title,
      description: data.description,
      applicantId: data.applicantId,
      workflowId: data.workflowId,
      steps: { create: data.steps },
    },
  });
}

export function addAttachment(
  documentId: string,
  a: { fileName: string; storedName: string; mimeType: string; size: number },
) {
  return prisma.approvalAttachment.create({ data: { documentId, ...a } });
}

export function findStep(stepId: string) {
  return prisma.approvalDocumentStep.findUnique({
    where: { id: stepId },
    include: { document: true },
  });
}

export function countSteps(documentId: string) {
  return prisma.approvalDocumentStep.count({ where: { documentId } });
}

export function signStep(
  stepId: string,
  data: { signedById: string; decision: StepDecision; comment?: string },
) {
  return prisma.approvalDocumentStep.update({
    where: { id: stepId },
    data: {
      signedById: data.signedById,
      decision: data.decision,
      comment: data.comment,
      signedAt: new Date(),
    },
  });
}

export function updateDocument(
  id: string,
  data: { status?: ApprovalStatus; currentStep?: number },
) {
  return prisma.approvalDocument.update({ where: { id }, data });
}

export function findAttachment(id: string) {
  return prisma.approvalAttachment.findUnique({ where: { id } });
}

/** 全部簽核文件上傳檔案（含所屬文件），供資料庫彙整。 */
export function listAllAttachments() {
  return prisma.approvalAttachment.findMany({
    orderBy: { createdAt: "desc" },
    include: { document: { select: { id: true, title: true } } },
  });
}

export function countActive() {
  return prisma.approvalDocument.count({
    where: { deletedAt: null, status: "PENDING" },
  });
}

export function softDelete(id: string) {
  return prisma.approvalDocument.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}

export function restore(id: string) {
  return prisma.approvalDocument.update({
    where: { id },
    data: { deletedAt: null },
  });
}
