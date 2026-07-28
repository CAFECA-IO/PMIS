import * as projectService from "@/service/project.service";
import * as reportService from "@/service/supervisionReport.service";
import { requireUser } from "@/service/auth.service";
import { assertModuleAccess, canEditModule } from "@/service/access.service";
import { PageHeader } from "@/components/page-header";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProjectSwitcher } from "@/components/project-switcher";
import { reportStatusMeta } from "@/constant/pmis";
import { formatDate } from "@/lib/utils";
import { CreateRecordDialog } from "@/components/ui/create-record-dialog";
import { ReportGenerator } from "./report-generator";
import { ReportDialogFields } from "./report-dialog-fields";
import { ReportEditForm } from "./report-edit-form";
import { fileReportAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "工程日誌 — PMIS" };

function toDateInput(d: Date | null | undefined): string | undefined {
  if (!d) return undefined;
  const dt = new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(
    dt.getDate(),
  ).padStart(2, "0")}`;
}

export default async function LogsPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  const user = await requireUser();
  const perms = await assertModuleAccess(user, "/logs");
  const canEdit = canEditModule(perms, "/logs");
  const { project } = await searchParams;
  const projectList = await projectService.listProjects(user);

  if (projectList.length === 0) {
    return (
      <>
        <PageHeader
          section="03 文件與協作"
          title="工程日誌"
          description="日報由監造人員填報；週/月/季/年報由費思 AI 彙整（PMIS-11）"
        />
        <div className="p-8">
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">
              目前沒有可檢視的專案。
            </CardContent>
          </Card>
        </div>
      </>
    );
  }

  const selected =
    (project && projectList.find((p) => p.id === project)) || projectList[0];
  const reports = await reportService.listReports(selected.id);
  const today = toDateInput(new Date());

  return (
    <>
      <PageHeader
        section="03 文件與協作"
          title="工程日誌"
        description="日報由監造人員填報（監造報表）；週/月/季/年報由費思 AI 彙整（PMIS-11）"
        action={
          <ProjectSwitcher
            projects={projectList.map((p) => ({ id: p.id, name: p.name }))}
            selected={selected.id}
          />
        }
      />
      <div className="space-y-6 p-8">
        {/* 日報（監造報表，人工填報） */}
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">日報（監造報表）</CardTitle>
            {canEdit && (
              <CreateRecordDialog
                title="填報日報"
                triggerLabel="新建日報"
                action={fileReportAction}
                submitLabel="送出"
              >
                <ReportDialogFields projectId={selected.id} today={today} />
              </CreateRecordDialog>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {reports.length > 0 && (
              <div className="space-y-2">
                {reports.map((r) => (
                  <div key={r.id} className="rounded-lg border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="font-medium tabular-nums">
                          {formatDate(r.reportDate)}
                        </span>
                        {r.weather ? (
                          <span className="text-muted-foreground">
                            {r.weather}
                          </span>
                        ) : null}
                        <Badge variant={reportStatusMeta[r.status].variant}>
                          {reportStatusMeta[r.status].label}
                        </Badge>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {r.filedBy ?? "—"}
                      </span>
                    </div>
                    {r.summary ? (
                      <p className="mt-1 text-sm text-muted-foreground">
                        {r.summary}
                      </p>
                    ) : null}
                    {canEdit && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs text-primary hover:underline">
                          編輯 / 刪除
                        </summary>
                        <ReportEditForm
                          id={r.id}
                          projectId={selected.id}
                          dateISO={toDateInput(r.reportDate) ?? ""}
                          dateLabel={formatDate(r.reportDate)}
                          initial={{
                            weather: r.weather ?? "",
                            status: r.status,
                            summary: r.summary ?? "",
                            manpower: r.manpower ?? "",
                            equipment: r.equipment ?? "",
                            keyNotes: r.keyNotes ?? "",
                          }}
                        />
                      </details>
                    )}
                  </div>
                ))}
              </div>
            )}
            {reports.length === 0 && (
              <p className="text-sm text-muted-foreground">
                {canEdit ? "尚無日報，點右上「新建日報」填報。" : "尚無日報。"}
              </p>
            )}
          </CardContent>
        </Card>

        {/* AI 彙整報告（週/月/季/年） */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              AI 彙整報告（週 / 月 / 季 / 年）
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ReportGenerator
              projectId={selected.id}
              projectName={selected.name}
            />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
