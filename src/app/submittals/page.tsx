import Link from "next/link";
import { Plus } from "lucide-react";

import * as approval from "@/service/approval.service";
import * as people from "@/service/people.service";
import * as submittalService from "@/service/submittal.service";
import * as projectService from "@/service/project.service";
import { requireUser } from "@/service/auth.service";
import { PageHeader } from "@/components/page-header";
import { ProjectSwitcher } from "@/components/project-switcher";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
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
  { key: "documents", label: "簽核文件" },
  { key: "workflows", label: "流程設定" },
  { key: "submittals", label: "送審清單" },
] as const;

export default async function SubmittalsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; project?: string }>;
}) {
  const { tab, project } = await searchParams;
  const active = TABS.some((t) => t.key === tab) ? tab! : "documents";

  const user = await requireUser();
  const projectList = await projectService.listProjects(user);
  const selectedProjectId =
    project && projectList.some((p) => p.id === project) ? project : undefined;

  const [documents, workflows, accounts, positions, submittals] =
    await Promise.all([
      approval.listDocuments(),
      approval.listWorkflows(),
      people.listAccounts(),
      people.listPositions(),
      submittalService.listSubmittals(selectedProjectId),
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
                              <SoftDeleteButton
                                id={d.id}
                                label="簽核文件"
                                name={d.title}
                                onDelete={deleteDocumentAction}
                                onRestore={restoreDocumentAction}
                              />
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

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
                      <SoftDeleteButton
                        id={w.id}
                        label="流程"
                        name={w.name}
                        onDelete={deleteWorkflowAction}
                        onRestore={restoreWorkflowAction}
                      />
                    </div>
                  ))
                )}
              </div>

              <form
                action={createWorkflowAction}
                className="space-y-4 rounded-lg border bg-muted/30 p-4"
              >
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="wf-name">流程名稱 *</Label>
                    <Input id="wf-name" name="name" placeholder="施工計畫審核流程" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="wf-desc">說明</Label>
                    <Input id="wf-desc" name="description" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>簽核關卡（依序，最多 5 關，可留空）</Label>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-5">
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
                <Button type="submit" variant="secondary">
                  <Plus className="size-4" />
                  新增流程
                </Button>
              </form>
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
