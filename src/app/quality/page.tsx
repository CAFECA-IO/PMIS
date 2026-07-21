import * as qualityService from "@/service/quality.service";
import * as projectService from "@/service/project.service";
import { requireUser } from "@/service/auth.service";
import { PageHeader } from "@/components/page-header";
import { ProjectSwitcher } from "@/components/project-switcher";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  inspectionTypeMeta,
  inspectionResultMeta,
  defectSeverityMeta,
  defectStatusMeta,
} from "@/constant/pmis";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "品質稽核 — PMIS" };

export default async function QualityPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  const user = await requireUser();
  const { project } = await searchParams;
  const projectList = await projectService.listProjects(user);
  const selectedProjectId =
    project && projectList.some((p) => p.id === project) ? project : undefined;
  const { inspections, defects } = await qualityService.getQuality(
    selectedProjectId,
  );

  return (
    <>
      <PageHeader
        title="品質稽核管理"
        description="PMIS-07 · 施工品質抽查、材料設備抽驗與缺失改善追蹤"
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
            <CardTitle className="text-base">
              施工查驗紀錄 ({inspections.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>類別</TableHead>
                  <TableHead>查驗日期</TableHead>
                  <TableHead>部位 / 工項</TableHead>
                  <TableHead>查驗人</TableHead>
                  <TableHead>專案</TableHead>
                  <TableHead>結果</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {inspections.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell>
                      <Badge variant={inspectionTypeMeta[i.type].variant}>
                        {inspectionTypeMeta[i.type].label}
                      </Badge>
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {formatDate(i.scheduledAt)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {i.location ?? i.workItem?.name ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {i.inspector ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {i.project.name}
                    </TableCell>
                    <TableCell>
                      <Badge variant={inspectionResultMeta[i.result].variant}>
                        {inspectionResultMeta[i.result].label}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">缺失改善 ({defects.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>缺失</TableHead>
                  <TableHead>專案</TableHead>
                  <TableHead>負責</TableHead>
                  <TableHead>改善期限</TableHead>
                  <TableHead>嚴重度</TableHead>
                  <TableHead>狀態</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {defects.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium">{d.title}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {d.project.name}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {d.assignedTo ?? "—"}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {formatDate(d.dueDate)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={defectSeverityMeta[d.severity].variant}>
                        {defectSeverityMeta[d.severity].label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={defectStatusMeta[d.status].variant}>
                        {defectStatusMeta[d.status].label}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
