import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import * as ledgerService from "@/service/ledger.service";
import { requireUser } from "@/service/auth.service";
import { assertModuleAccess, canEditModule } from "@/service/access.service";
import { PageHeader } from "@/components/page-header";
import { withProject } from "@/lib/project-link";
import { LedgerView } from "./ledger-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "工項數量與估驗台帳 — PMIS" };

/**
 * 詳細工項數量與估驗台帳。
 *
 * 為何獨立成一頁而非塞進專案頁的分頁 ——
 * 台帳是逐列對帳用的寬表（十一個欄位、常上百列），需要整個工作區的寬度；
 * 且對帳時會反覆切換「價目表／WBS 彙整／差異異常」三種看法，
 * 那是一段獨立的工作，不是專案總覽的一部分。
 */
export default async function LedgerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const perms = await assertModuleAccess(user, "/projects");
  const canEdit = canEditModule(perms, "/projects");
  const { id } = await params;

  const ledger = await ledgerService.getProjectLedger(id, user);
  if (!ledger) notFound();

  return (
    <>
      <PageHeader
        section="02 契約與時程管理"
        title="詳細工項數量與估驗台帳"
        description="工項代碼、單位、契約數量、完成量、查驗量、估驗量及金額完整對照"
        action={
          <Link
            href={withProject(`/projects/${id}`, id)}
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-primary"
          >
            <ArrowLeft className="size-4" />
            回專案
          </Link>
        }
      />
      <div className="@container space-y-5 p-4 sm:p-8">
        <LedgerView ledger={ledger} canEdit={canEdit} />
      </div>
    </>
  );
}
