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
import { CreateRecordDialog } from "@/components/ui/create-record-dialog";
import { ReportGenerator } from "./report-generator";
import { ReportDialogFields } from "./report-dialog-fields";
import { ReportLogView, type DayReport } from "./report-log-view";
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

// Info: (20260806 - Julian) 解析 ?month=YYYY-MM；非法或缺省時回當月
function parseMonth(raw: string | undefined): { year: number; month: number } {
  const now = new Date();
  const m = /^(\d{4})-(\d{2})$/.exec(raw ?? "");
  if (!m) return { year: now.getFullYear(), month: now.getMonth() + 1 };
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) {
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  }
  return { year, month };
}

export default async function LogsPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string; month?: string; view?: string }>;
}) {
  const user = await requireUser();
  const perms = await assertModuleAccess(user, "/logs");
  const canEdit = canEditModule(perms, "/logs");
  const { project, month: monthParam, view: viewParam } = await searchParams;
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

  const { year, month } = parseMonth(monthParam);
  const view = viewParam === "list" ? "list" : "calendar";
  const monthStart = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const monthEnd = new Date(year, month, 0, 23, 59, 59, 999);
  const monthReports = await reportService.listReportsInPeriod(
    selected.id,
    monthStart,
    monthEnd,
  );
  const dayReports: DayReport[] = monthReports.map((r) => ({
    id: r.id,
    dateISO: toDateInput(r.reportDate) ?? "",
    weather: r.weather ?? "",
    stopReason: r.stopReason ?? "",
    excludedFromDuration: r.excludedFromDuration,
    exclusionBasis: r.exclusionBasis ?? "",
    status: r.status,
    summary: r.summary ?? "",
    manpower: r.manpower ?? "",
    equipment: r.equipment ?? "",
    keyNotes: r.keyNotes ?? "",
    filedBy: r.filedBy ?? null,
  }));
  const today = toDateInput(new Date());

  return (
    <>
      <PageHeader
        section="03 文件與協作"
          title="工程日誌"
        description="日報由監造人員填報（監造報表）；週/月/季/年報由費思 AI 彙整（PMIS-11）"
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
          <CardContent>
            <ReportLogView
              projectId={selected.id}
              canEdit={canEdit}
              year={year}
              month={month}
              reports={dayReports}
              view={view}
            />
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
              canEdit={canEdit}
            />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
