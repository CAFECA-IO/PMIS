import Link from "next/link";
import { redirect } from "next/navigation";

import * as projectService from "@/service/project.service";
import { requireUser } from "@/service/auth.service";
import { assertModuleAccess, canEditModule } from "@/service/access.service";
import { Wand2 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ProgressWithTarget } from "@/components/charts";
import { projectStatusMeta } from "@/constant/pmis";
import { formatDate } from "@/lib/utils";
import { decideProjectsPage, projectHref } from "@/lib/project-route";
import { ProjectCreateDialog } from "./project-create-dialog";

export const dynamic = "force-dynamic";

/**
 * 工程專案。
 *
 * 選定專案時本頁就是那個專案 —— 左上角選了某案，這一頁還列出全部，
 * 使用者得再點一次才進得去，而其他每個模組都已經跟著選定收斂了。
 * 未選定（全部專案）時才是清單。
 */
export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  const user = await requireUser();
  const perms = await assertModuleAccess(user, "/projects");
  const canEdit = canEditModule(perms, "/projects");
  const projects = await projectService.listProjects(user);
  const { project: selected } = await searchParams;

  /*
    轉向前先確認該專案在使用者看得到的清單裡。
    專案被刪或權限被移除時 ?project= 仍留在網址上，直接轉過去只會拿到
    404 或權限錯誤 —— 而使用者只是點了左上角，不會知道網址上還掛著它。
  */
  const decision = decideProjectsPage(
    selected,
    projects.map((p) => p.id),
  );
  if (decision.kind === "redirect") redirect(decision.href);

  return (
    <>
      <PageHeader
        section="02 契約與時程管理"
        title="工程專案"
        description="所有監造工程專案清單"
        action={
          canEdit ? (
            <div className="flex items-center gap-2">
              {/* 由契約文件建立：交給費思分段判讀 */}
              <Button variant="outline" asChild>
                <Link href="/projects/new">
                  <Wand2 className="size-4" />
                  專案建置
                </Link>
              </Button>
              <ProjectCreateDialog />
            </div>
          ) : undefined
        }
      />
      <div className="p-8">
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>編號</TableHead>
                <TableHead>專案名稱</TableHead>
                <TableHead>狀態</TableHead>
                <TableHead className="w-44">進度（｜為預定）</TableHead>
                <TableHead className="text-right">落差</TableHead>
                <TableHead>承包商</TableHead>
                <TableHead className="text-center">缺失</TableHead>
                <TableHead>工期</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={9}
                    className="py-10 text-center text-muted-foreground"
                  >
                    {canEdit
                      ? "尚無專案，請點選「新增專案」建立第一筆。"
                      : "尚無專案。"}
                  </TableCell>
                </TableRow>
              ) : (
                projects.map((p) => {
                  const meta = projectStatusMeta[p.status];
                  const g = p.progress.gap;
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono text-xs">
                        {p.code}
                      </TableCell>
                      <TableCell className="font-medium">
                        <Link
                          href={projectHref(p.id)}
                          className="text-primary hover:underline"
                        >
                          {p.name}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge variant={meta.variant}>{meta.label}</Badge>
                      </TableCell>
                      <TableCell>
                        <ProgressWithTarget
                          actual={p.progress.overall}
                          planned={p.progress.planned}
                        />
                        <div className="mt-1 text-[11px] tabular-nums text-muted-foreground">
                          {p.progress.overall}% / 預定 {p.progress.planned}%
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {g < 0 ? (
                          <Badge variant="destructive">落後 {Math.abs(g)}%</Badge>
                        ) : g > 0 ? (
                          <Badge variant="success">超前 {g}%</Badge>
                        ) : (
                          <Badge variant="muted">準時</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {p.contractor ?? "—"}
                      </TableCell>
                      <TableCell className="text-center tabular-nums">
                        {p._count.defects}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(p.startDate)} – {formatDate(p.endDate)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="outline" size="sm" asChild>
                          <Link href={projectHref(p.id)}>管理</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </Card>
      </div>
    </>
  );
}
