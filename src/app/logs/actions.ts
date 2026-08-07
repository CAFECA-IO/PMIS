"use server";

import { revalidatePath } from "next/cache";

import * as reportService from "@/service/supervisionReport.service";
// 彙整報表（週/月/季/年）的服務，與上方日報服務不同
import * as periodReportService from "@/service/report.service";
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
      stopReason: field(formData, "stopReason"),
      excludedFromDuration: field(formData, "excludedFromDuration"),
      exclusionBasis: field(formData, "exclusionBasis"),
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
      stopReason: field(formData, "stopReason"),
      excludedFromDuration: field(formData, "excludedFromDuration"),
      exclusionBasis: field(formData, "exclusionBasis"),
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

/**
 * 某日的預定與實際累計進度（決策 C）。
 *
 * 兩者皆即時推導，不存欄位；實際取截至該日的累計，
 * 故補填舊日報時呈現的是當時的進度，而非今日的。
 */
export async function loadDailyProgressAction(
  projectId: string,
  dateISO: string,
): Promise<reportService.DailyProgress | null> {
  return reportService.getDailyProgress(projectId, dateISO, await actor());
}

// ── 彙整報表留存（決策 J-a）───────────────────────────────

/** 留存目前的報表為草稿；供使用者明確按下「留存」時呼叫。 */
export async function saveReportAction(
  projectId: string,
  type: periodReportService.ReportType,
  refDate: string | undefined,
): Promise<{ ok: boolean; error?: string }> {
  if (!(await currentUserCanEdit("/logs"))) {
    return { ok: false, error: "無編輯權限。" };
  }
  const saved = await periodReportService.generateAndSaveReport(
    projectId,
    type,
    refDate,
    await actor(),
  );
  if (!saved) return { ok: false, error: "無法存取此專案。" };
  refresh();
  return { ok: true };
}

export async function listSavedReportsAction(projectId: string) {
  return periodReportService.listSavedReports(projectId, await actor());
}

export async function confirmSavedReportAction(id: string) {
  if (!(await currentUserCanEdit("/logs"))) {
    return { ok: false as const, error: "無編輯權限。" };
  }
  const r = await periodReportService.confirmSavedReport(id, await actor());
  refresh();
  return r;
}

export async function deleteSavedReportAction(id: string) {
  if (!(await currentUserCanEdit("/logs"))) {
    return { ok: false as const, error: "無編輯權限。" };
  }
  const r = await periodReportService.deleteSavedReport(id, await actor());
  refresh();
  return r;
}

/** 某份日報的變更軌跡（決策 J-b）。 */
export async function listReportAuditAction(reportId: string) {
  return reportService.listReportAudit(reportId, await actor());
}
