import * as ehsService from "@/service/ehs.service";
import * as projectService from "@/service/project.service";
import { requireUser } from "@/service/auth.service";
import { assertModuleAccess, canEditModule } from "@/service/access.service";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
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
  const perms = await assertModuleAccess(user, "/ehs");
  const canEdit = canEditModule(perms, "/ehs");
  const { project } = await searchParams;
  const projectList = await projectService.listProjects(user);
  const selectedProjectId =
    project && projectList.some((p) => p.id === project) ? project : undefined;
  const audits = await ehsService.listEhsAudits(selectedProjectId);

  return (
    <>
      <PageHeader
        section="04 工程執行與查核"
        title="環安衛管理"
        description="PMIS-05 · 環境、職安衛、交通維持督導與稽核紀錄"
        action={
          <div className="flex items-center gap-2">
            {canEdit && (
              <EhsForm
                projects={projectList.map((p) => ({ id: p.id, name: p.name }))}
              />
            )}
          </div>
        }
      />
      <div className="space-y-6 p-4 sm:p-8">
        {/* Info: (20260721 - Luphia) 稽核清單（卡片式，手機友善） */}
        {audits.length === 0 ? (
          <p className="text-sm text-muted-foreground">尚無稽核紀錄。</p>
        ) : (
          <div className="space-y-3">
            {audits.map((a) => (
              <div key={a.id} className="rounded-lg border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant={ehsTypeMeta[a.type].variant}>
                        {ehsTypeMeta[a.type].label}
                      </Badge>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {formatDate(a.auditedAt)}
                      </span>
                    </div>
                    <p className="text-sm font-medium leading-snug">
                      {a.findings ?? "（未填缺失情形）"}
                    </p>
                  </div>
                  {canEdit && (
                    <div className="shrink-0">
                      <EhsResultSelect id={a.id} result={a.result} />
                    </div>
                  )}
                </div>

                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4">
                  {[
                    ["地點", a.location ?? "—"],
                    ["專案", a.project.name],
                    ["改善期限", formatDate(a.dueDate)],
                    ["稽核人", a.inspector ?? "—"],
                  ].map(([label, value]) => (
                    <div key={label} className="min-w-0">
                      <dt className="text-muted-foreground">{label}</dt>
                      <dd className="truncate">{value}</dd>
                    </div>
                  ))}
                </dl>

                <div className="mt-3 border-t pt-2">
                  <EhsTrack
                    auditId={a.id}
                    attachments={a.attachments}
                    notes={a.notes}
                    canEdit={canEdit}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
