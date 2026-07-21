import { Sparkles } from "lucide-react";

import * as ehsService from "@/service/ehs.service";
import * as projectService from "@/service/project.service";
import { requireUser } from "@/service/auth.service";
import { PageHeader } from "@/components/page-header";
import { ProjectSwitcher } from "@/components/project-switcher";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ImageAnalyzer } from "./image-analyzer";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ehsTypeMeta, ehsResultMeta } from "@/constant/pmis";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "環安衛管理 — PMIS" };

export default async function EhsPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  const user = await requireUser();
  const { project } = await searchParams;
  const projectList = await projectService.listProjects(user);
  const selectedProjectId =
    project && projectList.some((p) => p.id === project) ? project : undefined;
  const audits = await ehsService.listEhsAudits(selectedProjectId);

  return (
    <>
      <PageHeader
        title="環安衛管理"
        description="PMIS-05 · 環境、職安衛、交通維持督導與稽核紀錄"
        action={
          <ProjectSwitcher
            projects={projectList.map((p) => ({ id: p.id, name: p.name }))}
            selected={selectedProjectId}
          />
        }
      />
      <div className="space-y-6 p-8">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="size-4 text-primary" />
              AI 工地影像判讀
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ImageAnalyzer />
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>類別</TableHead>
                <TableHead>稽核日期</TableHead>
                <TableHead>地點</TableHead>
                <TableHead>缺失情形</TableHead>
                <TableHead>改善期限</TableHead>
                <TableHead>專案</TableHead>
                <TableHead>結果</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {audits.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                    尚無稽核紀錄。
                  </TableCell>
                </TableRow>
              ) : (
                audits.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>
                      <Badge variant={ehsTypeMeta[a.type].variant}>
                        {ehsTypeMeta[a.type].label}
                      </Badge>
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {formatDate(a.auditedAt)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {a.location ?? "—"}
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-muted-foreground">
                      {a.findings ?? "—"}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {formatDate(a.dueDate)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {a.project.name}
                    </TableCell>
                    <TableCell>
                      <Badge variant={ehsResultMeta[a.result].variant}>
                        {ehsResultMeta[a.result].label}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      </div>
    </>
  );
}
