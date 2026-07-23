import * as projectService from "@/service/project.service";
import { requireUser } from "@/service/auth.service";
import { assertModuleAccess } from "@/service/access.service";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { ProjectSwitcher } from "@/components/project-switcher";
import { MonitoringBoard } from "./monitoring-board";

export const dynamic = "force-dynamic";
export const metadata = { title: "智能監測 — PMIS" };

export default async function MonitoringPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  const user = await requireUser();
  await assertModuleAccess(user, "/monitoring");
  const { project } = await searchParams;
  const projectList = await projectService.listProjects(user);
  const selected =
    project && projectList.some((p) => p.id === project)
      ? projectList.find((p) => p.id === project)
      : undefined;

  return (
    <>
      <PageHeader
        title="智能監測"
        description="AIoT 感測與攝影機影像即時監測、事件標注與時間軸回溯（PMIS-09）"
        action={
          <div className="flex items-center gap-2">
            <Badge variant="warning">模擬展示</Badge>
            <ProjectSwitcher
              projects={projectList.map((p) => ({ id: p.id, name: p.name }))}
              selected={selected?.id}
            />
          </div>
        }
      />
      <div className="p-8">
        <MonitoringBoard
          key={selected?.id ?? "all"}
          projectName={selected?.name ?? "全部工區"}
        />
      </div>
    </>
  );
}
