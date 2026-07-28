import Link from "next/link";
import {
  AlarmClock,
  BellRing,
  CalendarClock,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { CalendarView } from "@/components/calendar-view";
import * as calendarService from "@/service/calendar.service";
import * as alertService from "@/service/alert.service";
import * as projectService from "@/service/project.service";
import { requireUser } from "@/service/auth.service";
import { assertModuleAccess, currentUserCanEdit } from "@/service/access.service";
import { cn } from "@/lib/utils";
import type { AlertHit } from "@/service/alert-rule";
import { AlertHits } from "./alert-hits";
import { AlertRules } from "./alert-rules";

export const dynamic = "force-dynamic";
export const metadata = { title: "行事曆與預警 — PMIS" };

const TABS = [
  { key: "overview", label: "行事曆與預警" },
  { key: "rules", label: "預警規則" },
] as const;

/** 摘要卡定義：filter 對應 ?focus= 參數，用於篩選右側預警清單。 */
const STATS: {
  key: string;
  label: string;
  icon: LucideIcon;
  tone: string;
  match: (h: AlertHit) => boolean;
}[] = [
  {
    key: "critical",
    label: "嚴重預警",
    icon: BellRing,
    tone: "text-destructive",
    match: (h) => h.severity === "CRITICAL",
  },
  {
    key: "overdue",
    label: "已逾期",
    icon: AlarmClock,
    tone: "text-destructive",
    match: (h) => h.overdue,
  },
  {
    key: "week",
    label: "本週到期",
    icon: CalendarClock,
    tone: "text-warning",
    match: (h) => h.daysUntil != null && h.daysUntil >= 0 && h.daysUntil <= 7,
  },
];

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; project?: string; focus?: string }>;
}) {
  const user = await requireUser();
  await assertModuleAccess(user, "/calendar");
  const { tab, project, focus } = await searchParams;
  const active = TABS.find((t) => t.key === tab) ?? TABS[0];

  const [events, overview, rules, projects, canEdit] = await Promise.all([
    calendarService.listCalendarEvents(),
    alertService.evaluateForViewer(user, project),
    alertService.listRules(),
    projectService.listProjectOptions(user),
    currentUserCanEdit("/calendar"),
  ]);
  const todayISO = new Date().toISOString();

  const focused = STATS.find((s) => s.key === focus);
  const shownHits = focused
    ? overview.hits.filter(focused.match)
    : overview.hits;

  const href = (next: { tab?: string; focus?: string | null }) => {
    const sp = new URLSearchParams();
    const t = next.tab ?? active.key;
    if (t !== "overview") sp.set("tab", t);
    if (project) sp.set("project", project);
    const f = next.focus === undefined ? focus : next.focus;
    if (f) sp.set("focus", f);
    const qs = sp.toString();
    return qs ? `/calendar?${qs}` : "/calendar";
  };

  return (
    <>
      <PageHeader
        section="02 契約與時程管理"
        title="行事曆與預警"
        description="以週/月/季/年檢視履約、送審、查核與改善期限，並依預警規則主動提示"
      />
      {/*
        以 container query 取代 viewport 斷點：費思分欄展開後工作區會變窄，
        若仍依視窗寬度決定分欄，行事曆會被壓到不可用。@container 讓下方版面
        依「實際可用寬度」反應。
      */}
      <div className="@container space-y-5 p-8">
        {/* 狀態摘要：進站第一眼看到「現在有什麼要處理」，可點擊篩選 */}
        <div className="grid grid-cols-2 gap-3 @[720px]:grid-cols-4">
          {STATS.map((s) => {
            const count = overview.hits.filter(s.match).length;
            const on = focus === s.key;
            return (
              <Link key={s.key} href={href({ tab: "overview", focus: on ? null : s.key })}>
                <Card
                  className={cn(
                    "transition-colors hover:border-primary/50",
                    on && "border-primary bg-primary/5",
                    count === 0 && "opacity-60",
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
                          count > 0 ? s.tone : "text-muted-foreground",
                        )}
                      >
                        {count}
                      </div>
                    </div>
                    <s.icon
                      className={cn(
                        "size-5",
                        count > 0 ? s.tone : "text-muted-foreground/50",
                      )}
                    />
                  </CardContent>
                </Card>
              </Link>
            );
          })}

          <Link href={href({ tab: "rules", focus: null })}>
            <Card className="transition-colors hover:border-primary/50">
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <div className="text-xs text-muted-foreground">啟用規則</div>
                  <div className="mt-0.5 text-2xl font-semibold tabular-nums">
                    {overview.enabledCount}
                    <span className="ml-1 text-sm font-normal text-muted-foreground">
                      / {overview.ruleCount}
                    </span>
                  </div>
                </div>
                <ShieldCheck className="size-5 text-muted-foreground/70" />
              </CardContent>
            </Card>
          </Link>
        </div>

        <div className="inline-flex rounded-md border bg-card p-0.5">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={href({ tab: t.key, focus: null })}
              className={cn(
                "rounded px-3 py-1 text-sm font-medium transition-colors",
                active.key === t.key
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </Link>
          ))}
        </div>

        {/* 行事曆與目前預警並置：排程與待處理事項同屏可見 */}
        {active.key === "overview" ? (
          <div className="grid gap-4 @[880px]:grid-cols-[minmax(0,1fr)_360px]">
            <Card>
              <CardContent className="p-5">
                <CalendarView events={events} todayISO={todayISO} />
              </CardContent>
            </Card>

            <aside className="min-w-0">
              <div className="sticky top-4 space-y-2">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold">
                    目前預警
                    <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                      {shownHits.length} 項
                    </span>
                  </h2>
                  {focused ? (
                    <Link
                      href={href({ focus: null })}
                      className="text-xs text-primary hover:underline"
                    >
                      清除篩選（{focused.label}）
                    </Link>
                  ) : null}
                </div>
                <div className="max-h-[calc(100vh-16rem)] overflow-y-auto pr-1">
                  <AlertHits hits={shownHits} />
                </div>
              </div>
            </aside>
          </div>
        ) : (
          <AlertRules
            rules={rules}
            projects={projects.map((p) => ({ id: p.id, name: p.name }))}
            canEdit={canEdit}
          />
        )}
      </div>
    </>
  );
}
