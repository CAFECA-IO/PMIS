import * as scheduleService from "@/service/schedule.service";
import * as projectService from "@/service/project.service";
import { requireUser } from "@/service/auth.service";
import { assertModuleAccess } from "@/service/access.service";
import { PageHeader } from "@/components/page-header";
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
import { workItemStatusMeta } from "@/constant/pmis";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "時程進度 — PMIS" };

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  const user = await requireUser();
  await assertModuleAccess(user, "/schedule");
  const { project } = await searchParams;
  const projectList = await projectService.listProjects(user);
  const selectedProjectId =
    project && projectList.some((p) => p.id === project) ? project : undefined;
  const projects = await scheduleService.listSchedule(selectedProjectId);

  return (
    <>
      <PageHeader
        section="02 契約與時程管理"
        title="時程進度管理"
        description="PMIS-04 · 工程進度、預定/實際與落後預警"
      />
      <div className="space-y-6 p-8">
        {projects.length === 0 ? (
          <p className="text-sm text-muted-foreground">尚無工項資料。</p>
        ) : (
          projects.map((p) => {
            const avg =
              p.workItems.length > 0
                ? Math.round(
                    p.workItems.reduce((s, w) => s + w.progress, 0) /
                      p.workItems.length,
                  )
                : 0;
            const delayed = p.workItems.filter(
              (w) => w.status === "DELAYED",
            ).length;
            return (
              <Card key={p.id}>
                <CardHeader className="flex-row items-center justify-between">
                  <CardTitle className="text-base">{p.name}</CardTitle>
                  <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    {delayed > 0 ? (
                      <Badge variant="destructive">{delayed} 項落後</Badge>
                    ) : null}
                    <span>平均進度 {avg}%</span>
                  </div>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>工項</TableHead>
                        <TableHead>類別</TableHead>
                        <TableHead>預定</TableHead>
                        <TableHead>狀態</TableHead>
                        <TableHead className="w-48">進度</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {p.workItems.map((w) => {
                        const wm = workItemStatusMeta[w.status];
                        return (
                          <TableRow key={w.id}>
                            <TableCell className="font-medium">
                              {w.name}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {w.category ?? "—"}
                            </TableCell>
                            <TableCell className="text-muted-foreground tabular-nums">
                              {formatDate(w.plannedStart)} –{" "}
                              {formatDate(w.plannedEnd)}
                            </TableCell>
                            <TableCell>
                              <Badge variant={wm.variant}>{wm.label}</Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                                  <div
                                    className={
                                      "h-full rounded-full " +
                                      (w.status === "DELAYED"
                                        ? "bg-destructive"
                                        : "bg-primary")
                                    }
                                    style={{ width: `${w.progress}%` }}
                                  />
                                </div>
                                <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">
                                  {w.progress}%
                                </span>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </>
  );
}
