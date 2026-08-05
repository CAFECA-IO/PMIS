import { redirect } from "next/navigation";

import { requireUser } from "@/service/auth.service";
import * as projectService from "@/service/project.service";
import * as designService from "@/service/designVersion.service";
import { PageHeader } from "@/components/page-header";
import { Engineering3D, type ProjectMeta } from "@/components/engineering-3d";

export const dynamic = "force-dynamic";

const iso = (d: Date | null | undefined): string | null =>
  d ? new Date(d).toISOString().slice(0, 10) : null;

export default async function Overview3DPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  const { project: locked } = await searchParams;
  const user = await requireUser();

  const projects = await projectService.listProjects(user);
  // 不提供選擇器：沿用 App 全站「目前鎖定專案」（?project=）；未鎖定時取第一件
  const current = projects.find((p) => p.id === locked) ?? projects[0] ?? null;

  // 網址一律帶上目前專案 —— 費思對話由 ?project= 判定要讀哪一件，
  // 缺參數時導向補上，之後由側邊欄切換專案即可換案。
  if (current && locked !== current.id) {
    redirect(`/overview-3d?project=${current.id}`);
  }

  const full = current ? await projectService.getProject(current.id, user) : null;

  const meta: ProjectMeta | null = full
    ? {
        id: full.id,
        code: full.code,
        name: full.name,
        location: full.location ?? null,
        contractor: full.contractor ?? null,
        budget: full.budget != null ? Number(full.budget) : null,
        status: full.status,
        startDate: iso(full.startDate),
        endDate: iso(full.endDate),
        existingWorkItemCount: full.workItems.length,
      }
    : null;

  return (
    <>
      <PageHeader
        section="01 總覽與決策"
        title="3D 工程視覺"
        description="由費思讀取目前鎖定的專案資訊，於對話中分步驟從零生成施工流程 3D 動畫；經對話微調後定案，交付專案建置流程建立工程分項"
      />

      {meta ? (
        /*
          key 綁專案 id：切換專案時強制重新掛載。
          此路由只有查詢字串在變，React 會沿用同一個元件實例，
          於是版本清單、目前版本與動畫 HTML 這些 state 會留著上一件專案的內容
          —— 畫面就會出現「已切換專案，動畫還是舊的」。
        */
        <Engineering3D
          key={meta.id}
          project={meta}
          versions={await designService.listVersions(meta.id, {
            id: user.id,
            role: user.role,
          })}
        />
      ) : (
        <div className="m-4 rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground sm:m-6">
          尚無可用專案。請先於「工程專案」建立專案，或於左上角選擇目前專案。
        </div>
      )}
    </>
  );
}
