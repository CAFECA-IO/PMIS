import * as projectRepo from "@/repository/project.repository";
import * as todoRepo from "@/repository/todo.repository";
import * as submittalRepo from "@/repository/submittal.repository";
import * as defectRepo from "@/repository/defect.repository";
import * as reminderRepo from "@/repository/reminder.repository";
import * as workItemRepo from "@/repository/workItem.repository";
import * as ehsRepo from "@/repository/ehs.repository";
import * as inspectionRepo from "@/repository/inspection.repository";
import * as mediaRepo from "@/repository/media.repository";
import * as milestoneRepo from "@/repository/milestone.repository";

/**
 * Overall KPIs computed from project milestones (整體進度/差距/試運轉就緒度) and
 * inspections (檢驗合格率).
 */
export async function getMetrics(sinceDays: number | null = null) {
  const since = sinceDays
    ? new Date(Date.now() - sinceDays * 86_400_000)
    : undefined;

  const [
    milestones,
    passed,
    conditional,
    failed,
    pending,
    defOpen,
    defInProgress,
    defResolved,
    defClosed,
    subDraft,
    subSubmitted,
    subUnderReview,
    subReturned,
    subApproved,
  ] = await Promise.all([
    milestoneRepo.listForMetrics(),
    inspectionRepo.countByResult("PASSED", since),
    inspectionRepo.countByResult("CONDITIONAL", since),
    inspectionRepo.countByResult("FAILED", since),
    inspectionRepo.countByResult("PENDING", since),
    defectRepo.countByStatus("OPEN", since),
    defectRepo.countByStatus("IN_PROGRESS", since),
    defectRepo.countByStatus("RESOLVED", since),
    defectRepo.countByStatus("CLOSED", since),
    submittalRepo.countByStatus("DRAFT", since),
    submittalRepo.countByStatus("SUBMITTED", since),
    submittalRepo.countByStatus("UNDER_REVIEW", since),
    submittalRepo.countByStatus("RETURNED", since),
    submittalRepo.countByStatus("APPROVED", since),
  ]);

  const now = Date.now();
  const round = (n: number) => Math.round(n * 100) / 100;
  const pct = (part: number, whole: number) =>
    whole > 0 ? round((part / whole) * 100) : 0;

  let totalWeight = 0;
  let actualWeight = 0;
  let plannedWeight = 0;
  let commWeight = 0;
  let commDoneWeight = 0;

  for (const m of milestones) {
    const w = m.weight;
    totalWeight += w;
    if (m.actualDate) actualWeight += w;
    if (m.plannedDate && m.plannedDate.getTime() <= now) plannedWeight += w;
    if (m.commissioning) {
      commWeight += w;
      if (m.actualDate) commDoneWeight += w;
    }
  }

  const overall = pct(actualWeight, totalWeight);
  const planned = pct(plannedWeight, totalWeight);

  const decided = passed + conditional + failed;

  return {
    overallProgress: overall,
    plannedProgress: planned,
    gap: round(overall - planned), // 負值=落後
    inspectionPassRate: pct(passed, decided),
    inspectionPassed: passed,
    inspectionDecided: decided,
    inspectionBreakdown: { passed, conditional, failed, pending },
    defectBreakdown: {
      open: defOpen,
      inProgress: defInProgress,
      resolved: defResolved,
      closed: defClosed,
    },
    submittalBreakdown: {
      draft: subDraft,
      submitted: subSubmitted,
      underReview: subUnderReview,
      returned: subReturned,
      approved: subApproved,
    },
    commissioningReadiness: pct(commDoneWeight, commWeight),
    milestoneTotal: milestones.length,
    rangeDays: sinceDays,
  };
}

export type HealthLevel = "good" | "warn" | "bad";
export type HealthAction = { text: string; href: string };
export type Health = {
  level: HealthLevel;
  headline: string;
  detail: string;
  actions: HealthAction[];
};

/** 依進度差距與待辦/缺失/送審狀況,給出白話狀態與建議行動。 */
export function assessHealth(input: {
  overallProgress: number;
  plannedProgress: number;
  gap: number;
  overdueTodos: number;
  openDefects: number;
  pendingSubmittals: number;
  failedInspections: number;
}): Health {
  const {
    overallProgress,
    plannedProgress,
    gap,
    overdueTodos,
    openDefects,
    pendingSubmittals,
    failedInspections,
  } = input;

  let level: HealthLevel = "good";
  if (gap <= -10) level = "bad";
  else if (gap < 0) level = "warn";
  if (level === "good" && (overdueTodos > 0 || failedInspections > 0)) {
    level = "warn";
  }

  const headline =
    level === "bad"
      ? "進度明顯落後，需即時處理"
      : level === "warn"
        ? "狀態需要注意"
        : "進度正常，狀態良好";

  const gapAbs = Math.abs(gap);
  const detail =
    gap < 0
      ? `實際 ${overallProgress}% 落後預定 ${plannedProgress}%，差距 ${gapAbs}%。`
      : `實際 ${overallProgress}% 已達或超前預定 ${plannedProgress}%（超前 ${gapAbs}%）。`;

  const actions: HealthAction[] = [];
  if (gap < 0) {
    actions.push({
      text: `檢視落後里程碑並排定趕工（差距 ${gapAbs}%）`,
      href: "/projects",
    });
  }
  if (overdueTodos > 0)
    actions.push({ text: `處理 ${overdueTodos} 件逾期待辦`, href: "/todos" });
  if (failedInspections > 0)
    actions.push({
      text: `複驗 ${failedInspections} 件不合格查驗`,
      href: "/quality",
    });
  if (openDefects > 0)
    actions.push({ text: `追蹤 ${openDefects} 件未結案缺失`, href: "/quality" });
  if (pendingSubmittals > 0)
    actions.push({
      text: `跟催 ${pendingSubmittals} 件待審文件`,
      href: "/submittals",
    });
  if (actions.length === 0)
    actions.push({ text: "維持現況，持續追蹤各項指標", href: "/" });

  return { level, headline, detail, actions };
}

export type SCurvePoint = {
  label: string;
  planned: number;
  actual: number | null;
  forecast: number | null;
};

/**
 * Monthly cumulative planned / actual / forecast progress (%), computed from
 * weighted milestones — the S-Curve.
 */
export async function getSCurve(): Promise<SCurvePoint[]> {
  const milestones = await milestoneRepo.listForMetrics();
  const totalWeight = milestones.reduce((s, m) => s + m.weight, 0);
  const withPlanned = milestones.filter((m) => m.plannedDate);
  if (totalWeight === 0 || withPlanned.length === 0) return [];

  const round = (n: number) => Math.round(n * 100) / 100;
  const times = withPlanned.map((m) => m.plannedDate!.getTime());
  const min = new Date(Math.min(...times));
  const max = new Date(Math.max(...times));
  const now = Date.now();

  // monthly buckets from min month to max month
  const buckets: Date[] = [];
  const cursor = new Date(min.getFullYear(), min.getMonth(), 1);
  const end = new Date(max.getFullYear(), max.getMonth(), 1);
  while (cursor <= end) {
    buckets.push(new Date(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }

  // index of the last bucket that has already started (relative to today)
  let currentIndex = 0;
  buckets.forEach((b, i) => {
    if (b.getTime() <= now) currentIndex = i;
  });

  const cutoffOf = (b: Date) =>
    new Date(b.getFullYear(), b.getMonth() + 1, 0, 23, 59, 59).getTime();

  const sumWeight = (pred: (m: (typeof milestones)[number]) => boolean) =>
    milestones.reduce((s, m) => (pred(m) ? s + m.weight : s), 0);

  const points: SCurvePoint[] = buckets.map((b, i) => {
    const cutoff = cutoffOf(b);
    const planned = round(
      (sumWeight((m) => !!m.plannedDate && m.plannedDate.getTime() <= cutoff) /
        totalWeight) *
        100,
    );
    const actual =
      i <= currentIndex
        ? round(
            (sumWeight(
              (m) => !!m.actualDate && m.actualDate.getTime() <= cutoff,
            ) /
              totalWeight) *
              100,
          )
        : null;
    return {
      label: `${b.getFullYear()}/${String(b.getMonth() + 1).padStart(2, "0")}`,
      planned,
      actual,
      forecast: null,
    };
  });

  // forecast: linear from current actual to 100% at the final bucket
  const currentActual = points[currentIndex]?.actual ?? 0;
  const lastIndex = points.length - 1;
  for (let i = currentIndex; i <= lastIndex; i++) {
    if (i === currentIndex) {
      points[i].forecast = currentActual;
    } else if (lastIndex > currentIndex) {
      points[i].forecast = round(
        currentActual +
          ((100 - currentActual) * (i - currentIndex)) /
            (lastIndex - currentIndex),
      );
    }
  }

  return points;
}

/**
 * Aggregates the figures shown on the dashboard. Business logic (what counts as
 * "pending", how many items to preview) lives here, not in the page.
 */
export async function getDashboard() {
  const [
    projectCount,
    activeProjects,
    overdueTodos,
    pendingSubmittals,
    openDefects,
    upcomingReminders,
    latestDefects,
    reminderCount,
    todoCount,
    workItemCount,
    ehsCount,
    submittalCount,
    inspectionCount,
    mediaCount,
  ] = await Promise.all([
    projectRepo.count(),
    projectRepo.countByStatus("ACTIVE"),
    todoRepo.countOverdue(),
    submittalRepo.countPending(),
    defectRepo.countOpen(),
    reminderRepo.listUpcoming(6),
    defectRepo.listOpenLatest(5),
    reminderRepo.count(),
    todoRepo.count(),
    workItemRepo.count(),
    ehsRepo.count(),
    submittalRepo.count(),
    inspectionRepo.count(),
    mediaRepo.countAssets(),
  ]);

  return {
    stats: { projectCount, activeProjects, overdueTodos, pendingSubmittals, openDefects },
    upcomingReminders,
    latestDefects,
    moduleCounts: {
      reminder: reminderCount,
      todo: todoCount,
      project: projectCount,
      workItem: workItemCount,
      ehs: ehsCount,
      submittal: submittalCount,
      inspection: inspectionCount,
      media: mediaCount,
    },
  };
}
