import { Sparkles } from "lucide-react";

import * as ehsService from "@/service/ehs.service";
import * as projectService from "@/service/project.service";
import { requireUser } from "@/service/auth.service";
import { PageHeader } from "@/components/page-header";
import { ProjectSwitcher } from "@/components/project-switcher";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ImageAnalyzer } from "./image-analyzer";
import { ehsTypeMeta } from "@/constant/pmis";
import { formatDate } from "@/lib/utils";
import { EhsForm } from "./ehs-form";
import { EhsResultSelect } from "./ehs-result-select";
import { EhsTrack } from "./ehs-track";

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
      <div className="space-y-6 p-4 sm:p-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">新增稽核紀錄</CardTitle>
          </CardHeader>
          <CardContent>
            <EhsForm
              projects={projectList.map((p) => ({ id: p.id, name: p.name }))}
            />
          </CardContent>
        </Card>

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

        {/* Info: (20260721 - Luphia) 稽核清單（卡片式，手機友善） */}
        {audits.length === 0 ? (
          <p className="text-sm text-muted-foreground">尚無稽核紀錄。</p>
        ) : (
          <div className="space-y-3">
            {audits.map((a) => (
              <div key={a.id} className="space-y-2 rounded-lg border bg-card p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={ehsTypeMeta[a.type].variant}>
                        {ehsTypeMeta[a.type].label}
                      </Badge>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {formatDate(a.auditedAt)}
                      </span>
                      {a.location ? (
                        <span className="text-xs text-muted-foreground">
                          · {a.location}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1 text-sm">{a.findings ?? "—"}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {a.project.name} · 改善期限 {formatDate(a.dueDate)}
                    </div>
                  </div>
                  <EhsResultSelect id={a.id} result={a.result} />
                </div>
                <EhsTrack
                  auditId={a.id}
                  attachments={a.attachments}
                  notes={a.notes}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
