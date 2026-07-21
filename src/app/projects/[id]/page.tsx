import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Plus,
  AlertTriangle,
  ClipboardCheck,
  CircleDollarSign,
  CalendarClock,
} from "lucide-react";

import * as projectService from "@/service/project.service";
import { requireUser } from "@/service/auth.service";
import { canSeeAllProjects } from "@/lib/auth";
import {
  updateProjectAction,
  addMilestoneAction,
  deleteMilestoneAction,
  restoreMilestoneAction,
  addContractChangeAction,
  deleteContractChangeAction,
  restoreContractChangeAction,
  addDocumentAction,
  deleteDocumentAction,
  restoreDocumentAction,
  addProjectMemberAction,
} from "../actions";
import { DeleteProjectButton } from "./delete-project-button";
import { RecordDeleteButton } from "./record-delete-button";
import { MemberRemoveButton } from "./member-remove-button";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { ProgressWithTarget, RadialGauge } from "@/components/charts";
import { CityCombobox } from "@/components/city-combobox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  projectStatusMeta,
  projectStatusOptions,
  milestoneTypeMeta,
  milestoneTypeOptions,
  projectDocumentCategoryMeta,
  projectDocumentCategoryOptions,
  workItemStatusMeta,
  inspectionTypeMeta,
  inspectionResultMeta,
  defectSeverityMeta,
  defectStatusMeta,
  projectMemberRoleMeta,
  projectMemberRoleOptions,
} from "@/constant/pmis";
import { accountRoleMeta } from "@/constant/people";
import { cn, formatCurrency, formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "overview", label: "總覽" },
  { key: "basic", label: "基本資料" },
  { key: "members", label: "人力配置" },
  { key: "contract", label: "契約與文件" },
  { key: "milestones", label: "里程碑" },
  { key: "changes", label: "變更紀錄" },
  { key: "related", label: "相關作業" },
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

export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab } = await searchParams;
  const user = await requireUser();
  const project = await projectService.getProject(id, user);
  if (!project) notFound();

  const active = TABS.some((t) => t.key === tab) ? tab! : "overview";
  const meta = projectStatusMeta[project.status];
  const canManageMembers = canSeeAllProjects(user.role);
  const assignableAccounts = active === "members" && canManageMembers
    ? await projectService.listAssignableAccounts()
    : [];

  return (
    <>
      <PageHeader
        title={project.name}
        description={`專案編號 ${project.code}`}
        action={
          <div className="flex items-center gap-2">
            <Badge variant={meta.variant}>{meta.label}</Badge>
            <Button variant="outline" asChild>
              <Link href="/projects">
                <ArrowLeft className="size-4" />
                返回
              </Link>
            </Button>
            <DeleteProjectButton id={project.id} name={project.name} />
          </div>
        }
      />

      {/* tab nav */}
      <div className="flex gap-1 overflow-x-auto border-b px-4 sm:px-8">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/projects/${project.id}?tab=${t.key}`}
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
        {active === "overview" &&
          (() => {
            const o = projectService.computeProjectOverview(project);
            const now = o.now;
            const prog = o.progress;
            const behind = prog.gap < 0;
            const currentAmount = o.currentAmount;
            const originalAmount = o.originalAmount;
            const paidTotal = o.paidTotal;
            const paidPct = o.paidPct;
            const daysLeft = o.daysLeft;
            const overdueSchedule = o.overdueSchedule;

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
                href: `/projects/${project.id}?tab=milestones`,
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
                              ? "border-amber-500/40 bg-amber-500/5"
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
                                  ? "text-amber-500"
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
                          className="h-full rounded-full bg-emerald-600"
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

                {/* 第四層：關鍵資料 */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">關鍵資料</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm sm:grid-cols-3">
                      {[
                        ["業主", project.client],
                        ["承包商", project.contractor],
                        ["監造單位", project.supervisor],
                        ["地點", project.location],
                        ["開工日", formatDate(project.startDate)],
                        ["完工日", formatDate(project.endDate)],
                      ].map(([label, value]) => (
                        <div key={label}>
                          <dt className="text-xs text-muted-foreground">
                            {label}
                          </dt>
                          <dd className="mt-0.5 font-medium">
                            {value && value !== "—" ? value : "—"}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </CardContent>
                </Card>

                {/* 第五層：近期動態 */}
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between text-base">
                        近期查驗
                        <Link
                          href={`/projects/${project.id}?tab=related`}
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
                          href={`/projects/${project.id}?tab=related`}
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
              </div>
            );
          })()}

        {active === "basic" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">基本資料</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={updateProjectAction} className="space-y-5">
                <input type="hidden" name="id" value={project.id} />
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>專案編號</Label>
                    <Input defaultValue={project.code} disabled />
                  </div>
                  <Field label="專案名稱" name="name" defaultValue={project.name} />
                  <div className="space-y-1.5">
                    <Label htmlFor="location">地點</Label>
                    <CityCombobox
                      id="location"
                      name="location"
                      defaultValue={project.location ?? ""}
                      placeholder="輸入城市名稱或代碼搜尋"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="status">狀態</Label>
                    <Select id="status" name="status" defaultValue={project.status}>
                      {projectStatusOptions.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <Field
                    label="開工日"
                    name="startDate"
                    type="date"
                    defaultValue={dateInput(project.startDate)}
                  />
                  <Field
                    label="完工日"
                    name="endDate"
                    type="date"
                    defaultValue={dateInput(project.endDate)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="description">工程摘要</Label>
                  <Textarea
                    id="description"
                    name="description"
                    rows={3}
                    defaultValue={project.description ?? ""}
                  />
                </div>
                <Button type="submit">儲存</Button>
              </form>
            </CardContent>
          </Card>
        )}

        {active === "members" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                專案成員 ({project.members.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {project.members.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  尚未配置人力。
                  {canManageMembers ? "請於下方新增成員。" : ""}
                </p>
              ) : (
                <div className="divide-y">
                  {project.members.map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center justify-between gap-3 py-2"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                          {m.account.name.slice(0, 1)}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 text-sm font-medium">
                            <span className="truncate">{m.account.name}</span>
                            <Badge variant={projectMemberRoleMeta[m.role].variant}>
                              {projectMemberRoleMeta[m.role].label}
                            </Badge>
                          </div>
                          <div className="truncate text-xs text-muted-foreground">
                            {accountRoleMeta[m.account.role].label}
                            {m.account.orgUnit
                              ? ` · ${m.account.orgUnit.name}`
                              : ""}
                            {` · ${m.account.email}`}
                          </div>
                        </div>
                      </div>
                      {canManageMembers && (
                        <MemberRemoveButton
                          id={m.id}
                          projectId={project.id}
                          name={m.account.name}
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}

              {canManageMembers ? (
                <form
                  action={addProjectMemberAction}
                  className="grid grid-cols-1 gap-4 rounded-lg border bg-muted/30 p-4 sm:grid-cols-2"
                >
                  <input type="hidden" name="projectId" value={project.id} />
                  <div className="space-y-1.5">
                    <Label htmlFor="member-account">成員</Label>
                    <Select id="member-account" name="accountId" defaultValue="">
                      <option value="" disabled>
                        選擇帳號…
                      </option>
                      {assignableAccounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}（{accountRoleMeta[a.role].label}）
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="member-role">專案角色</Label>
                    <Select id="member-role" name="role" defaultValue="MEMBER">
                      {projectMemberRoleOptions.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="sm:col-span-2">
                    <Button type="submit" variant="secondary">
                      <Plus className="size-4" />
                      加入成員
                    </Button>
                  </div>
                </form>
              ) : (
                <p className="text-xs text-muted-foreground">
                  僅系統管理員與計畫主管可調整人力配置。
                </p>
              )}
            </CardContent>
          </Card>
        )}

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
                  <Button type="submit">儲存契約資料</Button>
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
                        <RecordDeleteButton
                          id={d.id}
                          projectId={project.id}
                          label="文件"
                          onDelete={deleteDocumentAction}
                          onRestore={restoreDocumentAction}
                        />
                      </div>
                    ))}
                  </div>
                )}

                <form
                  action={addDocumentAction}
                  className="grid grid-cols-1 gap-4 rounded-lg border bg-muted/30 p-4 sm:grid-cols-2"
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
                  <div className="sm:col-span-2">
                    <Button type="submit" variant="secondary">
                      <Plus className="size-4" />
                      新增文件
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </>
        )}

        {active === "milestones" &&
          (() => {
            const prog = projectService.computeMilestoneProgress(
              project.milestones.filter((m) => m.type === "MILESTONE"),
            );
            const behind = prog.gap < 0;
            return (
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">本專案進度</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex flex-wrap items-center gap-x-8 gap-y-2">
                      <div>
                        <div className="text-xs text-muted-foreground">整體進度</div>
                        <div className="text-2xl font-semibold tabular-nums">
                          {prog.overall}%
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">預定進度</div>
                        <div className="text-2xl font-semibold tabular-nums text-muted-foreground">
                          {prog.planned}%
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">落差</div>
                        <div>
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
                      </div>
                    </div>
                    <ProgressWithTarget
                      actual={prog.overall}
                      planned={prog.planned}
                    />
                    <p className="text-xs text-muted-foreground">
                      進度依里程碑權重計算，｜為預定進度位置。
                      {behind
                        ? "目前落後，建議檢視未達成里程碑並排定趕工。"
                        : "進度符合或超前預定。"}
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">
                      工期里程碑 ({project.milestones.length})
                    </CardTitle>
                  </CardHeader>
            <CardContent className="space-y-4">
              {project.milestones.length === 0 ? (
                <p className="text-sm text-muted-foreground">尚無里程碑。</p>
              ) : (
                <div className="divide-y">
                  {project.milestones.map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center justify-between gap-3 py-2"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <Badge variant={milestoneTypeMeta[m.type].variant}>
                          {milestoneTypeMeta[m.type].label}
                        </Badge>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">{m.name}</div>
                          <div className="text-xs text-muted-foreground">
                            預定 {formatDate(m.plannedDate)}
                            {m.actualDate ? ` · 實際 ${formatDate(m.actualDate)}` : ""}
                            {m.docNo ? ` · ${m.docNo}` : ""}
                          </div>
                        </div>
                      </div>
                      <RecordDeleteButton
                        id={m.id}
                        projectId={project.id}
                        label="里程碑"
                        onDelete={deleteMilestoneAction}
                        onRestore={restoreMilestoneAction}
                      />
                    </div>
                  ))}
                </div>
              )}

              <form
                action={addMilestoneAction}
                className="grid grid-cols-1 gap-4 rounded-lg border bg-muted/30 p-4 sm:grid-cols-2"
              >
                <input type="hidden" name="projectId" value={project.id} />
                <Field label="名稱" name="name" placeholder="如：連續壁完成" />
                <div className="space-y-1.5">
                  <Label htmlFor="ms-type">類型</Label>
                  <Select id="ms-type" name="type" defaultValue="MILESTONE">
                    {milestoneTypeOptions.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                </div>
                <Field label="預定日期" name="plannedDate" type="date" />
                <Field label="實際日期（達成日）" name="actualDate" type="date" />
                <Field label="進度權重" name="weight" type="number" placeholder="1" />
                <Field label="核准文號" name="docNo" />
                <Field label="說明" name="note" />
                <label className="flex items-center gap-2 text-sm sm:col-span-2">
                  <input
                    type="checkbox"
                    name="commissioning"
                    className="size-4 rounded border-input"
                  />
                  計入試運轉就緒度
                </label>
                <div className="sm:col-span-2">
                  <Button type="submit" variant="secondary">
                    <Plus className="size-4" />
                    新增里程碑
                  </Button>
                </div>
              </form>
            </CardContent>
                </Card>
              </div>
            );
          })()}

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
                      <RecordDeleteButton
                        id={c.id}
                        projectId={project.id}
                        label="變更紀錄"
                        onDelete={deleteContractChangeAction}
                        onRestore={restoreContractChangeAction}
                      />
                    </div>
                  ))}
                </div>
              )}

              <form
                action={addContractChangeAction}
                className="grid grid-cols-1 gap-4 rounded-lg border bg-muted/30 p-4 sm:grid-cols-2"
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
                <div className="sm:col-span-2">
                  <Button type="submit" variant="secondary">
                    <Plus className="size-4" />
                    新增變更紀錄
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {active === "related" && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  分項工程 ({project.workItems.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {project.workItems.length === 0 ? (
                  <p className="text-sm text-muted-foreground">尚無工項。</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>名稱</TableHead>
                        <TableHead>類別</TableHead>
                        <TableHead>狀態</TableHead>
                        <TableHead className="w-40">進度</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {project.workItems.map((wi) => (
                        <TableRow key={wi.id}>
                          <TableCell className="font-medium">{wi.name}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {wi.category ?? "—"}
                          </TableCell>
                          <TableCell>
                            <Badge variant={workItemStatusMeta[wi.status].variant}>
                              {workItemStatusMeta[wi.status].label}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                                <div
                                  className="h-full rounded-full bg-primary"
                                  style={{ width: `${wi.progress}%` }}
                                />
                              </div>
                              <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">
                                {wi.progress}%
                              </span>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    查驗紀錄 ({project.inspections.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {project.inspections.length === 0 ? (
                    <p className="text-sm text-muted-foreground">尚無查驗紀錄。</p>
                  ) : (
                    project.inspections.map((insp) => (
                      <div
                        key={insp.id}
                        className="flex items-start justify-between gap-3 border-b pb-3 last:border-0 last:pb-0"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <Badge variant={inspectionTypeMeta[insp.type].variant}>
                              {inspectionTypeMeta[insp.type].label}
                            </Badge>
                            <span className="truncate text-sm font-medium">
                              {insp.workItem?.name ?? insp.location ?? "全案"}
                            </span>
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {formatDate(insp.scheduledAt)} · {insp.inspector ?? "—"}
                          </div>
                        </div>
                        <Badge variant={inspectionResultMeta[insp.result].variant}>
                          {inspectionResultMeta[insp.result].label}
                        </Badge>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    缺失追蹤 ({project.defects.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {project.defects.length === 0 ? (
                    <p className="text-sm text-muted-foreground">尚無缺失。</p>
                  ) : (
                    project.defects.map((defect) => (
                      <div
                        key={defect.id}
                        className="flex items-start justify-between gap-3 border-b pb-3 last:border-0 last:pb-0"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">
                            {defect.title}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            負責：{defect.assignedTo ?? "—"} · 期限：
                            {formatDate(defect.dueDate)}
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <Badge variant={defectSeverityMeta[defect.severity].variant}>
                            {defectSeverityMeta[defect.severity].label}
                          </Badge>
                          <Badge variant={defectStatusMeta[defect.status].variant}>
                            {defectStatusMeta[defect.status].label}
                          </Badge>
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
