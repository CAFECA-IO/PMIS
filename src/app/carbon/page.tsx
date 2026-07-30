import Link from "next/link";
import { Leaf } from "lucide-react";

import * as carbonService from "@/service/carbon.service";
import * as projectService from "@/service/project.service";
import { requireUser } from "@/service/auth.service";
import { assertModuleAccess } from "@/service/access.service";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatRows } from "@/components/charts";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { carbonScopeMeta, carbonScopeColor } from "@/constant/pmis";
import { CARBON_SCOPES } from "@/service/carbon.calc";
import { CarbonTab } from "../projects/[id]/carbon-tab";
import { withProject } from "@/lib/project-link";

export const dynamic = "force-dynamic";
export const metadata = { title: "碳盤查 — PMIS" };

export default async function CarbonPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string; inv?: string }>;
}) {
  const user = await requireUser();
  await assertModuleAccess(user, "/carbon");
  const { project, inv } = await searchParams;
  const actor = { id: user.id, name: user.name, role: user.role };

  const projectList = await projectService.listProjects(user);
  const selectedProjectId =
    project && projectList.some((p) => p.id === project) ? project : undefined;

  const header = (
    <PageHeader
      section="04 工程執行與查核"
        title="碳盤查"
      description="溫室氣體盤查與跨專案彙總（僅顯示您可檢視的專案）"
    />
  );

  // ── 單一專案：完整碳盤查（總覽／明細／新增／稽核）──
  if (selectedProjectId) {
    return (
      <>
        {header}
        <div className="p-8">
          <CarbonTab projectId={selectedProjectId} actor={actor} inventoryId={inv} />
        </div>
      </>
    );
  }

  // ── 全部專案：跨專案彙總 ──
  const summary = await carbonService.crossProjectSummary(actor);
  const scopeRows = CARBON_SCOPES.filter((s) => summary.byScopeKg[s] > 0).map(
    (s) => ({
      label: carbonScopeMeta[s].label,
      value: Math.round((summary.byScopeKg[s] / 1000) * 1000) / 1000,
      color: carbonScopeColor[s],
    }),
  );
  const maxTonnes = Math.max(1, ...summary.projects.map((p) => p.totalTonnes));

  return (
    <>
      {header}
      <div className="space-y-6 p-8">
        {/* KPI */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Leaf className="size-4 text-muted-foreground" />
                總排放量
              </div>
              <div className="mt-2 text-2xl font-semibold tabular-nums">
                {summary.totalTonnes.toLocaleString()}
                <span className="ml-1 text-sm font-normal text-muted-foreground">
                  tCO₂e
                </span>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <div className="text-xs text-muted-foreground">盤查份數</div>
              <div className="mt-2 text-2xl font-semibold tabular-nums">
                {summary.inventoryCount}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <div className="text-xs text-muted-foreground">有排放資料專案</div>
              <div className="mt-2 text-2xl font-semibold tabular-nums">
                {summary.projects.length}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* 分範疇 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">分範疇排放 (tCO₂e)</CardTitle>
            </CardHeader>
            <CardContent>
              {scopeRows.length === 0 ? (
                <p className="text-sm text-muted-foreground">尚無排放資料。</p>
              ) : (
                <StatRows items={scopeRows} />
              )}
            </CardContent>
          </Card>

          {/* 專案排行 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">專案排放排行</CardTitle>
            </CardHeader>
            <CardContent>
              {summary.projects.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  尚無專案碳盤查資料。
                </p>
              ) : (
                <div className="space-y-2.5">
                  {summary.projects.map((p) => (
                    <div key={p.projectId} className="flex items-center gap-2 text-sm">
                      <Link
                        href={withProject("/carbon", p.projectId)}
                        className="w-40 shrink-0 truncate text-primary hover:underline"
                      >
                        {p.projectName}
                      </Link>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${(p.totalTonnes / maxTonnes) * 100}%` }}
                        />
                      </div>
                      <span className="w-20 text-right tabular-nums text-muted-foreground">
                        {p.totalTonnes.toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* 專案明細表 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">專案碳排明細</CardTitle>
          </CardHeader>
          <CardContent>
            {summary.projects.length === 0 ? (
              <p className="text-sm text-muted-foreground">尚無資料。</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>專案</TableHead>
                    <TableHead className="text-right">排放量 (tCO₂e)</TableHead>
                    <TableHead className="text-right">占比</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.projects.map((p) => (
                    <TableRow key={p.projectId}>
                      <TableCell className="font-medium">{p.projectName}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {p.totalTonnes.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {summary.totalTonnes > 0
                          ? `${Math.round((p.totalTonnes / summary.totalTonnes) * 100)}%`
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Link
                          href={withProject("/carbon", p.projectId)}
                          className="text-sm text-primary hover:underline"
                        >
                          檢視
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
