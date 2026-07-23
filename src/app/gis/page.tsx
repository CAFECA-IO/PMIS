import Link from "next/link";
import { AlertTriangle, ShieldCheck, HelpCircle, MapPin, Download } from "lucide-react";

import { requireUser } from "@/service/auth.service";
import { assertModuleAccess, canEditModule } from "@/service/access.service";
import * as gisService from "@/service/gis.service";
import * as projectService from "@/service/project.service";
import { PageHeader } from "@/components/page-header";
import { ProjectSwitcher } from "@/components/project-switcher";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GisMap } from "./gis-map";
import { RiskBriefing } from "./risk-briefing";

export const dynamic = "force-dynamic";
export const metadata = { title: "GIS 地圖 — PMIS" };

export default async function GisPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  const user = await requireUser();
  const perms = await assertModuleAccess(user, "/gis");
  const canEdit = canEditModule(perms, "/gis");
  const { project } = await searchParams;

  const projectList = await projectService.listProjects(user);
  const selected =
    project && projectList.some((p) => p.id === project) ? project : undefined;

  const [layers, mapData] = await Promise.all([
    gisService.listLayers(),
    gisService.getMapData(user, selected),
  ]);
  const risk = selected ? await gisService.getSiteRisk(selected, user) : null;
  const linkTargets = selected
    ? await gisService.listLinkTargets(selected, user)
    : undefined;

  return (
    <>
      <PageHeader
        title="GIS 地圖"
        description="PMIS-12 · 政府圖資套疊 OSM 白底底圖，工地周邊風險判讀與專案空間管理"
        action={
          <ProjectSwitcher
            projects={projectList.map((p) => ({ id: p.id, name: p.name }))}
            selected={selected}
          />
        }
      />
      <div className="space-y-4 p-4 sm:p-6">
        {risk && (
          <Card>
            <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
              <CardTitle className="flex items-center gap-2 text-base">
                <MapPin className="size-4" /> 周邊風險摘要
              </CardTitle>
              <div className="flex items-center gap-2">
                <Button asChild size="sm" variant="ghost">
                  <Link href={`/api/gis/export/${selected}?format=geojson`}>
                    <Download className="size-4" /> GeoJSON
                  </Link>
                </Button>
                <Button asChild size="sm" variant="ghost">
                  <Link href={`/api/gis/export/${selected}?format=kml`}>
                    <Download className="size-4" /> KML
                  </Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {!risk.hasSite ? (
                <p className="text-sm text-muted-foreground">
                  此專案尚未設定工地座標。請於地圖右側工具點「設定工地位置」後在圖上點選，或設定 TGOS 金鑰後自動定位。
                </p>
              ) : (
                <>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {risk.zones.map((z) => (
                      <div
                        key={z.title}
                        className="flex items-start gap-2 rounded-md border p-2.5 text-sm"
                      >
                        {z.status === "hit" ? (
                          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-red-600" />
                        ) : z.status === "clear" ? (
                          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                        ) : (
                          <HelpCircle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                        )}
                        <div>
                          <p className="font-medium">{z.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {z.status === "hit"
                              ? `⚠ 位於${z.label ? `：${z.label}` : "潛勢範圍"}`
                              : z.status === "clear"
                                ? "未落於此範圍"
                                : "資料未匯入，請於地圖檢視圖層"}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {risk.facilities.length > 0 && (
                    <div className="flex flex-wrap gap-2 text-sm">
                      {risk.facilities.map((f) => (
                        <span
                          key={f.title}
                          className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1"
                        >
                          <span
                            className="size-2 rounded-full"
                            style={{ background: f.color ?? "#64748b" }}
                          />
                          最近{f.title}
                          {f.name ? `「${f.name}」` : ""}約 {f.distanceM}m
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="grid gap-3 border-t pt-3 text-sm sm:grid-cols-3">
                    <div>
                      <p className="text-muted-foreground">未結案缺失</p>
                      <p className="text-lg font-semibold">
                        {risk.moduleStatus.openDefects}
                        <span className="ml-1 text-xs font-normal text-muted-foreground">
                          件（PMIS-07）
                        </span>
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">環安衛待改善</p>
                      <p className="text-lg font-semibold">
                        {risk.moduleStatus.ehsFindings}
                        <span className="ml-1 text-xs font-normal text-muted-foreground">
                          項（PMIS-05）
                        </span>
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">30 日內到期提醒</p>
                      <p className="text-lg font-semibold">
                        {risk.moduleStatus.upcomingReminders}
                        <span className="ml-1 text-xs font-normal text-muted-foreground">
                          項（PMIS-01）
                        </span>
                      </p>
                    </div>
                  </div>

                  <RiskBriefing projectId={selected as string} />
                </>
              )}
            </CardContent>
          </Card>
        )}

        <GisMap
          layers={layers.map((l) => ({
            id: l.id,
            category: l.category,
            title: l.title,
            source: l.source,
            wmtsCode: l.wmtsCode,
            color: l.color,
            opacity: l.opacity,
            isBase: l.isBase,
            isDefault: l.isDefault,
          }))}
          features={mapData.features.map((f) => ({
            id: f.id,
            name: f.name,
            type: f.type,
            geojson: f.geojson,
            color: f.color,
            note: f.note,
            linkModule: f.linkModule,
            linkId: f.linkId,
          }))}
          pins={mapData.pins}
          selectedProjectId={mapData.selectedProjectId}
          canEdit={canEdit}
          linkTargets={linkTargets}
        />
      </div>
    </>
  );
}
