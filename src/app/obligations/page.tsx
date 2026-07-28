import {
  CircleDashed,
  Clock,
  Hourglass,
  AlarmClock,
  CheckCircle2,
  type LucideIcon,
} from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import * as obligationService from "@/service/obligation.service";
import * as projectService from "@/service/project.service";
import { requireUser } from "@/service/auth.service";
import { assertModuleAccess, currentUserCanEdit } from "@/service/access.service";
import { cn } from "@/lib/utils";
import type { ObligationStats } from "@/service/obligation-view";
import { ObligationFilterBar } from "./filter-bar";
import { ObligationTable } from "./obligation-table";

export const dynamic = "force-dynamic";
export const metadata = { title: "履約事項 — PMIS" };

/**
 * 統計卡：對應 status 欄位的分群。
 * 數字一律中性，只有「逾期」在大於 0 時轉為警示色 —— 讓畫面上唯一的紅
 * 就是真正需要處理的事，其餘靠字級與位置區分主次。
 */
const STATS: {
  key: keyof ObligationStats;
  label: string;
  icon: LucideIcon;
  /** 為 true 時，數字大於 0 才以警示色呈現。 */
  alert?: boolean;
  status: string;
}[] = [
  { key: "notStarted", label: "未起算", icon: CircleDashed, status: "NOT_STARTED" },
  { key: "inProgress", label: "辦理中", icon: Clock, status: "IN_PROGRESS" },
  {
    key: "pendingExternal",
    label: "待外部",
    icon: Hourglass,
    status: "PENDING_EXTERNAL",
  },
  {
    key: "overdue",
    label: "逾期",
    icon: AlarmClock,
    alert: true,
    status: "OVERDUE",
  },
  {
    key: "doneThisMonth",
    label: "本月完成",
    icon: CheckCircle2,
    status: "DONE",
  },
];

export default async function ObligationsPage({
  searchParams,
}: {
  searchParams: Promise<{
    project?: string;
    q?: string;
    stage?: string;
    risk?: string;
    status?: string;
  }>;
}) {
  const user = await requireUser();
  await assertModuleAccess(user, "/obligations");
  const { project, q, stage, risk, status } = await searchParams;

  const [result, projects, canEdit] = await Promise.all([
    obligationService.listObligations(user, project, {
      keyword: q,
      stage,
      risk,
      status,
    }),
    projectService.listProjectOptions(user),
    currentUserCanEdit("/obligations"),
  ]);

  return (
    <>
      <PageHeader
        section="02 契約與時程管理"
        title="履約事項"
        description="以管制編號追蹤契約應辦事項的階段、風險、責任分工與期限"
      />
      {/*
        以 container query 決定分欄：費思展開成右側分欄後工作區會變窄，
        依「實際可用寬度」而非視窗寬度反應，表格才不會被壓到不可用。
      */}
      <div className="@container space-y-5 p-8">
        {/* 統計卡：母數為篩選前的全體，點擊帶入狀態篩選 */}
        <div className="grid grid-cols-2 gap-3 @[720px]:grid-cols-3 @[1080px]:grid-cols-5">
          {STATS.map((s) => {
            const count = result.stats[s.key];
            const on = status === s.status;
            const alarming = s.alert && count > 0;
            return (
              <Card
                key={s.key}
                className={cn(
                  "transition-colors",
                  on && "border-primary",
                  count === 0 && "opacity-70",
                )}
              >
                <CardContent className="flex items-center justify-between p-4">
                  <div>
                    <div className="text-xs text-muted-foreground">
                      {s.label}
                    </div>
                    <div
                      className={cn(
                        "mt-0.5 text-2xl font-semibold tabular-nums",
                        alarming
                          ? "text-destructive"
                          : count > 0
                            ? "text-foreground"
                            : "text-muted-foreground",
                      )}
                    >
                      {count}
                    </div>
                  </div>
                  <s.icon
                    className={cn(
                      "size-5",
                      alarming ? "text-destructive" : "text-muted-foreground/40",
                    )}
                  />
                </CardContent>
              </Card>
            );
          })}
        </div>

        <ObligationFilterBar
          projects={projects.map((p) => ({ id: p.id, name: p.name }))}
          initial={{
            project: project ?? "all",
            q: q ?? "",
            stage: stage ?? "all",
            risk: risk ?? "all",
            status: status ?? "all",
          }}
        />

        <ObligationTable
          rows={result.rows}
          total={result.total}
          canEdit={canEdit}
          showProject={!project || project === "all"}
        />
      </div>
    </>
  );
}
