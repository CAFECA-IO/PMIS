/**
 * 工程分項 → 履約事項 上捲：由工程分項進度推算履約事項達成度。
 *
 * - derivedProgress：其下工程分項以「預定工期天數」加權的平均進度（無預定日則等權）。
 * - effectiveActual：履約事項的「實際完成日」計算原則——
 *     1) 履約事項本身有手動 actualDate → 以手動為準（合約認定優先）。
 *     2) 否則若工程分項加權進度達 100% → 取其最後的實際完工日（無則取最後預定完工日）。
 *     3) 否則視為尚未達成（null）。
 *   無任何關聯工程分項時，回退為履約事項原本的手動 actualDate。
 */

export type RollupItem = {
  plannedStart: Date | null;
  plannedEnd: Date | null;
  actualStart: Date | null;
  actualEnd: Date | null;
  progress: number;
};

const DAY = 86_400_000;

function durationWeight(w: RollupItem): number {
  if (w.plannedStart && w.plannedEnd) {
    return Math.max(1, (w.plannedEnd.getTime() - w.plannedStart.getTime()) / DAY);
  }
  return 1;
}

/** 工項加權平均進度（0–100，四捨五入到小數 1 位）。 */
export function derivedProgress(items: RollupItem[]): number {
  if (items.length === 0) return 0;
  let wsum = 0;
  let psum = 0;
  for (const it of items) {
    const w = durationWeight(it);
    wsum += w;
    psum += w * Math.min(100, Math.max(0, it.progress));
  }
  return wsum > 0 ? Math.round((psum / wsum) * 10) / 10 : 0;
}

function maxDate(dates: (Date | null)[]): Date | null {
  const ts = dates.filter((d): d is Date => !!d).map((d) => d.getTime());
  return ts.length ? new Date(Math.max(...ts)) : null;
}

/** 履約事項的有效實際完成日（見檔頭原則）。 */
export function effectiveObligationActual(
  manualActual: Date | null,
  items: RollupItem[],
): Date | null {
  if (items.length === 0) return manualActual;
  if (manualActual) return manualActual;
  if (derivedProgress(items) >= 100) {
    return (
      maxDate(items.map((i) => i.actualEnd)) ??
      maxDate(items.map((i) => i.plannedEnd))
    );
  }
  return null;
}

// ── 全系統統一的「專案進度」定義（上捲：工程分項→履約事項→加權%）──────
const round2 = (n: number) => Math.round(n * 100) / 100;

export type ProgressObligation = {
  id?: string | null;
  weight: number;
  /** 期限 */
  dueDate: Date | null;
  actualDate: Date | null;
};
export type ProgressWorkItem = RollupItem & { obligationId: string | null };

/**
 * 專案進度（截至 now）＝以履約事項權重加權的達成度，達成與否由工程分項上捲後的
 * 有效實際完成日判定（見 effectiveObligationActual）。回傳 overall / planned / gap。
 * 此為全系統單一定義：專案列表、專案總覽、履約事項分頁、費思摘要、報表、儀表板皆共用。
 */
export function rolledUpProgress(
  obligations: ProgressObligation[],
  workItems: ProgressWorkItem[],
  now: number = Date.now(),
): { overall: number; planned: number; gap: number } {
  const total = obligations.reduce((s, m) => s + m.weight, 0);
  if (total === 0) return { overall: 0, planned: 0, gap: 0 };

  let achieved = 0;
  let planned = 0;
  for (const m of obligations) {
    const items = m.id ? workItems.filter((w) => w.obligationId === m.id) : [];
    const eff = effectiveObligationActual(m.actualDate, items);
    if (eff && eff.getTime() <= now) achieved += m.weight;
    if (m.dueDate && m.dueDate.getTime() <= now) planned += m.weight;
  }
  const overall = round2((achieved / total) * 100);
  const plannedPct = round2((planned / total) * 100);
  return { overall, planned: plannedPct, gap: round2(overall - plannedPct) };
}
