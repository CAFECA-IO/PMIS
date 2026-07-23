import Link from "next/link";

import * as approval from "@/service/approval.service";
import * as people from "@/service/people.service";
import * as submittalService from "@/service/submittal.service";
import * as projectService from "@/service/project.service";
import { requireUser } from "@/service/auth.service";
import { assertModuleAccess, canEditModule } from "@/service/access.service";
import { PageHeader } from "@/components/page-header";
import { ProjectSwitcher } from "@/components/project-switcher";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { CreateRecordDialog } from "@/components/ui/create-record-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SoftDeleteButton } from "@/components/ui/soft-delete-button";
import { approvalStatusMeta } from "@/constant/approval";
import {
  submittalCategoryMeta,
  submittalStatusMeta,
  reviewResultMeta,
} from "@/constant/pmis";
import { cn, formatDate } from "@/lib/utils";
import { DocumentForm } from "./document-form";
import { StepFlow } from "./step-flow";
import {
  createWorkflowAction,
  deleteDocumentAction,
  restoreDocumentAction,
  deleteWorkflowAction,
  restoreWorkflowAction,
} from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "簽核管理 — PMIS" };

const TABS = [
  { key: "overview", label: "總覽" },
  { key: "documents", label: "簽核文件" },
  { key: "workflows", label: "流程設定" },
  { key: "submittals", label: "送審清單" },
] as const;

export default async function SubmittalsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; project?: string; period?: string }>;
}) {
  const { tab, project, period } = await searchParams;
  const active = TABS.some((t) => t.key === tab) ? tab! : "overview";

  const PERIODS = [
    { value: "ALL", label: "全部" },
    { value: "WEEKLY", label: "週" },
    { value: "MONTHLY", label: "月" },
    { value: "QUARTERLY", label: "季" },
    { value: "ANNUAL", label: "年" },
  ] as const;
  const activePeriod = (PERIODS.some((p) => p.value === period)
    ? period
    : "ALL") as (typeof PERIODS)[number]["value"];

  const user = await requireUser();
  const perms = await assertModuleAccess(user, "/submittals");
  const canEdit = canEditModule(perms, "/submittals");
  const projectList = await projectService.listProjects(user);
  const selectedProjectId =
    project && projectList.some((p) => p.id === project) ? project : undefined;

  const [documents, workflows, accounts, positions, submittals, overview] =
    await Promise.all([
      approval.listDocuments(),
      approval.listWorkflows(),
      people.listAccounts(),
      people.listPositions(),
      submittalService.listSubmittals(selectedProjectId),
      approval.getSubmittalOverview(
        { id: user.id, positionId: user.positionId },
        activePeriod,
      ),
    ]);
  const projectQuery = selectedProjectId ? `&project=${selectedProjectId}` : "";

  const applicantOptions = accounts.map((a) => ({ id: a.id, name: a.name }));
  const workflowOptions = workflows.map((w) => ({ id: w.id, name: w.name }));

  return (
    <>
      <PageHeader
        title="簽核管理"
        description="PMIS-06 · 設定簽核流程、建立簽核文件並逐關簽核"
        action={
          <ProjectSwitcher
            projects={projectList.map((p) => ({ id: p.id, name: p.name }))}
            selected={selectedProjectId}
          />
        }
      />

      <div className="flex gap-1 overflow-x-auto border-b px-4 sm:px-8">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/submittals?tab=${t.key}${projectQuery}`}
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

      <div className="max-w-5xl space-y-6 p-8">
        {active === "overview" &&
          (() => {
            const STATUS_ORDER = [
              "PENDING",
              "APPROVED",
              "REJECTED",
              "CANCELLED",
            ] as const;
            const barColor: Record<string, string> = {
              PENDING: "bg-amber-500",
              APPROVED: "bg-emerald-500",
              REJECTED: "bg-destructive",
              CANCELLED: "bg-muted-foreground/40",
            };
            const total = overview.total || 1;

            const DocRow = ({
              d,
            }: {
              d: (typeof overview.applied)[number];
            }) => (
              <Link
                href={`/submittals/${d.id}`}
                className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm transition-colors hover:bg-accent"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{d.title}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {d.applicant.name} · {formatDate(d.createdAt)}
                  </div>
                </div>
                <StepFlow
                  steps={d.steps}
                  currentStep={d.currentStep}
                  status={d.status}
                />
                <Badge variant={approvalStatusMeta[d.status].variant}>
                  {approvalStatusMeta[d.status].label}
                </Badge>
              </Link>
            );

            return (
              <div className="space-y-6">
                {/* Info: (20260721 - Luphia) 週期切換 */}
                <div className="flex flex-wrap gap-1.5">
                  {PERIODS.map((p) => (
                    <Link
                      key={p.value}
                      href={`/submittals?tab=overview&period=${p.value}${projectQuery}`}
                      className={cn(
                        "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                        activePeriod === p.value
                          ? "border-primary bg-primary/10 text-primary"
                          : "text-muted-foreground hover:bg-accent",
                      )}
                    >
                      {p.label}
                    </Link>
                  ))}
                </div>

                {/* 流程狀態看板（全部文件） */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">
                      文件流程狀態 · 全部（共 {overview.total} 件）
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {STATUS_ORDER.map((s) => (
                        <div key={s} className="rounded-lg border p-3">
                          <div className="text-2xl font-semibold tabular-nums">
                            {overview.statusCounts[s]}
                          </div>
                          <Badge variant={approvalStatusMeta[s].variant}>
                            {approvalStatusMeta[s].label}
                          </Badge>
                        </div>
                      ))}
                    </div>
                    <div className="flex h-2.5 overflow-hidden rounded-full bg-muted">
                      {STATUS_ORDER.map((s) =>
                        overview.statusCounts[s] > 0 ? (
                          <div
                            key={s}
                            className={barColor[s]}
                            style={{
                              width: `${(overview.statusCounts[s] / total) * 100}%`,
                            }}
                            title={`${approvalStatusMeta[s].label} ${overview.statusCounts[s]}`}
                          />
                        ) : null,
                      )}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      {STATUS_ORDER.map((s) => (
                        <span key={s} className="flex items-center gap-1.5">
                          <span className={cn("size-2.5 rounded-full", barColor[s])} />
                          {approvalStatusMeta[s].label}
                        </span>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* 待我簽核 */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">
                      待我簽核 ({overview.pendingMe.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {overview.pendingMe.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        目前沒有待您簽核的文件。
                      </p>
                    ) : (
                      overview.pendingMe.map((d) => <DocRow key={d.id} d={d} />)
                    )}
                  </CardContent>
                </Card>

                {overview.applied.length > 0 || overview.signed.length > 0 ? (
                  <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">我近期送件</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        {overview.applied.length === 0 ? (
                          <p className="text-sm text-muted-foreground">
                            尚無送件紀錄。
                          </p>
                        ) : (
                          overview.applied.map((d) => <DocRow key={d.id} d={d} />)
                        )}
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">我近期經手簽核</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        {overview.signed.length === 0 ? (
                          <p className="text-sm text-muted-foreground">
                            尚無簽核紀錄。
                          </p>
                        ) : (
                          overview.signed.map((d) => <DocRow key={d.id} d={d} />)
                        )}
                      </CardContent>
                    </Card>
                  </div>
                ) : (
                  /* Info: (20260721 - Luphia) 個人區塊皆空時，改列近期全部文件避免總覽空白 */
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">近期文件（全部）</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {overview.recent.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          尚無簽核文件。
                        </p>
                      ) : (
                        overview.recent.map((d) => <DocRow key={d.id} d={d} />)
                      )}
                    </CardContent>
                  </Card>
                )}
              </div>
            );
          })()}

        {active === "documents" && (
          <>
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>文件標題</TableHead>
                      <TableHead>申請者</TableHead>
                      <TableHead>流程</TableHead>
                      <TableHead className="text-center">進度</TableHead>
                      <TableHead>狀態</TableHead>
                      <TableHead className="text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {documents.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                          尚無簽核文件。
                        </TableCell>
                      </TableRow>
                    ) : (
                      documents.map((d) => {
                        const approved = d.steps.filter(
                          (s) => s.decision === "APPROVED",
                        ).length;
                        return (
                          <TableRow key={d.id}>
                            <TableCell className="font-medium">
                              <Link
                                href={`/submittals/${d.id}`}
                                className="text-primary hover:underline"
                              >
                                {d.title}
                              </Link>
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {d.applicant.name}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {d.workflow.name}
                            </TableCell>
                            <TableCell className="text-center tabular-nums text-muted-foreground">
                              {approved}/{d.steps.length}
                            </TableCell>
                            <TableCell>
                              <Badge variant={approvalStatusMeta[d.status].variant}>
                                {approvalStatusMeta[d.status].label}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              {canEdit && (
                                <SoftDeleteButton
                                  id={d.id}
                                  label="簽核文件"
                                  name={d.title}
                                  onDelete={deleteDocumentAction}
                                  onRestore={restoreDocumentAction}
                                />
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {canEdit && (
              <Card>
                <CardContent className="space-y-4 p-6">
                  <h3 className="text-sm font-medium text-muted-foreground">
                    建立簽核文件
                  </h3>
                  {workflowOptions.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      請先於「流程設定」建立至少一個簽核流程。
                    </p>
                  ) : (
                    <DocumentForm
                      applicants={applicantOptions}
                      workflows={workflowOptions}
                    />
                  )}
                </CardContent>
              </Card>
            )}
          </>
        )}

        {active === "workflows" && (
          <Card>
            <CardContent className="space-y-5 p-6">
              <div className="divide-y">
                {workflows.length === 0 ? (
                  <p className="py-2 text-sm text-muted-foreground">
                    尚無簽核流程。
                  </p>
                ) : (
                  workflows.map((w) => (
                    <div
                      key={w.id}
                      className="flex items-start justify-between gap-3 py-3"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium">{w.name}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                          {w.steps.map((s, i) => (
                            <span key={s.id} className="flex items-center gap-1">
                              {i > 0 ? <span>→</span> : null}
                              <span className="rounded bg-muted px-1.5 py-0.5">
                                {s.position.name}
                              </span>
                            </span>
                          ))}
                          <span className="ml-2">· {w._count.documents} 份文件</span>
                        </div>
                      </div>
                      {canEdit && (
                        <SoftDeleteButton
                          id={w.id}
                          label="流程"
                          name={w.name}
                          onDelete={deleteWorkflowAction}
                          onRestore={restoreWorkflowAction}
                        />
                      )}
                    </div>
                  ))
                )}
              </div>

              {canEdit && (
              <div className="flex justify-end">
                <CreateRecordDialog
                  title="新增簽核流程"
                  triggerLabel="新增流程"
                  action={createWorkflowAction}
                >
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="wf-name">流程名稱 *</Label>
                    <Input id="wf-name" name="name" placeholder="施工計畫審核流程" />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="wf-desc">說明</Label>
                    <Input id="wf-desc" name="description" />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label>簽核關卡（依序，最多 5 關，可留空）</Label>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {[0, 1, 2, 3, 4].map((i) => (
                        <Select key={i} name="positionId" defaultValue="">
                          <option value="">第 {i + 1} 關（無）</option>
                          {positions.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </Select>
                      ))}
                    </div>
                  </div>
                </CreateRecordDialog>
              </div>
              )}
            </CardContent>
          </Card>
        )}

        {active === "submittals" && (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>類別</TableHead>
                    <TableHead>送審項目</TableHead>
                    <TableHead>預定送審</TableHead>
                    <TableHead>審查結果</TableHead>
                    <TableHead>狀態</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {submittals.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                        尚無送審資料。
                      </TableCell>
                    </TableRow>
                  ) : (
                    submittals.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell>
                          <Badge variant={submittalCategoryMeta[s.category].variant}>
                            {submittalCategoryMeta[s.category].label}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium">{s.name}</TableCell>
                        <TableCell className="tabular-nums">
                          {formatDate(s.plannedSubmitDate)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={reviewResultMeta[s.reviewResult].variant}>
                            {reviewResultMeta[s.reviewResult].label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={submittalStatusMeta[s.status].variant}>
                            {submittalStatusMeta[s.status].label}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
