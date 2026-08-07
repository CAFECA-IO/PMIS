/**
 * PMIS 進度 S-Curve 計算（純函式，無 I/O，可單元測試）。
 *
 * 以「履約事項」為進度單位，依權重（weight）累計，產出每月的：
 *  - planned  預定累計 %：以履約事項「期限」到當月為止的權重占比。
 *  - actual   實際累計 %：以履約事項「實際完成日」到當月為止的權重占比（僅計到今日所在月）。
 *  - forecast 預測趨勢 %：自目前實際值線性外推至工期末月達 100%。
 *
 * 因此 planned 受「預定日 + 權重」影響、actual 受「實際完成日 + 權重」影響——
 * 修改任一履約事項資料都會即時改變曲線。
 */

export type SCurveInput = {
  weight: number;
  plannedDate: Date | null;
  actualDate: Date | null;
};

export type SCurvePoint = {
  label: string;
  planned: number;
  actual: number | null;
  forecast: number | null;
};

export type SCurveBasis = "OBLIGATION" | "WORKITEM";

/**
 * 由 S-Curve 取「目前」的實際/預定累計與落差（供進度環圈、落差警示與 S-Curve 卡共用，
 * 確保三者一致且隨基準切換）。取最後一個 actual 非 null 的點（即今日所在期）。
 */
export function currentProgress(points: SCurvePoint[]): {
  overall: number;
  planned: number;
  gap: number;
} {
  if (points.length === 0) return { overall: 0, planned: 0, gap: 0 };
  let idx = -1;
  for (let i = 0; i < points.length; i++) {
    if (points[i].actual != null) idx = i;
  }
  if (idx < 0) return { overall: 0, planned: points[0].planned, gap: 0 };
  const overall = points[idx].actual ?? 0;
  const planned = points[idx].planned;
  return { overall, planned, gap: Math.round((overall - planned) * 100) / 100 };
}

const round = (n: number) => Math.round(n * 100) / 100;
const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);
const DAY = 86_400_000;

function monthlyBuckets(minTs: number, maxTs: number): Date[] {
  const min = new Date(minTs);
  const max = new Date(maxTs);
  const buckets: Date[] = [];
  const cursor = new Date(min.getFullYear(), min.getMonth(), 1);
  const end = new Date(max.getFullYear(), max.getMonth(), 1);
  while (cursor <= end) {
    buckets.push(new Date(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return buckets;
}

const endOfMonth = (b: Date) =>
  new Date(b.getFullYear(), b.getMonth() + 1, 0, 23, 59, 59).getTime();

/** 依目前實際值線性外推至末月 100%，回填 forecast。 */
function fillForecast(points: SCurvePoint[], currentIndex: number) {
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
}

export function buildSCurve(
  items: SCurveInput[],
  nowTs: number = Date.now(),
): SCurvePoint[] {
  const totalWeight = items.reduce((s, m) => s + m.weight, 0);
  const withPlanned = items.filter((m) => m.plannedDate);
  if (totalWeight === 0 || withPlanned.length === 0) return [];

  const times = withPlanned.map((m) => m.plannedDate!.getTime());
  const min = new Date(Math.min(...times));
  const max = new Date(Math.max(...times));

  // 由最早預定月到最晚預定月，逐月建立分桶
  const buckets: Date[] = [];
  const cursor = new Date(min.getFullYear(), min.getMonth(), 1);
  const end = new Date(max.getFullYear(), max.getMonth(), 1);
  while (cursor <= end) {
    buckets.push(new Date(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }

  // 目前（今日）所在或之前的最後一個分桶索引
  let currentIndex = 0;
  buckets.forEach((b, i) => {
    if (b.getTime() <= nowTs) currentIndex = i;
  });

  const cutoffOf = (b: Date) =>
    new Date(b.getFullYear(), b.getMonth() + 1, 0, 23, 59, 59).getTime();

  const sumWeight = (pred: (m: SCurveInput) => boolean) =>
    items.reduce((s, m) => (pred(m) ? s + m.weight : s), 0);

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

  fillForecast(points, currentIndex);
  return points;
}

/**
 * 以「工程分項（WorkItem）」為基準的 S-Curve。
 *
 * 與履約事項（事件式、以完成日計）不同，工程分項為「期間式」：
 *  - 權重（weight）採**預定工期天數**（越長貢獻越大；無預定日則權重 1）。
 *  - planned：各工項在其預定期間 [plannedStart, plannedEnd] 內**線性展開**累計。
 *  - actual：以工項目前 `progress`(%) 為終值，自 actualStart（無則 plannedStart）到今日**線性分佈**；
 *    若已有 actualEnd 且該月已過，則視為完成度全額計入。僅計到今日所在月。
 *  - forecast：自目前實際值線性外推至末月 100%。
 *
 * 故調整工項的預定/實際起訖日或 progress，皆會即時改變曲線。
 */
export type WorkItemInput = {
  plannedStart: Date | null;
  plannedEnd: Date | null;
  actualStart: Date | null;
  actualEnd: Date | null;
  progress: number;
};

/**
 * 工程分項的排程權重＝預定工期天數（無預定起訖則為 1）。
 *
 * 與 `buildWorkItemSCurve` 內部使用的權重同一定義，抽出以供
 * 月報的預定／完成進度共用 —— 否則同一份報表會出現兩種加權方式。
 */
export function workItemWeight(w: {
  plannedStart: Date | null;
  plannedEnd: Date | null;
}): number {
  if (!w.plannedStart || !w.plannedEnd) return 1;
  return Math.max(1, (w.plannedEnd.getTime() - w.plannedStart.getTime()) / DAY);
}

/**
 * 指定時點的**預定累計進度**（%），工程分項基準（決策 C／I）。
 *
 * 各工項於其預定期間 [plannedStart, plannedEnd] 內線性展開，
 * 以預定工期天數加權後彙總。與 `buildWorkItemSCurve` 的 planned 同一算法，
 * 差別僅在此處可取任意日期，而非僅月底 —— 日報的「當日預定進度」即用此函式。
 *
 * 無任何具備預定起訖日的工項時回 `null`（無從計算，不臆造 0）。
 */
export function plannedProgressAt(
  items: WorkItemInput[],
  at: Date,
): number | null {
  const schedulable = items.filter((w) => w.plannedStart && w.plannedEnd);
  if (schedulable.length === 0) return null;

  const totalWeight = schedulable.reduce((s, w) => s + workItemWeight(w), 0);
  if (totalWeight === 0) return null;

  const cutoff = at.getTime();
  const done = schedulable.reduce((sum, w) => {
    const a = w.plannedStart!.getTime();
    const b = w.plannedEnd!.getTime();
    const frac = b <= a ? (cutoff >= b ? 1 : 0) : clamp01((cutoff - a) / (b - a));
    return sum + workItemWeight(w) * frac;
  }, 0);

  return round((done / totalWeight) * 100);
}

/**
 * 以預定工期天數加權的**進度增量**（百分點）。
 *
 * 各工項的 `delta` 為該工項於期間內完成的比例（0–100），由呼叫端依
 * 期間內的日報數量算出；本函式只負責加權彙總，不涉及數量來源，
 * 以保持純函式與可測性。
 *
 * 無工項時回 `null`。
 */
export function weightedProgressDelta(
  items: {
    plannedStart: Date | null;
    plannedEnd: Date | null;
    /** 該工項本期完成比例（0–100） */
    delta: number;
  }[],
): number | null {
  if (items.length === 0) return null;
  const totalWeight = items.reduce((s, w) => s + workItemWeight(w), 0);
  if (totalWeight === 0) return null;
  const sum = items.reduce(
    (s, w) => s + workItemWeight(w) * clamp01(w.delta / 100) * 100,
    0,
  );
  return round(sum / totalWeight);
}

export function buildWorkItemSCurve(
  items: WorkItemInput[],
  nowTs: number = Date.now(),
): SCurvePoint[] {
  const schedulable = items.filter((w) => w.plannedStart && w.plannedEnd);
  if (schedulable.length === 0) return [];

  const weightOf = (w: WorkItemInput) =>
    Math.max(1, (w.plannedEnd!.getTime() - w.plannedStart!.getTime()) / DAY);
  const totalWeight = schedulable.reduce((s, w) => s + weightOf(w), 0);
  if (totalWeight === 0) return [];

  const minTs = Math.min(...schedulable.map((w) => w.plannedStart!.getTime()));
  const maxTs = Math.max(...schedulable.map((w) => w.plannedEnd!.getTime()));
  const buckets = monthlyBuckets(minTs, maxTs);

  let currentIndex = 0;
  buckets.forEach((b, i) => {
    if (b.getTime() <= nowTs) currentIndex = i;
  });

  const plannedFrac = (w: WorkItemInput, cutoff: number) => {
    const a = w.plannedStart!.getTime();
    const b = w.plannedEnd!.getTime();
    if (b <= a) return cutoff >= b ? 1 : 0;
    return clamp01((cutoff - a) / (b - a));
  };

  const actualFrac = (w: WorkItemInput, cutoff: number) => {
    const prog = clamp01((w.progress ?? 0) / 100);
    if (prog === 0) return 0;
    if (w.actualEnd && cutoff >= endOfMonth(new Date(w.actualEnd.getTime())))
      return prog;
    const start = (w.actualStart ?? w.plannedStart)!.getTime();
    if (cutoff < start) return 0;
    const denom = nowTs - start;
    const frac = denom <= 0 ? 1 : clamp01((cutoff - start) / denom);
    return prog * frac;
  };

  const points: SCurvePoint[] = buckets.map((b, i) => {
    const cutoff = endOfMonth(b);
    const planned = round(
      (schedulable.reduce((s, w) => s + weightOf(w) * plannedFrac(w, cutoff), 0) /
        totalWeight) *
        100,
    );
    const actual =
      i <= currentIndex
        ? round(
            (schedulable.reduce(
              (s, w) => s + weightOf(w) * actualFrac(w, cutoff),
              0,
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

  fillForecast(points, currentIndex);
  return points;
}
