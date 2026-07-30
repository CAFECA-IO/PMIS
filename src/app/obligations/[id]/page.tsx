import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import * as obligationService from "@/service/obligation.service";
import { requireUser } from "@/service/auth.service";
import { assertModuleAccess, canEditModule } from "@/service/access.service";
import { PageHeader } from "@/components/page-header";
import { withProject } from "@/lib/project-link";
import { ObligationDetail } from "./obligation-detail";

export const dynamic = "force-dynamic";

/**
 * 履約事項細節（PMIS-15）。
 *
 * 一項履約事項是「契約要求做到的一件事」，而歸屬它的工程分項是
 * 「為了做到它而實際執行的工作」。這一頁把兩者放在同一個畫面，
 * 因為完成與否的判斷需要同時看到兩邊：契約怎麼要求、工作做到哪裡。
 */
export default async function ObligationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ project?: string }>;
}) {
  const user = await requireUser();
  const perms = await assertModuleAccess(user, "/obligations");
  const canEdit = canEditModule(perms, "/obligations");
  const { id } = await params;
  const { project } = await searchParams;

  // 不存在與無權存取一律回 404：分開回報會讓外人能以 id 試探哪些事項存在
  const detail = await obligationService.getObligation(id, user);
  if (!detail) notFound();

  // 回列表時保留目前專案；未帶參數時退回該事項所屬的專案
  const backHref = withProject("/obligations", project ?? detail.projectId);

  return (
    <>
      <PageHeader
        section="02 契約與時程管理"
        title={detail.title}
        description={`${detail.projectName}（${detail.projectCode}）· 管制編號 ${detail.code}`}
        action={
          <Link
            href={backHref}
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-primary"
          >
            <ArrowLeft className="size-4" />
            回履約事項
          </Link>
        }
      />
      <div className="@container space-y-5 p-4 sm:p-8">
        <ObligationDetail detail={detail} canEdit={canEdit} />
      </div>
    </>
  );
}
