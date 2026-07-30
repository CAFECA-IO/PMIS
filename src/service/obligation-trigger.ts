import type { ObligationTrigger } from "@/constant/obligation";
import { anchorMeta, conditionKindMeta, conditionPatterns } from "@/constant/trigger";

/**
 * 由觸發方式推算期限（純函式，無 I/O，便於單元測試）。
 *
 * 為什麼要推算而不只是記錄 ——
 * 契約工期一改，或前置事項延期，所有相對期限都該跟著動。若期限只是一個
 * 人工填的日期，那次改動就會留下一整批悄悄過期的錯誤日期，而畫面上看起來
 * 完全正常。推算讓依存關係真的生效，也讓甘特圖有意義。
 *
 * 人工覆寫優先且會被記下：契約常有例外約定，鎖死反而無法如實記錄。
 */

/** 觸發設定。 */
export type TriggerSetting = {
  triggerType: ObligationTrigger;
  /** 固定日期，或人工覆寫後的期限（YYYY-MM-DD）。 */
  dueDate: string | null;
  /** 相對期限的基準點。 */
  relativeAnchor: string | null;
  /** 偏移天數。相對期限與前置事項共用；負數代表基準點之前。 */
  offsetDays: number | null;
  /** 前置事項 id。 */
  predecessorId: string | null;
  conditionKind: string | null;
  conditionDetail: string | null;
  /** 使用者是否手動改過期限。 */
  dueDateOverridden: boolean;
};

/** 推算所需的專案與前置事項資訊。 */
export type TriggerContext = {
  projectStart: string | null;
  projectEnd: string | null;
  contractSigned: string | null;
  noticeToProceed: string | null;
  /** 以事項 id 查其期限（前置事項用）。 */
  dueDateOf: (id: string) => string | null;
  /** 上一階段完成日。 */
  prevStageDone?: string | null;
  /** 推算週期性期限時的「今天」，預設當日。 */
  today?: string;
};

export type DueDateResult = {
  /** 推算出的期限；無法推算時為 null。 */
  dueDate: string | null;
  /** 推算依據的說明，供畫面顯示與稽核。 */
  basis: string | null;
  /** 無法推算的原因。 */
  reason: string | null;
  /** 是否沿用人工填的值。 */
  manual: boolean;
};

const DAY = 24 * 60 * 60 * 1000;

/**
 * 解析 YYYY-MM-DD；不合法回 null。
 *
 * 刻意以 UTC 計算，避免時區讓日期偏一天。
 * 解析後回頭核對年月日 —— Date.UTC 會把 2026-13-45 這種值默默進位成
 * 2027-02-14，若不核對，一個明顯錯誤的輸入會變成一個看起來正常的期限。
 */
export function parseDay(value: string | null | undefined): Date | null {
  const s = value?.trim();
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return null;
  const [y, mo, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(y, mo - 1, day));
  if (Number.isNaN(d.getTime())) return null;
  if (
    d.getUTCFullYear() !== y ||
    d.getUTCMonth() !== mo - 1 ||
    d.getUTCDate() !== day
  ) {
    return null;
  }
  return d;
}

export const formatDay = (d: Date): string => d.toISOString().slice(0, 10);

export function addDays(day: string, days: number): string | null {
  const d = parseDay(day);
  if (!d) return null;
  return formatDay(new Date(d.getTime() + days * DAY));
}

export function diffDays(from: string, to: string): number | null {
  const a = parseDay(from);
  const b = parseDay(to);
  if (!a || !b) return null;
  return Math.round((b.getTime() - a.getTime()) / DAY);
}

/** 各觸發方式需要哪些欄位。畫面據此切換輸入，伺服器據此驗證。 */
export function requiredFields(type: ObligationTrigger): string[] {
  switch (type) {
    case "FIXED_DATE":
      return ["dueDate"];
    case "RELATIVE_DUE":
      return ["relativeAnchor", "offsetDays"];
    case "PREDECESSOR":
      return ["predecessorId", "offsetDays"];
    case "CONDITION":
      return ["conditionKind", "conditionDetail"];
    default:
      return [];
  }
}

/** 設定是否完整；不完整時說明缺什麼。 */
export function validateTrigger(setting: TriggerSetting): string | null {
  switch (setting.triggerType) {
    case "FIXED_DATE":
      return setting.dueDate ? null : "固定日期需填入期限。";
    case "RELATIVE_DUE":
      if (!setting.relativeAnchor) return "相對期限需選擇基準時間點。";
      if (!anchorMeta(setting.relativeAnchor)) return "基準時間點不在可選清單內。";
      if (setting.offsetDays === null) return "相對期限需填入天數。";
      return null;
    case "PREDECESSOR":
      return setting.predecessorId ? null : "前置事項需選擇一項履約事項。";
    case "CONDITION":
      if (!setting.conditionKind) return "條件觸發需選擇條件類型。";
      if (!conditionKindMeta(setting.conditionKind)) {
        return "條件類型不在可選清單內。";
      }
      if (!setting.conditionDetail?.trim()) return "條件觸發需說明觸發條件。";
      return null;
    default:
      return null;
  }
}

/** 週期性基準的下一個發生日。 */
function nextCyclic(
  anchor: "MONTHLY" | "QUARTERLY",
  dayOfPeriod: number,
  today: string,
): string | null {
  const now = parseDay(today);
  if (!now) return null;
  const day = Math.min(28, Math.max(1, dayOfPeriod || 1));

  if (anchor === "MONTHLY") {
    let y = now.getUTCFullYear();
    let m = now.getUTCMonth();
    // 本月的期限已過就取下個月 —— 定期事項的「期限」指的是下一次要交的日子
    if (now.getUTCDate() > day) {
      m += 1;
      if (m > 11) {
        m = 0;
        y += 1;
      }
    }
    return formatDay(new Date(Date.UTC(y, m, day)));
  }

  // 每季：以 1、4、7、10 月為季首
  const quarterStart = Math.floor(now.getUTCMonth() / 3) * 3;
  let y = now.getUTCFullYear();
  let m = quarterStart;
  const candidate = new Date(Date.UTC(y, m, day));
  if (candidate.getTime() < now.getTime()) {
    m += 3;
    if (m > 11) {
      m -= 12;
      y += 1;
    }
  }
  return formatDay(new Date(Date.UTC(y, m, day)));
}

const OFFSET_WORDS = (days: number) =>
  days === 0 ? "當日" : days > 0 ? `後 ${days} 日` : `前 ${-days} 日`;

/**
 * 推算期限。
 *
 * @param setting 觸發設定
 * @param context 專案日期與前置事項查詢
 * @param titleOf 前置事項的名稱查詢（僅用於說明文字）
 */
export function computeDueDate(
  setting: TriggerSetting,
  context: TriggerContext,
  titleOf: (id: string) => string | null = () => null,
): DueDateResult {
  const manual = (reason: string): DueDateResult => ({
    dueDate: setting.dueDate,
    basis: null,
    reason,
    manual: true,
  });

  // 人工覆寫一律優先。契約的例外約定必須能如實記錄，而非被算式蓋掉。
  if (setting.dueDateOverridden && setting.triggerType !== "FIXED_DATE") {
    return manual("期限已由人工指定，不隨觸發設定變動");
  }

  const invalid = validateTrigger(setting);
  if (invalid) {
    return { dueDate: setting.dueDate, basis: null, reason: invalid, manual: false };
  }

  const offset = setting.offsetDays ?? 0;

  switch (setting.triggerType) {
    case "FIXED_DATE":
      return {
        dueDate: setting.dueDate,
        basis: "契約訂明的固定日期",
        reason: null,
        manual: false,
      };

    case "RELATIVE_DUE": {
      const anchor = anchorMeta(setting.relativeAnchor);
      if (!anchor) {
        return { dueDate: null, basis: null, reason: "基準時間點無效", manual: false };
      }
      if (anchor.cyclic) {
        const due = nextCyclic(
          anchor.id as "MONTHLY" | "QUARTERLY",
          offset,
          context.today ?? formatDay(new Date()),
        );
        return {
          dueDate: due,
          basis: `${anchor.label} ${offset} 日（下一次）`,
          reason: due ? null : "無法推算週期日期",
          manual: false,
        };
      }
      const base =
        anchor.id === "PROJECT_START"
          ? context.projectStart
          : anchor.id === "PROJECT_END"
            ? context.projectEnd
            : anchor.id === "CONTRACT_SIGNED"
              ? context.contractSigned
              : anchor.id === "NOTICE_TO_PROCEED"
                ? context.noticeToProceed
                : (context.prevStageDone ?? null);
      if (!base) {
        return {
          dueDate: setting.dueDate,
          basis: null,
          reason: `專案尚未填入${anchor.label}，無法推算期限`,
          manual: false,
        };
      }
      const due = addDays(base, offset);
      return {
        dueDate: due,
        basis: `${anchor.label}（${base}）${OFFSET_WORDS(offset)}`,
        reason: due ? null : "基準日期格式有誤",
        manual: false,
      };
    }

    case "PREDECESSOR": {
      const id = setting.predecessorId!;
      const base = context.dueDateOf(id);
      const name = titleOf(id);
      if (!base) {
        return {
          dueDate: setting.dueDate,
          basis: null,
          reason: `前置事項${name ? `「${name}」` : ""}尚無期限，無法推算`,
          manual: false,
        };
      }
      const due = addDays(base, offset);
      return {
        dueDate: due,
        basis: `前置事項${name ? `「${name}」` : ""}（${base}）${OFFSET_WORDS(offset)}`,
        reason: null,
        manual: false,
      };
    }

    case "CONDITION":
      /*
        條件觸發無法推算日期，這是它的本質：外部行為何時發生不由本案決定。
        故不推算，只把條件說清楚，並讓畫面標示為「待觸發」而非「無期限」——
        兩者的意思完全不同。
      */
      return {
        dueDate: setting.dueDate,
        basis: `${conditionKindMeta(setting.conditionKind)?.label ?? "條件"}：${setting.conditionDetail}`,
        reason: "條件觸發的期限待條件成立後才確定",
        manual: false,
      };

    default:
      return { dueDate: setting.dueDate, basis: null, reason: null, manual: false };
  }
}

// ── 前置事項的迴圈防護 ──────────────────────────────────────

/**
 * 把某項設為前置事項會不會形成迴圈。
 *
 * 甲以乙為前置、乙又以甲為前置時，期限推算會無限相依。
 * 一旦寫進資料庫，之後每次推算都會踩到，故在寫入前就擋下。
 *
 * @param predecessorOf 以事項 id 查其前置事項 id
 */
export function wouldCycle(
  id: string,
  candidatePredecessor: string,
  predecessorOf: (id: string) => string | null,
): boolean {
  if (id === candidatePredecessor) return true;
  const seen = new Set<string>([id]);
  let cursor: string | null = candidatePredecessor;
  while (cursor) {
    if (seen.has(cursor)) return true;
    seen.add(cursor);
    cursor = predecessorOf(cursor);
  }
  return false;
}

/** 可作為前置事項的候選：排除自己與會造成迴圈者。 */
export function predecessorCandidates<T extends { id: string }>(
  self: string,
  all: T[],
  predecessorOf: (id: string) => string | null,
): T[] {
  return all.filter(
    (o) => o.id !== self && !wouldCycle(self, o.id, predecessorOf),
  );
}

/** 觸發設定的人話摘要，供清單與細節頁顯示。 */
export function describeTrigger(
  setting: TriggerSetting,
  titleOf: (id: string) => string | null = () => null,
): string {
  switch (setting.triggerType) {
    case "FIXED_DATE":
      return setting.dueDate ? `固定日期 ${setting.dueDate}` : "固定日期（未填）";
    case "RELATIVE_DUE": {
      const anchor = anchorMeta(setting.relativeAnchor);
      if (!anchor) return "相對期限（未設定基準）";
      const days = setting.offsetDays ?? 0;
      return anchor.cyclic
        ? `${anchor.label} ${days} 日`
        : `${anchor.label}${OFFSET_WORDS(days)}`;
    }
    case "PREDECESSOR": {
      const name = setting.predecessorId ? titleOf(setting.predecessorId) : null;
      const days = setting.offsetDays ?? 0;
      return name
        ? `${name} 完成${OFFSET_WORDS(days)}`
        : "前置事項（未指定）";
    }
    case "CONDITION": {
      const kind = conditionKindMeta(setting.conditionKind);
      const detail = setting.conditionDetail?.trim();
      if (!kind) return "條件觸發（未設定）";
      return detail ? `${kind.label}：${detail}` : kind.label;
    }
    default:
      return "—";
  }
}

/** 條件說明的候選模式（畫面下拉用）。 */
export const patternsFor = conditionPatterns;
