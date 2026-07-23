"use server";

import { revalidatePath } from "next/cache";

import * as qualityService from "@/service/quality.service";
import { requireUser } from "@/service/auth.service";
import { currentUserCanEdit } from "@/service/access.service";

function field(formData: FormData, key: string): string | undefined {
  const v = formData.get(key);
  return typeof v === "string" ? v : undefined;
}

async function actor() {
  const user = await requireUser();
  return { id: user.id, role: user.role, name: user.name };
}

export async function createInspectionAction(formData: FormData) {
  if (!(await currentUserCanEdit("/quality"))) return;
  const projectId = field(formData, "projectId");
  if (!projectId) return;
  await qualityService.addInspection(
    {
      projectId,
      workItemId: field(formData, "workItemId"),
      type: field(formData, "type"),
      scheduledAt: field(formData, "scheduledAt"),
      inspector: field(formData, "inspector"),
      result: field(formData, "result"),
      location: field(formData, "location"),
      notes: field(formData, "notes"),
    },
    await actor(),
  );
  revalidatePath("/quality");
  revalidatePath("/");
}

export async function createDefectAction(formData: FormData) {
  if (!(await currentUserCanEdit("/quality"))) return;
  const projectId = field(formData, "projectId");
  if (!projectId) return;
  await qualityService.addDefect(
    {
      projectId,
      workItemId: field(formData, "workItemId"),
      title: field(formData, "title"),
      description: field(formData, "description"),
      severity: field(formData, "severity"),
      status: field(formData, "status"),
      assignedTo: field(formData, "assignedTo"),
      dueDate: field(formData, "dueDate"),
    },
    await actor(),
  );
  revalidatePath("/quality");
  revalidatePath("/");
}
