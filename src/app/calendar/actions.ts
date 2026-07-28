"use server";

import { revalidatePath } from "next/cache";

import * as alertService from "@/service/alert.service";
import { currentUserCanEdit } from "@/service/access.service";

async function canEdit() {
  return currentUserCanEdit("/calendar");
}

function refresh() {
  revalidatePath("/calendar");
  revalidatePath("/");
}

function field(fd: FormData, key: string): string | undefined {
  const v = fd.get(key);
  return typeof v === "string" ? v : undefined;
}

export type RuleActionState = { error?: string };

export async function saveAlertRuleAction(
  _prev: RuleActionState,
  formData: FormData,
): Promise<RuleActionState> {
  if (!(await canEdit())) return { error: "權限不足，無法編輯預警規則。" };

  const result = await alertService.saveRule({
    id: field(formData, "id") || undefined,
    projectId: field(formData, "projectId"),
    name: field(formData, "name"),
    description: field(formData, "description"),
    kind: field(formData, "kind"),
    module: field(formData, "module"),
    severity: field(formData, "severity"),
    fixedDate: field(formData, "fixedDate"),
    anchor: field(formData, "anchor"),
    offsetDays: field(formData, "offsetDays"),
    metric: field(formData, "metric"),
    operator: field(formData, "operator"),
    threshold: field(formData, "threshold"),
    unit: field(formData, "unit"),
    action: field(formData, "action"),
    notify: field(formData, "notify"),
  });
  if (!result.ok) return { error: result.error };
  refresh();
  return {};
}

export async function toggleAlertRuleAction(id: string, enabled: boolean) {
  if (!(await canEdit())) return;
  await alertService.toggleRule(id, enabled);
  refresh();
}

export async function deleteAlertRuleAction(id: string) {
  if (!(await canEdit())) return;
  await alertService.deleteRule(id);
  refresh();
}
