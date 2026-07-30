import { addDays, diffDays, formatDay, parseDay } from "./obligation-trigger";

/**
 * 履約事項甘特圖的版面計算（純函式，無 I/O，便於單元測試）。
 *
 * 橫條從哪裡來 ——
 * 履約事項本身只有一個「期限」，那是要交付的時點，不是一段工作。
 * 實際的工作在歸屬它的工程分項上（有預定起訖），所以橫條取這些分項的
 * 最早開始到最晚完成，期限則以里程碑標示。這樣既不必新增欄位，
 * 分項改期時甘特圖也會自動跟著動。
 *
 * 沒有分項的事項（審查計畫書這類）畫成單獨的里程碑 —— 那才是它的本質。
 */

/** 一項履約事項在圖上所需的資料。 */
export type GanttInput = {
  id: string;
  code: string;
  title: string;
  stage: string;
  status: string;
  risk: string;
  /** 期限（YYYY-MM-DD）。 */
  dueDate: string | null;
  /** 實際完成日。 */
  actualDate: string | null;
  /** 前置事項 id；用於畫依存線。 */
  predecessorId: string | null;
  /** 歸屬工程分項的預定起訖。 */
  workItems: { plannedStart: string | null; plannedEnd: string | null }[];
};

export type GanttBar = {
  id: string;
  code: string;
  title: string;
  stage: string;
  status: string;
  risk: string;
  /** 橫條起日；無分項時為 null（只畫里程碑）。 */
  start: string | null;
  /** 橫條訖日。 */
  end: string | null;
  dueDate: string | null;
  actualDate: string | null;
  predecessorId: string | null;
  /** 是否逾期（有期限、未完成、期限早於今日）。 */
  overdue: boolean;
  /** 是否已完成。 */
  done: boolean;
  /** 圖上的列序（0 起算）。 */
  row: number;
};

/** 由歸屬分項聚合出橫條的起訖。 */
export function spanOfWorkItems(
  items: { plannedStart: string | null; plannedEnd: string | null }[],
): { start: string | null; end: string | null } {
  const starts = items
    .map((w) => w.plannedStart)
    .filter((d): d is string => Boolean(parseDay(d)));
  const ends = items
    .map((w) => w.plannedEnd)
    .filter((d): d is string => Boolean(parseDay(d)));

  return {
    start: starts.length ? starts.slice().sort()[0] : null,
    end: ends.length ? ends.slice().sort().at(-1)! : null,
  };
}

/**
 * 排列各列。
 *
 * 排序依「時間軸上的位置」而非管制編號：甘特圖是看時序的工具，
 * 依編號排會讓相鄰兩列在圖上一遠一近，看不出先後。
 * 以橫條起日為主鍵，無橫條者以期限代之，兩者皆無者排到最後。
 */
export function buildBars(items: GanttInput[], today: string): GanttBar[] {
  const rows = items.map((o) => {
    const span = spanOfWorkItems(o.workItems);
    const done = o.status === "DONE";
    const overdue = Boolean(
      !done && o.dueDate && parseDay(o.dueDate) && o.dueDate < today,
    );
    return {
      id: o.id,
      code: o.code,
      title: o.title,
      stage: o.stage,
      status: o.status,
      risk: o.risk,
      start: span.start,
      end: span.end,
      dueDate: o.dueDate,
      actualDate: o.actualDate,
      predecessorId: o.predecessorId,
      overdue,
      done,
      row: 0,
    };
  });

  const key = (b: GanttBar) => b.start ?? b.dueDate ?? "9999-12-31";
  rows.sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    if (ka !== kb) return ka < kb ? -1 : 1;
    return a.code.localeCompare(b.code, "zh-Hant");
  });
  return rows.map((b, i) => ({ ...b, row: i }));
}

// ── 時間軸 ──────────────────────────────────────────────────

export type Timeline = {
  /** 軸的起日與訖日。 */
  from: string;
  to: string;
  /** 總天數（至少 1）。 */
  days: number;
  /** 月刻度：每月一格。 */
  months: { label: string; offsetDays: number; days: number }[];
};

/** 軸兩端留白的天數，讓端點不貼齊邊緣。 */
export const TIMELINE_PADDING_DAYS = 14;

/**
 * 由所有日期決定時間軸範圍。
 *
 * 一律把「今天」納入範圍 —— 全部事項都在未來或都已過去時，
 * 若軸上沒有今天，那條今日線就會落在圖外，使用者也就失去了參照點。
 */
export function buildTimeline(bars: GanttBar[], today: string): Timeline | null {
  const dates: string[] = [today];
  for (const b of bars) {
    for (const d of [b.start, b.end, b.dueDate, b.actualDate]) {
      if (d && parseDay(d)) dates.push(d);
    }
  }
  if (dates.length === 0) return null;

  dates.sort();
  const from = addDays(dates[0], -TIMELINE_PADDING_DAYS);
  const to = addDays(dates[dates.length - 1], TIMELINE_PADDING_DAYS);
  if (!from || !to) return null;

  const days = Math.max(1, diffDays(from, to) ?? 1);
  return { from, to, days, months: monthTicks(from, to) };
}

/** 月刻度。每格為一個月在軸上的區段。 */
function monthTicks(
  from: string,
  to: string,
): { label: string; offsetDays: number; days: number }[] {
  const start = parseDay(from);
  const end = parseDay(to);
  if (!start || !end) return [];

  const out: { label: string; offsetDays: number; days: number }[] = [];
  let y = start.getUTCFullYear();
  let m = start.getUTCMonth();

  while (true) {
    const monthStart = new Date(Date.UTC(y, m, 1));
    const nextMonth = new Date(Date.UTC(m === 11 ? y + 1 : y, (m + 1) % 12, 1));
    if (monthStart.getTime() > end.getTime()) break;

    // 首月與末月可能只露出一部分，故以與軸範圍的交集為寬度
    const segStart = monthStart.getTime() < start.getTime() ? start : monthStart;
    const segEnd = nextMonth.getTime() > end.getTime() ? end : nextMonth;
    const offsetDays = diffDays(from, formatDay(segStart)) ?? 0;
    const days = diffDays(formatDay(segStart), formatDay(segEnd)) ?? 0;
    if (days > 0) {
      out.push({
        label: `${y} 年 ${m + 1} 月`,
        offsetDays,
        days,
      });
    }

    if (m === 11) {
      m = 0;
      y += 1;
    } else {
      m += 1;
    }
  }
  return out;
}

/** 日期在軸上的位置（0～1）。超出範圍者夾在兩端。 */
export function positionOf(timeline: Timeline, day: string): number | null {
  if (!parseDay(day)) return null;
  const offset = diffDays(timeline.from, day);
  if (offset === null) return null;
  return Math.min(1, Math.max(0, offset / timeline.days));
}

export type BarGeometry = {
  /** 橫條左緣與寬度（0～1 的比例）。無橫條時為 null。 */
  bar: { left: number; width: number } | null;
  /** 期限里程碑的位置。 */
  milestone: number | null;
  /** 實際完成里程碑的位置。 */
  actual: number | null;
};

/** 一列的幾何位置。 */
export function geometryOf(timeline: Timeline, bar: GanttBar): BarGeometry {
  const left = bar.start ? positionOf(timeline, bar.start) : null;
  const right = bar.end ? positionOf(timeline, bar.end) : null;

  return {
    bar:
      left !== null && right !== null
        ? {
            left,
            /*
              最小寬度保留一點：同日起訖的分項（單日作業）算出來是 0，
              寬度為 0 的橫條在畫面上完全看不到，使用者會以為資料沒填。
            */
            width: Math.max(0.004, right - left),
          }
        : null,
    milestone: bar.dueDate ? positionOf(timeline, bar.dueDate) : null,
    actual: bar.actualDate ? positionOf(timeline, bar.actualDate) : null,
  };
}

/** 依存線：由前置事項的里程碑連到本事項的橫條起點或里程碑。 */
export type DependencyLink = {
  fromRow: number;
  toRow: number;
  /** 起點與終點在軸上的位置。 */
  fromX: number;
  toX: number;
  /** 前置事項的期限晚於本事項，時序矛盾。 */
  conflicting: boolean;
};

/**
 * 算出要畫的依存線。
 *
 * 同時標出時序矛盾（前置事項的期限比後續事項還晚）——
 * 那是排程錯誤，光看兩列日期不容易發現，畫成線就一眼看出方向反了。
 */
export function dependencyLinks(
  bars: GanttBar[],
  timeline: Timeline,
): DependencyLink[] {
  const byId = new Map(bars.map((b) => [b.id, b]));
  const out: DependencyLink[] = [];

  for (const bar of bars) {
    if (!bar.predecessorId) continue;
    const from = byId.get(bar.predecessorId);
    if (!from) continue;

    const fromDay = from.actualDate ?? from.dueDate ?? from.end;
    const toDay = bar.start ?? bar.dueDate;
    if (!fromDay || !toDay) continue;

    const fromX = positionOf(timeline, fromDay);
    const toX = positionOf(timeline, toDay);
    if (fromX === null || toX === null) continue;

    out.push({
      fromRow: from.row,
      toRow: bar.row,
      fromX,
      toX,
      conflicting: fromDay > toDay,
    });
  }
  return out;
}

/** 圖上的整體摘要，供圖旁說明。 */
export type GanttSummary = {
  rows: number;
  /** 有橫條的列數（其餘只有里程碑）。 */
  withBars: number;
  overdue: number;
  done: number;
  /** 時序矛盾的依存線數。 */
  conflicts: number;
};

export function summarize(
  bars: GanttBar[],
  links: DependencyLink[],
): GanttSummary {
  return {
    rows: bars.length,
    withBars: bars.filter((b) => b.start && b.end).length,
    overdue: bars.filter((b) => b.overdue).length,
    done: bars.filter((b) => b.done).length,
    conflicts: links.filter((l) => l.conflicting).length,
  };
}
