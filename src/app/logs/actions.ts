"use server";

import { revalidatePath } from "next/cache";

import * as reportService from "@/service/supervisionReport.service";
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

function refresh() {
  revalidatePath("/logs");
  revalidatePath("/documents");
  revalidatePath("/");
}

export async function fileReportAction(formData: FormData) {
  if (!(await currentUserCanEdit("/logs"))) return;
  const projectId = field(formData, "projectId");
  if (!projectId) return;
  await reportService.fileReport(
    {
      projectId,
      reportDate: field(formData, "reportDate"),
      weather: field(formData, "weather"),
      summary: field(formData, "summary"),
      manpower: field(formData, "manpower"),
      equipment: field(formData, "equipment"),
      keyNotes: field(formData, "keyNotes"),
      status: field(formData, "status"),
      items: field(formData, "items"),
    },
    await actor(),
  );
  refresh();
}

export async function updateReportAction(formData: FormData) {
  if (!(await currentUserCanEdit("/logs"))) return;
  const id = field(formData, "id");
  if (!id) return;
  await reportService.updateReport(
    id,
    {
      weather: field(formData, "weather"),
      summary: field(formData, "summary"),
      manpower: field(formData, "manpower"),
      equipment: field(formData, "equipment"),
      keyNotes: field(formData, "keyNotes"),
      status: field(formData, "status"),
      items: field(formData, "items"),
    },
    await actor(),
  );
  refresh();
}

export async function deleteReportAction(id: string) {
  if (!(await currentUserCanEdit("/logs"))) return;
  await reportService.deleteReport(id, await actor());
  refresh();
}

export async function suggestReportAction(
  projectId: string,
  dateISO: string,
): Promise<{ summary: string; keyNotes: string } | null> {
  return reportService.suggestReport(projectId, dateISO, await actor());
}

/**
 * 數量表的預帶清單（E1）。
 *
 * 由表單在日期變更時取用：清單本身與日期無關，但該日已填的數量有關，
 * 故一併以日期查詢，讓編輯既有日報時能帶回已填內容。
 */
export async function loadQtyFormAction(
  projectId: string,
  dateISO: string | undefined,
): Promise<reportService.QtyFormData | null> {
  return reportService.loadQtyForm(projectId, dateISO, await actor());
}
