import * as focusRepo from "@/repository/screenFocus.repository";
import * as projectService from "@/service/project.service";
import { canSeeAllProjects } from "@/lib/auth";
import type { Viewer } from "@/service/project.service";

export type ScreenFocus = { label: string; facts: string[] };

const MODULE_LABELS: Record<string, string> = {
  "/": "儀表板",
  "/calendar": "行事曆預警",
  "/todos": "待辦追蹤",
  "/projects": "工程專案",
  "/schedule": "時程進度",
  "/ehs": "環安衛管理",
  "/submittals": "簽核管理",
  "/quality": "品質稽核",
  "/documents": "資料庫",
  "/people": "人員管理",
  "/docs": "功能說明",
};

const round = (n: number) => Math.round(n * 100) / 100;
const pct = (part: number, whole: number) =>
  whole > 0 ? round((part / whole) * 100) : 0;

function milestoneMetrics(
  rows: {
    weight: number;
    plannedDate: Date | null;
    actualDate: Date | null;
    commissioning: boolean;
  }[],
) {
  const now = Date.now();
  let total = 0;
  let actual = 0;
  let planned = 0;
  let comm = 0;
  let commDone = 0;
  for (const m of rows) {
    total += m.weight;
    if (m.actualDate) actual += m.weight;
    if (m.plannedDate && m.plannedDate.getTime() <= now) planned += m.weight;
    if (m.commissioning) {
      comm += m.weight;
      if (m.actualDate) commDone += m.weight;
    }
  }
  const overall = pct(actual, total);
  const plannedPct = pct(planned, total);
  return {
    overall,
    gap: round(overall - plannedPct),
    commissioning: pct(commDone, comm),
  };
}

/** Key data points for the screen the user just navigated to (scoped to the
 * viewer's accessible projects; ADMIN/MANAGER see all active projects). */
export async function getScreenFocus(
  route: string,
  viewer: Viewer,
): Promise<ScreenFocus> {
  // Single project detail: /projects/<id>
  const detail = /^\/projects\/([^/]+)$/.exec(route);
  if (detail && detail[1] !== "new") {
    const project = await projectService.getProject(detail[1], viewer);
    if (!project) return { label: "工程專案", facts: [] };
    const o = projectService.computeProjectOverview(project);
    const facts: string[] = [];
    facts.push(
      o.progress.gap < 0
        ? `進度落後 ${Math.abs(o.progress.gap)}%`
        : `進度 ${o.progress.overall}%（符合預定）`,
    );
    if (o.overdueCount > 0) facts.push(`${o.overdueCount} 件逾期缺失待改善`);
    if (o.pendingInspectionCount > 0)
      facts.push(`${o.pendingInspectionCount} 件待查驗`);
    if (o.pendingPaymentCount > 0)
      facts.push(`${o.pendingPaymentCount} 個待付款節點`);
    return { label: `專案：${project.name}`, facts };
  }

  const label = MODULE_LABELS[route] ?? "PMIS";
  const seeAll = canSeeAllProjects(viewer.role);
  const ids = await focusRepo.accessibleProjectIds(seeAll, viewer.id);

  switch (route) {
    case "/": {
      const [openDefects, overdueTodos, pendingSubmittals, failed, milestones] =
        await Promise.all([
          focusRepo.countOpenDefects(ids),
          focusRepo.countOverdueTodos(ids),
          focusRepo.countPendingSubmittals(ids),
          focusRepo.countInspectionsByResult("FAILED", ids),
          focusRepo.listMilestonesForMetrics(ids),
        ]);
      const m = milestoneMetrics(milestones);
      const facts: string[] = [];
      facts.push(
        m.gap < 0 ? `整體進度落後 ${Math.abs(m.gap)}%` : `整體進度 ${m.overall}%`,
      );
      if (openDefects > 0) facts.push(`${openDefects} 件未結案缺失`);
      if (overdueTodos > 0) facts.push(`${overdueTodos} 項逾期待辦`);
      if (pendingSubmittals > 0) facts.push(`${pendingSubmittals} 件待審送審`);
      if (failed > 0) facts.push(`${failed} 件查驗不合格`);
      return { label, facts };
    }

    case "/projects": {
      const projects = await projectService.listProjects(viewer);
      const behind = projects.filter((p) => p.progress.gap < 0).length;
      const facts = [`可檢視 ${projects.length} 個專案`];
      if (behind > 0) facts.push(`其中 ${behind} 個進度落後`);
      return { label, facts };
    }

    case "/todos": {
      const [total, overdue] = await Promise.all([
        focusRepo.countTodos(ids),
        focusRepo.countOverdueTodos(ids),
      ]);
      const facts = [`待辦共 ${total} 項`];
      if (overdue > 0) facts.push(`${overdue} 項已逾期`);
      return { label, facts };
    }

    case "/submittals": {
      const [total, pending] = await Promise.all([
        focusRepo.countSubmittals(ids),
        focusRepo.countPendingSubmittals(ids),
      ]);
      const facts = [`送審共 ${total} 件`];
      if (pending > 0) facts.push(`${pending} 件待審`);
      return { label, facts };
    }

    case "/quality": {
      const [passed, conditional, failed, openDefects] = await Promise.all([
        focusRepo.countInspectionsByResult("PASSED", ids),
        focusRepo.countInspectionsByResult("CONDITIONAL", ids),
        focusRepo.countInspectionsByResult("FAILED", ids),
        focusRepo.countOpenDefects(ids),
      ]);
      const facts = [`查驗合格率 ${pct(passed, passed + conditional + failed)}%`];
      if (openDefects > 0) facts.push(`${openDefects} 件未結案缺失`);
      if (failed > 0) facts.push(`${failed} 件不合格`);
      return { label, facts };
    }

    case "/calendar": {
      const upcoming = await focusRepo.countUpcomingReminders(ids);
      const facts = upcoming > 0 ? [`近期有 ${upcoming} 筆預警/提醒`] : [];
      return { label, facts };
    }

    case "/schedule": {
      const milestones = await focusRepo.listMilestonesForMetrics(ids);
      const m = milestoneMetrics(milestones);
      const facts = [
        m.gap < 0
          ? `整體進度落後預定 ${Math.abs(m.gap)}%`
          : `整體進度 ${m.overall}%（符合預定）`,
        `試運轉就緒度 ${m.commissioning}%`,
      ];
      return { label, facts };
    }

    case "/ehs": {
      const n = await focusRepo.countEhs(ids);
      return { label, facts: [`環安衛稽核共 ${n} 筆`] };
    }

    case "/documents": {
      const n = await focusRepo.countMedia(ids);
      return { label, facts: [`資料庫共 ${n} 筆影像/文件`] };
    }

    default:
      return { label, facts: [] };
  }
}
