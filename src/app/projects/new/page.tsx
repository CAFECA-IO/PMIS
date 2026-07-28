import { PageHeader } from "@/components/page-header";
import { ProjectBuild } from "@/components/project-build";
import { requireUser } from "@/service/auth.service";
import { assertModuleAccess } from "@/service/access.service";

export const dynamic = "force-dynamic";
export const metadata = { title: "專案建置 — PMIS" };

/**
 * 專案建置。
 *
 * 刻意做成頁面而非彈窗：費思展開時會從工作區右側分割一欄，
 * 彈窗會與該分欄互相遮擋；頁面則與費思平行共存，兩邊同時可見。
 */
export default async function ProjectNewPage() {
  const user = await requireUser();
  // 建立專案屬於編輯行為，需具備工程專案模組的編輯權限
  await assertModuleAccess(user, "/projects", "EDIT");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        section="02 契約與時程管理"
        title="專案建置"
        description="上傳契約或決標文件，由費思分段判讀並填入；也可直接手動建立"
      />
      <ProjectBuild />
    </div>
  );
}
