"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import * as approval from "@/service/approval.service";
import * as faith from "@/service/faith.service";
import type { StepDecision } from "@/generated/prisma/enums";
import { currentUserCanEdit } from "@/service/access.service";

export type DocActionState = { error?: string };

function f(fd: FormData, k: string): string | undefined {
  const v = fd.get(k);
  return typeof v === "string" ? v : undefined;
}

// ── documents ──────────────────────────────────────────────
export async function createDocumentAction(
  _prev: DocActionState,
  fd: FormData,
): Promise<DocActionState> {
  if (!(await currentUserCanEdit("/submittals")))
    return { error: "權限不足，無法編輯此模組。" };
  const files = fd.getAll("files").filter((v): v is File => v instanceof File);
  const result = await approval.createDocument(
    {
      title: f(fd, "title"),
      description: f(fd, "description"),
      applicantId: f(fd, "applicantId"),
      workflowId: f(fd, "workflowId"),
    },
    files,
  );
  if (!result.ok) return { error: result.error };
  revalidatePath("/submittals");
  redirect(`/submittals/${result.id}`);
}

export async function signStepAction(fd: FormData) {
  if (!(await currentUserCanEdit("/submittals"))) return;
  const stepId = f(fd, "stepId");
  const documentId = f(fd, "documentId");
  const signerId = f(fd, "signerId");
  const decision = f(fd, "decision") as StepDecision | undefined;
  const comment = f(fd, "comment");
  if (stepId && signerId && decision) {
    await approval.signStep(stepId, signerId, decision, comment);
  }
  if (documentId) revalidatePath(`/submittals/${documentId}`);
}

export async function analyzeAttachmentAction(
  attachmentId: string,
): Promise<{ text?: string; error?: string }> {
  try {
    const text = await faith.analyzeAttachment(attachmentId);
    return { text };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "AI 分析失敗" };
  }
}

export async function deleteDocumentAction(id: string) {
  if (!(await currentUserCanEdit("/submittals"))) return;
  await approval.deleteDocument(id);
  revalidatePath("/submittals");
}
export async function restoreDocumentAction(id: string) {
  if (!(await currentUserCanEdit("/submittals"))) return;
  await approval.restoreDocument(id);
  revalidatePath("/submittals");
}

// ── workflows ──────────────────────────────────────────────
export async function createWorkflowAction(fd: FormData) {
  if (!(await currentUserCanEdit("/submittals"))) return;
  const positionIds = fd
    .getAll("positionId")
    .filter((v): v is string => typeof v === "string" && v.length > 0);
  await approval.createWorkflow({
    name: f(fd, "name"),
    description: f(fd, "description"),
    positionIds,
  });
  revalidatePath("/submittals");
}

export async function deleteWorkflowAction(id: string) {
  if (!(await currentUserCanEdit("/submittals"))) return;
  await approval.deleteWorkflow(id);
  revalidatePath("/submittals");
}
export async function restoreWorkflowAction(id: string) {
  if (!(await currentUserCanEdit("/submittals"))) return;
  await approval.restoreWorkflow(id);
  revalidatePath("/submittals");
}
