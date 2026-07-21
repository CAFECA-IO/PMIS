"use server";

import { revalidatePath } from "next/cache";

import * as carbonService from "@/service/carbon.service";
import { requireUser } from "@/service/auth.service";
import type { CarbonEntryStatus } from "@/generated/prisma/enums";

function field(formData: FormData, key: string): string | undefined {
  const v = formData.get(key);
  return typeof v === "string" ? v : undefined;
}

async function actor() {
  const user = await requireUser();
  return { id: user.id, name: user.name, role: user.role };
}

function refresh(projectId: string) {
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/carbon");
}

export async function createInventoryAction(formData: FormData) {
  const projectId = field(formData, "projectId");
  if (!projectId) return;
  await carbonService.createInventory(
    {
      projectId,
      name: field(formData, "name") || "年度盤查",
      periodStart: field(formData, "periodStart"),
      periodEnd: field(formData, "periodEnd"),
      baselineCo2e: field(formData, "baselineCo2e"),
      targetCo2e: field(formData, "targetCo2e"),
      intensityBasis: field(formData, "intensityBasis"),
    },
    await actor(),
  );
  refresh(projectId);
}

export async function addEntryAction(formData: FormData) {
  const projectId = field(formData, "projectId");
  const inventoryId = field(formData, "inventoryId");
  if (!projectId || !inventoryId) return;
  await carbonService.addEntry(
    {
      inventoryId,
      scope: field(formData, "scope"),
      categoryId: field(formData, "categoryId"),
      activityQty: field(formData, "activityQty"),
      activityUnit: field(formData, "activityUnit"),
      occurredAt: field(formData, "occurredAt"),
      evidenceUrl: field(formData, "evidenceUrl"),
      note: field(formData, "note"),
    },
    await actor(),
  );
  refresh(projectId);
}

export async function setEntryStatusAction(
  entryId: string,
  status: CarbonEntryStatus,
  projectId: string,
) {
  await carbonService.setEntryStatus(entryId, status, await actor());
  refresh(projectId);
}

export async function removeEntryAction(entryId: string, projectId: string) {
  await carbonService.removeEntry(entryId, await actor());
  refresh(projectId);
}
