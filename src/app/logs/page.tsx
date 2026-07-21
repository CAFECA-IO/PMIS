import * as projectService from "@/service/project.service";
import { requireUser } from "@/service/auth.service";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { ProjectSwitcher } from "@/components/project-switcher";
import { ReportGenerator } from "./report-generator";

export const dynamic = "force-dynamic";
export const metadata = { title: "工程日誌 — PMIS" };

export default async function LogsPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  const user = await requireUser();
  const { project } = await searchParams;
  const projectList = await projectService.listProjects(user);

  if (projectList.length === 0) {
    return (
      <>
        <PageHeader title="工程日誌" description="AI 自動生成之工程報告（PMIS-10）" />
        <div className="p-8">
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">
              目前沒有可檢視的專案。
            </CardContent>
          </Card>
        </div>
      </>
    );
  }

  const selected =
    (project && projectList.find((p) => p.id === project)) || projectList[0];

  return (
    <>
      <PageHeader
        title="工程日誌"
        description="由費思 AI 依系統紀錄自動生成之日／週／月／季／年報（PMIS-10）"
        action={
          <ProjectSwitcher
            projects={projectList.map((p) => ({ id: p.id, name: p.name }))}
            selected={selected.id}
          />
        }
      />
      <div className="p-8">
        <ReportGenerator projectId={selected.id} projectName={selected.name} />
      </div>
    </>
  );
}
