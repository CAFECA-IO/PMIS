import Link from "next/link";

import * as projectService from "@/service/project.service";
import { requireUser } from "@/service/auth.service";
import { assertModuleAccess, canEditModule } from "@/service/access.service";
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
import { ProjectCreateDialog } from "./project-create-dialog";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const user = await requireUser();
  const perms = await assertModuleAccess(user, "/projects");
  const canEdit = canEditModule(perms, "/projects");
  const projects = await projectService.listProjects(user);

  return (
    <>
      <PageHeader
        title="工程專案"
        description="所有監造工程專案清單"
        action={canEdit ? <ProjectCreateDialog /> : undefined}
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
                          href={`/projects/${p.id}`}
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
                          <Link href={`/projects/${p.id}`}>管理</Link>
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
