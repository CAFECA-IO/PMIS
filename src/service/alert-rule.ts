import type {
  AlertAnchor,
  AlertMetric,
  AlertOperator,
  AlertRuleKind,
  AlertSeverity,
} from "@/constant/alert";
import { alertMetricMeta, alertOperatorMeta } from "@/constant/alert";

/**
 * 預警規則評估引擎（純函式，無 I/O）。
 *
 * 三類規則：
 *  - FIXED_DATE     固定日期：到達指定日期後觸發
 *  - RELATIVE_DATE  相對日期：距基準日剩餘天數 ≤ offsetDays 時觸發（含已逾期）
 *  - CONDITION      條件觸發：指標值與門檻比較
 *
 * 資料由呼叫端（service 層）備妥後傳入，本模組只負責判斷，便於單元測試。
 */

export type AlertRule = {
  id: string;
  name: string;
  kind: AlertRuleKind;
  module: string;
  severity: AlertSeverity;
  enabled: boolean;
  /** null 代表適用於所有專案 */
  projectId?: string | null;

  fixedDate?: string | null;

  anchor?: AlertAnchor | null;
  offsetDays?: number | null;

  metric?: AlertMetric | null;
  operator?: AlertOperator | null;
  threshold?: number | null;
  unit?: string | null;

  action?: string | null;
  notify?: string | null;
};

/** 具有基準日的待評估項目（履約事項、文件、查驗、缺失…）。 */
export type AnchorItem = {
  anchor: AlertAnchor;
  /** ISO 日期 YYYY-MM-DD */
  date: string;
  label: string;
  projectId: string;
  projectName: string;
};

/** 條件度量的一筆取樣（某專案／某設備的當前數值）。 */
export type MetricSample = {
  metric: AlertMetric;
  value: number;
  label: string;
  projectId: string;
  projectName: string;
};

export type AlertHit = {
  ruleId: string;
  ruleName: string;
  kind: AlertRuleKind;
  severity: AlertSeverity;
  module: string;
  projectId: string | null;
  projectName: string | null;
  /** 命中的對象，如「材料試驗報告」「CAM-03 東側大門」 */
  subject: string;
  /** 命中說明，如「落後 7.2%（門檻 ≥ 5%）」 */
  detail: string;
  dueDate: string | null;
  /** 距期限天數，負值代表已逾期 */
  daysUntil: number | null;
  overdue: boolean;
  action: string | null;
  notify: string | null;
};

const DAY_MS = 86_400_000;

/** 取當日 00:00（UTC 基準），避免時分秒造成天數計算誤差。 */
function startOfDay(value: string | Date): number {
  const d = typeof value === "string" ? new Date(`${value.slice(0, 10)}T00:00:00Z`) : value;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** 兩個日期相差幾天（date - today），負值代表已過期。 */
export function daysBetween(today: string | Date, date: string | Date): number {
  return Math.round((startOfDay(date) - startOfDay(today)) / DAY_MS);
}

export function compare(
  value: number,
  operator: AlertOperator,
  threshold: number,
): boolean {
  switch (operator) {
    case "GTE":
      return value >= threshold;
    case "LTE":
      return value <= threshold;
    case "GT":
      return value > threshold;
    case "LT":
      return value < threshold;
    case "EQ":
      return value === threshold;
    default:
      return false;
  }
}

/** 規則是否適用於該專案（規則未指定專案時適用全部）。 */
function appliesTo(rule: AlertRule, projectId: string): boolean {
  return !rule.projectId || rule.projectId === projectId;
}

function baseHit(
  rule: AlertRule,
  over: Partial<AlertHit> & Pick<AlertHit, "subject" | "detail">,
): AlertHit {
  return {
    ruleId: rule.id,
    ruleName: rule.name,
    kind: rule.kind,
    severity: rule.severity,
    module: rule.module,
    projectId: rule.projectId ?? null,
    projectName: null,
    dueDate: null,
    daysUntil: null,
    overdue: false,
    action: rule.action ?? null,
    notify: rule.notify ?? null,
    ...over,
  };
}

function evalFixedDate(rule: AlertRule, today: string | Date): AlertHit[] {
  if (!rule.fixedDate) return [];
  const daysUntil = daysBetween(today, rule.fixedDate);
  // 尚未到期不觸發
  if (daysUntil > 0) return [];
  const date = rule.fixedDate.slice(0, 10);
  return [
    baseHit(rule, {
      subject: rule.name,
      detail: daysUntil === 0 ? `今日為指定日期（${date}）` : `已逾指定日期 ${Math.abs(daysUntil)} 天（${date}）`,
      dueDate: date,
      daysUntil,
      overdue: daysUntil < 0,
    }),
  ];
}

function evalRelativeDate(
  rule: AlertRule,
  items: AnchorItem[],
  today: string | Date,
): AlertHit[] {
  if (!rule.anchor || rule.offsetDays == null) return [];
  const lead = rule.offsetDays;
  const hits: AlertHit[] = [];

  for (const item of items) {
    if (item.anchor !== rule.anchor) continue;
    if (!appliesTo(rule, item.projectId)) continue;
    const daysUntil = daysBetween(today, item.date);
    // 進入提前通知區間即觸發，已逾期者一併列入
    if (daysUntil > lead) continue;
    hits.push(
      baseHit(rule, {
        subject: item.label,
        detail:
          daysUntil < 0
            ? `已逾期 ${Math.abs(daysUntil)} 天（期限 ${item.date}）`
            : `距期限 ${daysUntil} 天（提前 ${lead} 天通知）`,
        dueDate: item.date,
        daysUntil,
        overdue: daysUntil < 0,
        projectId: item.projectId,
        projectName: item.projectName,
      }),
    );
  }
  return hits;
}

function evalCondition(rule: AlertRule, samples: MetricSample[]): AlertHit[] {
  if (!rule.metric || !rule.operator || rule.threshold == null) return [];
  const unit = rule.unit ?? alertMetricMeta[rule.metric]?.unit ?? "";
  const symbol = alertOperatorMeta[rule.operator].symbol;
  const hits: AlertHit[] = [];

  for (const s of samples) {
    if (s.metric !== rule.metric) continue;
    if (!appliesTo(rule, s.projectId)) continue;
    if (!compare(s.value, rule.operator, rule.threshold)) continue;
    hits.push(
      baseHit(rule, {
        subject: s.label,
        detail: `目前 ${s.value}${unit}（門檻 ${symbol} ${rule.threshold}${unit}）`,
        projectId: s.projectId,
        projectName: s.projectName,
      }),
    );
  }
  return hits;
}

export type EvaluationInput = {
  rules: AlertRule[];
  anchors: AnchorItem[];
  samples: MetricSample[];
  /** 評估基準日，預設為今天 */
  today?: string | Date;
};

/**
 * 評估所有「已啟用」的規則，回傳命中清單。
 * 停用的規則一律略過，不列入結果。
 */
export function evaluateRules({
  rules,
  anchors,
  samples,
  today = new Date(),
}: EvaluationInput): AlertHit[] {
  const hits: AlertHit[] = [];
  for (const rule of rules) {
    if (!rule.enabled) continue;
    switch (rule.kind) {
      case "FIXED_DATE":
        hits.push(...evalFixedDate(rule, today));
        break;
      case "RELATIVE_DATE":
        hits.push(...evalRelativeDate(rule, anchors, today));
        break;
      case "CONDITION":
        hits.push(...evalCondition(rule, samples));
        break;
    }
  }
  // 嚴重度優先，其次以距期限天數由近至遠
  const rank: Record<AlertSeverity, number> = { CRITICAL: 0, WARNING: 1, INFO: 2 };
  return hits.sort((a, b) => {
    if (rank[a.severity] !== rank[b.severity]) {
      return rank[a.severity] - rank[b.severity];
    }
    const ad = a.daysUntil ?? Number.MAX_SAFE_INTEGER;
    const bd = b.daysUntil ?? Number.MAX_SAFE_INTEGER;
    return ad - bd;
  });
}

/** 規則設定是否完整（缺欄位的規則即使啟用也不會觸發）。 */
export function isRuleComplete(rule: AlertRule): boolean {
  switch (rule.kind) {
    case "FIXED_DATE":
      return Boolean(rule.fixedDate);
    case "RELATIVE_DATE":
      return Boolean(rule.anchor) && rule.offsetDays != null;
    case "CONDITION":
      return (
        Boolean(rule.metric) && Boolean(rule.operator) && rule.threshold != null
      );
    default:
      return false;
  }
}

/** 以中文摘要描述規則的觸發條件，供列表顯示。 */
export function describeRule(rule: AlertRule): string {
  switch (rule.kind) {
    case "FIXED_DATE":
      return rule.fixedDate ? `於 ${rule.fixedDate.slice(0, 10)} 觸發` : "尚未設定日期";
    case "RELATIVE_DATE":
      return rule.anchor && rule.offsetDays != null
        ? `期限前 ${rule.offsetDays} 天觸發`
        : "尚未設定基準日";
    case "CONDITION": {
      if (!rule.metric || !rule.operator || rule.threshold == null) {
        return "尚未設定條件";
      }
      const m = alertMetricMeta[rule.metric];
      const unit = rule.unit ?? m?.unit ?? "";
      return `${m?.label ?? rule.metric} ${alertOperatorMeta[rule.operator].symbol} ${rule.threshold}${unit}`;
    }
    default:
      return "";
  }
}
