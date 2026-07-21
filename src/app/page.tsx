import Link from "next/link";
import {
  FolderKanban,
  ListTodo,
  FileCheck,
  TriangleAlert,
  CalendarClock,
  FileText,
  Activity,
  ShieldCheck,
  ClipboardCheck,
  FolderArchive,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";

import * as dashboardService from "@/service/dashboard.service";
import * as projectService from "@/service/project.service";
import { requireUser } from "@/service/auth.service";
import { PageHeader } from "@/components/page-header";
import { SCurveChart } from "@/components/s-curve-chart";
import { RadialGauge, StatRows, ProgressWithTarget } from "@/components/charts";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { projectStatusMeta } from "@/constant/pmis";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  reminderCategoryMeta,
  reminderStatusMeta,
  defectSeverityMeta,
  defectStatusMeta,
} from "@/constant/pmis";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

const RANGES = [
  { key: "30", label: "近 30 天", days: 30 },
  { key: "90", label: "近 90 天", days: 90 },
  { key: "all", label: "全部", days: null },
] as const;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const { range } = await searchParams;
  const activeRange = RANGES.find((r) => r.key === range) ?? RANGES[2];
  const rangeLabel = activeRange.label;

  const user = await requireUser();

  const [
    { stats, upcomingReminders, latestDefects, moduleCounts },
    metrics,
    sCurve,
    projects,
  ] = await Promise.all([
    dashboardService.getDashboard(),
    dashboardService.getMetrics(activeRange.days),
    dashboardService.getSCurve(),
    projectService.listProjects(user),
  ]);

  const behind = metrics.gap < 0;

  const health = dashboardService.assessHealth({
    overallProgress: metrics.overallProgress,
    plannedProgress: metrics.plannedProgress,
    gap: metrics.gap,
    overdueTodos: stats.overdueTodos,
    openDefects: stats.openDefects,
    pendingSubmittals: stats.pendingSubmittals,
    failedInspections: metrics.inspectionBreakdown.failed,
  });

  const healthStyle = {
    good: {
      className: "border-emerald-500/40 bg-emerald-500/5",
      text: "text-emerald-600",
      Icon: CheckCircle2,
    },
    warn: {
      className: "border-amber-500/50 bg-amber-500/5",
      text: "text-amber-600",
      Icon: AlertTriangle,
    },
    bad: {
      className: "border-destructive/50 bg-destructive/5",
      text: "text-destructive",
      Icon: AlertCircle,
    },
  }[health.level];

  const statCards = [
    { label: "工程專案", value: stats.projectCount, hint: `${stats.activeProjects} 件施工中`, icon: FolderKanban },
    { label: "逾期待辦", value: stats.overdueTodos, hint: "需即刻處理", icon: ListTodo },
    { label: "送審待處理", value: stats.pendingSubmittals, hint: "審查中 / 退件", icon: FileCheck },
    { label: "未結案缺失", value: stats.openDefects, hint: "待處理 / 處理中", icon: TriangleAlert },
  ];

  const modules: {
    href: string;
    code: string;
    label: string;
    count: number;
    icon: LucideIcon;
  }[] = [
    { href: "/calendar", code: "PMIS-01", label: "行事曆預警", count: moduleCounts.reminder, icon: CalendarClock },
    { href: "/todos", code: "PMIS-02", label: "待辦追蹤", count: moduleCounts.todo, icon: ListTodo },
    { href: "/projects", code: "PMIS-03", label: "工程專案", count: moduleCounts.project, icon: FileText },
    { href: "/schedule", code: "PMIS-04", label: "時程進度", count: moduleCounts.workItem, icon: Activity },
    { href: "/ehs", code: "PMIS-05", label: "環安衛管理", count: moduleCounts.ehs, icon: ShieldCheck },
    { href: "/submittals", code: "PMIS-06", label: "簽核管理", count: moduleCounts.submittal, icon: FileCheck },
    { href: "/quality", code: "PMIS-07", label: "品質稽核", count: moduleCounts.inspection, icon: ClipboardCheck },
    { href: "/documents", code: "PMIS-08", label: "資料庫", count: moduleCounts.media, icon: FolderArchive },
  ];

  return (
    <>
      <PageHeader title="儀表板" description="工程監造整體概況與預警" />
      <div className="space-y-8 p-8">
        {/* 全案累計（不受資料範圍影響） */}
        <section className="space-y-4">
          <h2 className="text-sm font-medium text-muted-foreground">
            全案累計進度（依里程碑）
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card>
              <CardContent className="flex items-center gap-4 p-5">
                <RadialGauge value={metrics.overallProgress} />
                <div>
                  <div className="text-sm text-muted-foreground">整體進度</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    預定 {metrics.plannedProgress}%
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="flex items-center gap-4 p-5">
                <div
                  className={
                    "flex size-[104px] shrink-0 flex-col items-center justify-center rounded-full " +
                    (behind
                      ? "bg-destructive/10 text-destructive"
                      : "bg-emerald-500/10 text-emerald-600")
                  }
                >
                  {behind ? (
                    <TrendingDown className="size-6" />
                  ) : (
                    <TrendingUp className="size-6" />
                  )}
                  <span className="mt-1 text-xl font-semibold tabular-nums">
                    {Math.abs(metrics.gap)}%
                  </span>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">
                    與預定目標差距
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {behind ? "落後" : "超前"}（實際 {metrics.overallProgress}%）
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="flex items-center gap-4 p-5">
                <RadialGauge
                  value={metrics.commissioningReadiness}
                  color="#f59e0b"
                />
                <div>
                  <div className="text-sm text-muted-foreground">
                    試運轉就緒度
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    以里程碑試運轉項目計算
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">專案進度 S-Curve</CardTitle>
              </CardHeader>
              <CardContent>
                <SCurveChart points={sCurve} />
              </CardContent>
            </Card>

            <Card className={healthStyle.className}>
              <CardContent className="space-y-3 p-5">
                <div className={"flex items-center gap-2 " + healthStyle.text}>
                  <healthStyle.Icon className="size-5" />
                  <span className="font-semibold">{health.headline}</span>
                </div>
                <p className="text-sm text-muted-foreground">{health.detail}</p>
                <div>
                  <div className="mb-1.5 text-xs font-medium text-muted-foreground">
                    建議行動
                  </div>
                  <ul className="space-y-1.5">
                    {health.actions.map((a) => (
                      <li key={a.text}>
                        <Link
                          href={a.href}
                          className="flex items-start gap-1.5 text-sm hover:text-primary"
                        >
                          <ArrowRight className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                          <span>{a.text}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-base">專案進度概況</CardTitle>
              <Link
                href="/projects"
                className="text-sm font-medium text-primary hover:underline"
              >
                前往工程專案 →
              </Link>
            </CardHeader>
            <CardContent>
              {projects.length === 0 ? (
                <p className="text-sm text-muted-foreground">尚無專案。</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>專案</TableHead>
                      <TableHead>狀態</TableHead>
                      <TableHead className="w-56">
                        進度（｜為預定位置）
                      </TableHead>
                      <TableHead className="text-right">實際/預定</TableHead>
                      <TableHead className="text-right">落差</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {projects.map((p) => {
                      const g = p.progress.gap;
                      return (
                        <TableRow key={p.id}>
                          <TableCell className="font-medium">
                            <Link
                              href={`/projects/${p.id}`}
                              className="text-primary hover:underline"
                            >
                              {p.name}
                            </Link>
                          </TableCell>
                          <TableCell>
                            <Badge variant={projectStatusMeta[p.status].variant}>
                              {projectStatusMeta[p.status].label}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <ProgressWithTarget
                              actual={p.progress.overall}
                              planned={p.progress.planned}
                            />
                          </TableCell>
                          <TableCell className="text-right text-xs tabular-nums text-muted-foreground">
                            {p.progress.overall}% / {p.progress.planned}%
                          </TableCell>
                          <TableCell className="text-right">
                            {g < 0 ? (
                              <Badge variant="destructive">
                                落後 {Math.abs(g)}%
                              </Badge>
                            ) : g > 0 ? (
                              <Badge variant="success">超前 {g}%</Badge>
                            ) : (
                              <Badge variant="muted">準時</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </section>

        {/* 依資料範圍變動的區塊（虛線框 + 底色標示影響範圍） */}
        <section className="space-y-4 rounded-xl border-2 border-dashed border-primary/40 bg-primary/[0.04] p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <CalendarClock className="size-4 text-primary" />
                品質・缺失・送審統計
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                此框內數據會依右側資料範圍變動（目前：{rangeLabel}）
              </p>
            </div>
            <div className="inline-flex rounded-md border bg-card p-0.5">
              {RANGES.map((r) => (
                <Link
                  key={r.key}
                  href={r.key === "all" ? "/" : `/?range=${r.key}`}
                  className={
                    "rounded px-3 py-1 text-sm font-medium transition-colors " +
                    (activeRange.key === r.key
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground")
                  }
                >
                  {r.label}
                </Link>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-x-8 gap-y-6 rounded-lg border bg-card p-5 sm:grid-cols-3">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <RadialGauge
                  value={metrics.inspectionPassRate}
                  color="#16a34a"
                  size={72}
                  stroke={7}
                />
                <div>
                  <div className="text-sm font-medium">檢驗合格率</div>
                  <div className="text-xs text-muted-foreground">
                    合格 {metrics.inspectionPassed} / {metrics.inspectionDecided}{" "}
                    批
                  </div>
                </div>
              </div>
              <StatRows
                items={[
                  { label: "合格", value: metrics.inspectionBreakdown.passed, color: "#16a34a" },
                  { label: "有條件通過", value: metrics.inspectionBreakdown.conditional, color: "#f59e0b" },
                  { label: "不合格", value: metrics.inspectionBreakdown.failed, color: "#dc2626" },
                  { label: "待查驗", value: metrics.inspectionBreakdown.pending, color: "#a1a1aa" },
                ]}
              />
            </div>

            <div className="space-y-3">
              <div className="text-sm font-medium">缺失狀態</div>
              <StatRows
                items={[
                  { label: "待處理", value: metrics.defectBreakdown.open, color: "#dc2626" },
                  { label: "處理中", value: metrics.defectBreakdown.inProgress, color: "#f59e0b" },
                  { label: "已改善", value: metrics.defectBreakdown.resolved, color: "#16a34a" },
                  { label: "結案", value: metrics.defectBreakdown.closed, color: "#a1a1aa" },
                ]}
              />
            </div>

            <div className="space-y-3">
              <div className="text-sm font-medium">送審狀態</div>
              <StatRows
                items={[
                  { label: "草稿", value: metrics.submittalBreakdown.draft, color: "#a1a1aa" },
                  { label: "已送審", value: metrics.submittalBreakdown.submitted, color: "#2563eb" },
                  { label: "審查中", value: metrics.submittalBreakdown.underReview, color: "#f59e0b" },
                  { label: "退件", value: metrics.submittalBreakdown.returned, color: "#dc2626" },
                  { label: "審查通過", value: metrics.submittalBreakdown.approved, color: "#16a34a" },
                ]}
              />
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {statCards.map(({ label, value, hint, icon: Icon }) => (
            <Card key={label}>
              <CardContent className="flex items-center justify-between p-5">
                <div>
                  <div className="text-sm text-muted-foreground">{label}</div>
                  <div className="mt-1 text-3xl font-semibold">{value}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
                </div>
                <div className="flex size-11 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                  <Icon className="size-5" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">近期預警（行事曆）</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {upcomingReminders.length === 0 ? (
                <p className="text-sm text-muted-foreground">目前沒有待處理提醒。</p>
              ) : (
                upcomingReminders.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between gap-3 border-b pb-3 last:border-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Badge variant={reminderCategoryMeta[r.category].variant}>
                          {reminderCategoryMeta[r.category].label}
                        </Badge>
                        <span className="truncate text-sm font-medium">
                          {r.title}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {r.project.name} · {formatDate(r.dueDate)}
                      </div>
                    </div>
                    <Badge variant={reminderStatusMeta[r.status].variant}>
                      {reminderStatusMeta[r.status].label}
                    </Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">待處理缺失</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {latestDefects.length === 0 ? (
                <p className="text-sm text-muted-foreground">目前沒有未結案缺失。</p>
              ) : (
                latestDefects.map((defect) => (
                  <div
                    key={defect.id}
                    className="flex items-center justify-between gap-3 border-b pb-3 last:border-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">
                        {defect.title}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {defect.project.name}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Badge variant={defectSeverityMeta[defect.severity].variant}>
                        {defectSeverityMeta[defect.severity].label}
                      </Badge>
                      <Badge variant={defectStatusMeta[defect.status].variant}>
                        {defectStatusMeta[defect.status].label}
                      </Badge>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        <div>
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">
            功能模組
          </h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {modules.map(({ href, code, label, count, icon: Icon }) => (
              <Link key={href} href={href}>
                <Card className="transition-colors hover:border-primary/50 hover:bg-accent/40">
                  <CardContent className="flex items-center gap-3 p-4">
                    <div className="flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                      <Icon className="size-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[10px] tabular-nums text-muted-foreground">
                        {code}
                      </div>
                      <div className="truncate text-sm font-medium">{label}</div>
                    </div>
                    <div className="ml-auto text-lg font-semibold tabular-nums">
                      {count}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
