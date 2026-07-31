import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  AlertTriangle,
  ClipboardCheck,
  CircleDollarSign,
  CalendarClock,
  MapPin,
} from "lucide-react";

import * as projectService from "@/service/project.service";
import * as gisService from "@/service/gis.service";
import { requireUser } from "@/service/auth.service";
import { assertModuleAccess, canEditModule } from "@/service/access.service";
import { ProjectMiniMap, MiniMapEmpty } from "./project-mini-map";
import { SCurveChart } from "@/components/s-curve-chart";
import { CurveBasisToggle } from "./curve-basis-toggle";
import * as faithUpload from "@/service/faithUpload.service";
import { rolledUpProgress } from "@/service/obligation-rollup";
import {
} from "@/constant/obligation";
import {
  updateProjectAction,
  addContractChangeAction,
  deleteContractChangeAction,
  restoreContractChangeAction,
  addDocumentAction,
  deleteDocumentAction,
  restoreDocumentAction,
} from "../actions";
import { UnassignedUploadsPrompt } from "./unassigned-uploads";
import { DeleteProjectButton } from "./delete-project-button";
import { RecordDeleteButton } from "./record-delete-button";
import { PageHeader } from "@/components/page-header";
import { withProject } from "@/lib/project-link";
import { BasicInfoCard } from "./basic-info-card";
import { decideProjectPage, projectHref } from "@/lib/project-route";
import { Button } from "@/components/ui/button";
import { CreateRecordDialog } from "@/components/ui/create-record-dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { ProgressWithTarget, RadialGauge } from "@/components/charts";
import {
  projectStatusMeta,
  projectDocumentCategoryMeta,
  projectDocumentCategoryOptions,
  inspectionTypeMeta,
  inspectionResultMeta,
  defectSeverityMeta,
} from "@/constant/pmis";
import { cn, formatCurrency, formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

/*
  三個分頁。

  拿掉的四個各有更合適的去處，留在這裡只是入口重複：
   - 基本資料 → 併入總覽的第一張卡（原本「看到的」與「能改的」是兩組欄位）
   - 人力配置 → 帳號管理的「專案配置」（那是誰能碰什麼的問題）
   - 履約事項 → 履約事項模組（有統計、篩選與甘特圖）
   - 相關作業 → 工程分項改於估驗台帳維護，查驗與缺失各有模組頁

  專案頁因此回到它該做的事：這個案子是什麼、契約與文件、改過什麼。
*/
const TABS = [
  { key: "overview", label: "總覽" },
  { key: "contract", label: "契約與文件" },
  { key: "changes", label: "變更紀錄" },
] as const;

function dateInput(d: Date | null | undefined) {
  return d ? new Date(d).toISOString().slice(0, 10) : "";
}

function Field({
  label,
  name,
  defaultValue,
  type = "text",
  placeholder,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        name={name}
        type={type}
        defaultValue={defaultValue}
        placeholder={placeholder}
      />
    </div>
  );
}

/** Date → yyyy-mm-dd（供 <input type="date"> 的 defaultValue） */

export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    tab?: string;
    curve?: string;
    created?: string;
    project?: string;
  }>;
}) {
  const { id } = await params;
  const { tab, curve, created, project: selected } = await searchParams;
  const curveBasis = curve === "workitem" ? "WORKITEM" : "OBLIGATION";
  const user = await requireUser();
  const perms = await assertModuleAccess(user, "/projects");
  const canEdit = canEditModule(perms, "/projects");
  const project = await projectService.getProject(id, user);
  if (!project) notFound();

  /*
    網址上沒有 ?project=（或指向別的專案）時補上。
    從通知、費思的連結或書籤進來時常常沒帶，於是左上角顯示「全部專案」
    而畫面上明明開著這一件 —— 兩者不一致比沒有更容易誤判。
  */
  const routing = decideProjectPage(id, selected, tab);
  if (routing.kind === "redirect") redirect(routing.href);

  const active = TABS.some((t) => t.key === tab) ? tab! : "overview";
  const meta = projectStatusMeta[project.status];
  const miniMap =
    active === "overview"
      ? await gisService.getProjectMiniMap(project.id, user)
      : null;
  // 工程分項明細（含 obligationId）供 S-Curve 上捲與履約事項達成度
  const wiDetails =
    active === "overview"
      ? await projectService.getWorkItemDetails(project.id)
      : [];
  const obligationOptions = project.obligations;
  /*
    專案剛建立時（?created=1）才查詢未指派檔案並提示是否一併歸入。
    刻意只在建立後的這一刻出現，避免每次進入專案都被同一則提示打擾；
    平時要處理未指派檔案，檔案管理（PMIS-13）已有完整清單。
  */
  const unassignedUploads =
    created === "1" && canEdit
      ? (await faithUpload.listUnassigned(user.id)).map((u) => ({
          id: u.id,
          fileName: u.fileName,
          size: u.size,
          taskTitle: u.taskTitle,
          createdAt: u.createdAt.toISOString(),
        }))
      : [];

  return (
    <>
      <PageHeader
        section="02 契約與時程管理"
        title={project.name}
        description={`專案編號 ${project.code}`}
        /*
          標題列只放狀態。
          刪除移到總覽末尾的獨立區塊 —— 它與「編輯基本資料」「切換分頁」
          這些每天都在做的事放在一起，遲早會有人點錯；而刪除牽動的是
          整案的分項、查驗、缺失、文件與履約事項。
        */
        action={<Badge variant={meta.variant}>{meta.label}</Badge>}
      />

      {/* tab nav */}
      <div className="flex gap-1 overflow-x-auto border-b px-4 sm:px-8">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={projectHref(project.id, t.key)}
            className={cn(
              "-mb-px border-b-2 px-4 py-3 text-sm font-medium transition-colors",
              active === t.key
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>

      <div className="max-w-4xl space-y-6 p-8">
        {unassignedUploads.length > 0 ? (
          <UnassignedUploadsPrompt
            projectId={project.id}
            uploads={unassignedUploads}
          />
        ) : null}

        {active === "overview" &&
          (() => {
            const o = projectService.computeProjectOverview(project);
            const now = o.now;
            const currentAmount = o.currentAmount;
            const originalAmount = o.originalAmount;
            const paidTotal = o.paidTotal;
            const paidPct = o.paidPct;
            const daysLeft = o.daysLeft;
            const overdueSchedule = o.overdueSchedule;
            const sCurve = projectService.computeProjectSCurve(
              project.obligations,
              wiDetails,
              curveBasis,
            );
            // 進度環圈／落差警示／S-Curve 卡共用全系統統一的「上捲進度」定義
            const prog = rolledUpProgress(project.obligations, wiDetails);
            const behind = prog.gap < 0;
            const obligationCount = obligationOptions.length;
            const workItemCount = wiDetails.length;
            const isWorkItemBasis = curveBasis === "WORKITEM";

            const recentInspections = project.inspections.slice(0, 4);
            const priorityDefects = project.defects
              .filter((d) => d.status === "OPEN" || d.status === "IN_PROGRESS")
              .sort((a, b) => {
                const at = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
                const bt = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
                return at - bt;
              })
              .slice(0, 4);

            const alerts = [
              {
                key: "progress",
                label: "進度落差",
                value: behind ? `落後 ${Math.abs(prog.gap)}%` : "準時/超前",
                danger: behind,
                icon: AlertTriangle,
                href: `/projects/${project.id}?tab=obligations`,
              },
              {
                key: "defects",
                label: "逾期未改善缺失",
                value: `${o.overdueCount} 件`,
                sub: `待處理共 ${o.openCount} 件`,
                danger: o.overdueCount > 0,
                icon: AlertTriangle,
                href: `/projects/${project.id}?tab=related`,
              },
              {
                key: "inspections",
                label: "待查驗",
                value: `${o.pendingInspectionCount} 件`,
                danger: false,
                warn: o.pendingInspectionCount > 0,
                icon: ClipboardCheck,
                href: `/projects/${project.id}?tab=related`,
              },
              {
                key: "schedule",
                label: "剩餘工期",
                value:
                  daysLeft == null
                    ? "未設定"
                    : overdueSchedule
                      ? `逾期 ${Math.abs(daysLeft)} 天`
                      : `${daysLeft} 天`,
                danger: overdueSchedule,
                icon: CalendarClock,
                href: `/projects/${project.id}?tab=basic`,
              },
            ];

            return (
              <div className="space-y-6">
                {/* 第一層：狀態警示 */}
                <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                  {alerts.map((a) => {
                    const Icon = a.icon;
                    return (
                      <Link
                        key={a.key}
                        href={a.href}
                        className={cn(
                          "rounded-xl border p-4 transition-colors hover:bg-muted/40",
                          a.danger
                            ? "border-destructive/40 bg-destructive/5"
                            : a.warn
                              ? "border-warning/40"
                              : "",
                        )}
                      >
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Icon
                            className={cn(
                              "size-4",
                              a.danger
                                ? "text-destructive"
                                : a.warn
                                  ? "text-warning"
                                  : "text-muted-foreground",
                            )}
                          />
                          {a.label}
                        </div>
                        <div
                          className={cn(
                            "mt-2 text-xl font-semibold tabular-nums",
                            a.danger ? "text-destructive" : "text-foreground",
                          )}
                        >
                          {a.value}
                        </div>
                        {a.sub && (
                          <div className="mt-0.5 text-xs text-muted-foreground">
                            {a.sub}
                          </div>
                        )}
                      </Link>
                    );
                  })}
                </div>

                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                  {/* 第二層：進度 */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">工程進度</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center gap-5">
                        <div
                          className={
                            behind ? "text-destructive" : "text-primary"
                          }
                        >
                          <RadialGauge
                            value={prog.overall}
                            color="currentColor"
                          />
                        </div>
                        <div className="flex-1 space-y-3">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">
                              預定進度
                            </span>
                            <span className="font-semibold tabular-nums">
                              {prog.planned}%
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">落差</span>
                            {prog.gap < 0 ? (
                              <Badge variant="destructive">
                                落後 {Math.abs(prog.gap)}%
                              </Badge>
                            ) : prog.gap > 0 ? (
                              <Badge variant="success">超前 {prog.gap}%</Badge>
                            ) : (
                              <Badge variant="muted">準時</Badge>
                            )}
                          </div>
                          <ProgressWithTarget
                            actual={prog.overall}
                            planned={prog.planned}
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* 第三層：契約與財務 */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <CircleDollarSign className="size-4 text-muted-foreground" />
                        契約與財務
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">契約金額</span>
                        <span className="font-semibold tabular-nums">
                          {formatCurrency(currentAmount)}
                        </span>
                      </div>
                      {o.hasChanges && originalAmount != null && (
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">
                            變更 ({o.changeCount} 次)
                          </span>
                          <span className="tabular-nums text-muted-foreground">
                            原 {formatCurrency(originalAmount)}
                          </span>
                        </div>
                      )}
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">
                          累計已付款
                        </span>
                        <span className="font-semibold tabular-nums">
                          {formatCurrency(paidTotal)}
                          <span className="ml-1 text-xs text-muted-foreground">
                            ({paidPct}%)
                          </span>
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${Math.min(100, paidPct)}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between pt-1">
                        <span className="text-muted-foreground">
                          待付款節點
                        </span>
                        <span className="tabular-nums">
                          {o.pendingPaymentCount} 項
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/*
                  第四層：基本資料。
                  同一張卡負責顯示與編輯（右上角鉛筆就地切換），
                  不再有一個只顯示六項的「關鍵資料」加一個欄位還更少的編輯分頁。
                */}
                <BasicInfoCard
                  canEdit={canEdit}
                  info={{
                    id: project.id,
                    code: project.code,
                    name: project.name,
                    contractNo: project.contractNo,
                    client: project.client,
                    contractor: project.contractor,
                    supervisor: project.supervisor,
                    location: project.location,
                    budget: project.budget != null ? String(project.budget) : null,
                    status: project.status,
                    signedDate: dateInput(project.signedDate),
                    noticeDate: dateInput(project.noticeDate),
                    startDate: dateInput(project.startDate),
                    endDate: dateInput(project.endDate),
                    description: project.description,
                  }}
                />

                {/* 第五層：進度 S-Curve（資料連動） */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
                      <span className="flex items-center gap-3">
                        進度 S-Curve
                        <CurveBasisToggle basis={curveBasis} />
                      </span>
                      <span
                        className={cn(
                          "text-xs font-normal",
                          behind ? "text-destructive" : "text-success",
                        )}
                      >
                        {behind
                          ? `落後預定 ${Math.abs(prog.gap)}%`
                          : `準時／超前 ${prog.gap}%`}
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <SCurveChart points={sCurve} />
                    {isWorkItemBasis ? (
                      <p className="mt-3 border-t pt-3 text-xs leading-relaxed text-muted-foreground">
                        以<b>工程分項</b>（共 {workItemCount} 項）為基準：
                        <b>預定累計</b>將各分項按「預定工期天數」在其期間內線性展開累計、
                        <b>實際累計</b>以分項目前 <b>進度 %</b> 為終值自起始日線性分佈，
                        <b>預測</b>自目前實際值外推至工期末。調整分項的預定/實際起訖日或進度即會改變曲線 —{" "}
                        <Link
                          href={withProject(
                            `/projects/${project.id}/ledger`,
                            project.id,
                          )}
                          className="text-primary hover:underline"
                        >
                          前往估驗台帳維護分項
                        </Link>
                        。
                      </p>
                    ) : (
                      <p className="mt-3 border-t pt-3 text-xs leading-relaxed text-muted-foreground">
                        以<b>履約事項</b>（共 {obligationCount} 項）為基準：
                        <b>預定累計</b>來自各履約事項的「期限 × 權重」、
                        <b>實際累計</b>來自「實際完成日 × 權重」，<b>預測</b>自目前實際值外推至工期末。
                        調整權重或填入實際完成日即會改變曲線 —{" "}
                        <Link
                          href={withProject("/obligations", project.id)}
                          className="text-primary hover:underline"
                        >
                          前往履約事項
                        </Link>
                        。
                      </p>
                    )}
                  </CardContent>
                </Card>

                {/* 第六層：近期動態 */}
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between text-base">
                        近期查驗
                        <Link
                          href={withProject("/quality", project.id)}
                          className="text-xs font-normal text-primary hover:underline"
                        >
                          全部
                        </Link>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {recentInspections.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          尚無查驗紀錄。
                        </p>
                      ) : (
                        recentInspections.map((insp) => (
                          <div
                            key={insp.id}
                            className="flex items-center justify-between gap-3 border-b pb-2 last:border-0 last:pb-0"
                          >
                            <div className="flex min-w-0 items-center gap-2">
                              <Badge
                                variant={inspectionTypeMeta[insp.type].variant}
                              >
                                {inspectionTypeMeta[insp.type].label}
                              </Badge>
                              <span className="truncate text-sm">
                                {insp.workItem?.name ?? insp.location ?? "全案"}
                              </span>
                            </div>
                            <Badge
                              variant={inspectionResultMeta[insp.result].variant}
                            >
                              {inspectionResultMeta[insp.result].label}
                            </Badge>
                          </div>
                        ))
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between text-base">
                        待處理缺失
                        <Link
                          href={withProject("/quality", project.id)}
                          className="text-xs font-normal text-primary hover:underline"
                        >
                          全部
                        </Link>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {priorityDefects.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          無待處理缺失。
                        </p>
                      ) : (
                        priorityDefects.map((defect) => {
                          const overdue =
                            defect.dueDate &&
                            new Date(defect.dueDate).getTime() < now;
                          return (
                            <div
                              key={defect.id}
                              className="flex items-start justify-between gap-3 border-b pb-2 last:border-0 last:pb-0"
                            >
                              <div className="min-w-0">
                                <div className="truncate text-sm font-medium">
                                  {defect.title}
                                </div>
                                <div
                                  className={cn(
                                    "mt-0.5 text-xs",
                                    overdue
                                      ? "font-medium text-destructive"
                                      : "text-muted-foreground",
                                  )}
                                >
                                  期限 {formatDate(defect.dueDate)}
                                  {overdue ? " · 已逾期" : ""}
                                </div>
                              </div>
                              <Badge
                                variant={
                                  defectSeverityMeta[defect.severity].variant
                                }
                              >
                                {defectSeverityMeta[defect.severity].label}
                              </Badge>
                            </div>
                          );
                        })
                      )}
                    </CardContent>
                  </Card>
                </div>

                {/* 第七層：工地位置 GIS 小地圖（PMIS-12） */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <MapPin className="size-4" /> 工地位置與周邊（GIS）
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {miniMap && miniMap.lat != null && miniMap.lng != null ? (
                      <ProjectMiniMap
                        projectId={project.id}
                        lat={miniMap.lat}
                        lng={miniMap.lng}
                        features={miniMap.features.map((f) => ({
                          id: f.id,
                          name: f.name,
                          type: f.type,
                          geojson: f.geojson,
                          color: f.color,
                        }))}
                        overlays={miniMap.overlays}
                      />
                    ) : (
                      <MiniMapEmpty projectId={project.id} />
                    )}
                  </CardContent>
                </Card>
              </div>
            );
          })()}

        {active === "contract" && (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">契約資料</CardTitle>
              </CardHeader>
              <CardContent>
                <form action={updateProjectAction} className="space-y-5">
                  <input type="hidden" name="id" value={project.id} />
                  <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                    <Field
                      label="契約編號"
                      name="contractNo"
                      defaultValue={project.contractNo ?? ""}
                    />
                    <Field
                      label="契約金額 (TWD)"
                      name="budget"
                      type="number"
                      defaultValue={project.budget ? String(project.budget) : ""}
                    />
                    <Field
                      label="業主"
                      name="client"
                      defaultValue={project.client ?? ""}
                    />
                    <Field
                      label="承包商"
                      name="contractor"
                      defaultValue={project.contractor ?? ""}
                    />
                    <Field
                      label="監造單位"
                      name="supervisor"
                      defaultValue={project.supervisor ?? ""}
                    />
                  </div>
                  {canEdit && <Button type="submit">儲存契約資料</Button>}
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  契約與文件 ({project.documents.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {project.documents.length === 0 ? (
                  <p className="text-sm text-muted-foreground">尚無文件。</p>
                ) : (
                  <div className="divide-y">
                    {project.documents.map((d) => (
                      <div
                        key={d.id}
                        className="flex items-center justify-between gap-3 py-2"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <Badge
                            variant={projectDocumentCategoryMeta[d.category].variant}
                          >
                            {projectDocumentCategoryMeta[d.category].label}
                          </Badge>
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium">
                              {d.url ? (
                                <a
                                  href={d.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="hover:text-primary hover:underline"
                                >
                                  {d.name}
                                </a>
                              ) : (
                                d.name
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {d.fileNo ? `${d.fileNo} · ` : ""}
                              {formatDate(d.issuedDate)}
                              {d.note ? ` · ${d.note}` : ""}
                            </div>
                          </div>
                        </div>
                        {canEdit && (
                          <RecordDeleteButton
                            id={d.id}
                            projectId={project.id}
                            label="文件"
                            onDelete={deleteDocumentAction}
                            onRestore={restoreDocumentAction}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {canEdit && (
                <div className="flex justify-end">
                  <CreateRecordDialog
                    title="新增契約文件"
                  assistId="project-document"
                    triggerLabel="新增文件"
                    action={addDocumentAction}
                  >
                    <input type="hidden" name="projectId" value={project.id} />
                    <div className="space-y-1.5">
                      <Label htmlFor="doc-category">類別</Label>
                      <Select id="doc-category" name="category" defaultValue="CONTRACT">
                        {projectDocumentCategoryOptions.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <Field label="文件名稱" name="name" placeholder="如：工程契約書" />
                    <Field label="歸檔編號" name="fileNo" />
                    <Field label="核發/文件日期" name="issuedDate" type="date" />
                    <Field label="連結 (URL)" name="url" placeholder="https://…" />
                    <Field label="備註" name="note" />
                  </CreateRecordDialog>
                </div>
                )}
              </CardContent>
            </Card>
          </>
        )}

        {active === "changes" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                契約變更紀錄 ({project.contractChanges.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {project.contractChanges.length === 0 ? (
                <p className="text-sm text-muted-foreground">尚無變更紀錄。</p>
              ) : (
                <div className="divide-y">
                  {project.contractChanges.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-start justify-between gap-3 py-2"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium">
                          第 {c.sequence} 次變更
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {c.description}
                        </div>
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {formatDate(c.approvedDate)}
                          {c.daysChanged ? ` · ${c.daysChanged} 天` : ""}
                          {c.amountAfter
                            ? ` · 變更後 ${formatCurrency(Number(c.amountAfter))}`
                            : ""}
                          {c.docNo ? ` · ${c.docNo}` : ""}
                        </div>
                      </div>
                      {canEdit && (
                        <RecordDeleteButton
                          id={c.id}
                          projectId={project.id}
                          label="變更紀錄"
                          onDelete={deleteContractChangeAction}
                          onRestore={restoreContractChangeAction}
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}

              {canEdit && (
              <div className="flex justify-end">
                <CreateRecordDialog
                  title="新增契約變更"
                  assistId="contract-change"
                  triggerLabel="新增變更紀錄"
                  action={addContractChangeAction}
                >
                  <input type="hidden" name="projectId" value={project.id} />
                  <Field label="變更次數 (留空自動遞增)" name="sequence" type="number" />
                  <Field label="核准日期" name="approvedDate" type="date" />
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="cc-desc">變更內容</Label>
                    <Textarea id="cc-desc" name="description" rows={2} />
                  </div>
                  <Field label="變更後金額 (TWD)" name="amountAfter" type="number" />
                  <Field label="變更天數" name="daysChanged" type="number" />
                  <Field label="核准文號" name="docNo" />
                </CreateRecordDialog>
              </div>
              )}
            </CardContent>
          </Card>
        )}

        {/*
          總覽末尾的不可逆操作區。

          設計上刻意低調而非隱藏：外框是虛線、文字是次要色、按鈕是 ghost，
          與上方每一張實心卡片明顯不同層級 —— 使用者掃過去不會誤觸，
          但真的要找時知道它在最下面（那是這類操作的慣例位置）。
          真正的把關在確認視窗裡：必須手動輸入 DELETE。
        */}
        {active === "overview" && canEdit ? (
          <div className="mt-2 rounded-lg border border-dashed px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted-foreground">
                  不可逆操作
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground/80">
                  刪除本案會一併移除其工程分項、查驗、缺失、文件、履約事項與變更紀錄，
                  90 天內可於垃圾桶復原。
                </p>
              </div>
              <DeleteProjectButton id={project.id} name={project.name} />
            </div>
          </div>
        ) : null}

      </div>
    </>
  );
}
