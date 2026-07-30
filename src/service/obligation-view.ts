import type {
  ObligationRisk,
  ObligationStage,
  ObligationStatus,
  ObligationTrigger,
} from "@/constant/obligation";

/**
 * 履約事項的統計與篩選（純函式，無 I/O，便於單元測試）。
 * 資料由 service 層備妥後傳入，本模組只負責計數與過濾。
 */

export type ObligationRow = {
  id: string;
  code: string;
  title: string;
  stage: ObligationStage;
  risk: ObligationRisk;
  triggerType: ObligationTrigger;
  status: ObligationStatus;
  /** ISO 日期字串或 null */
  dueDate: string | null;
  actualDate: string | null;
  ownerUnit: string | null;
  ownerName: string | null;
  contractBasis: string | null;
  projectName: string | null;
};

export type ObligationFilter = {
  keyword?: string;
  stage?: string;
  risk?: string;
  status?: string;
};

/** 責任單位／人的組合顯示，如「資訊組 / 陳工程師」。 */
export function ownerLabel(row: {
  ownerUnit: string | null;
  ownerName: string | null;
}): string {
  const parts = [row.ownerUnit, row.ownerName].filter(
    (v): v is string => Boolean(v && v.trim()),
  );
  return parts.join(" / ");
}

/**
 * 依條件篩選。關鍵字比對事項名稱、管制編號、契約依據與責任單位／人；
 * 空字串或 "all" 視為不篩選。
 */
export function filterObligations(
  rows: ObligationRow[],
  filter: ObligationFilter,
): ObligationRow[] {
  const kw = filter.keyword?.trim().toLowerCase() ?? "";
  const pick = (v: string | undefined) =>
    v && v !== "all" && v.trim() !== "" ? v : null;
  const stage = pick(filter.stage);
  const risk = pick(filter.risk);
  const status = pick(filter.status);

  return rows.filter((r) => {
    if (stage && r.stage !== stage) return false;
    if (risk && r.risk !== risk) return false;
    if (status && r.status !== status) return false;
    if (kw) {
      const hay = [r.title, r.code, r.contractBasis, ownerLabel(r)]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!hay.includes(kw)) return false;
    }
    return true;
  });
}

export type ObligationStats = {
  notStarted: number;
  inProgress: number;
  pendingExternal: number;
  overdue: number;
  doneThisMonth: number;
};

/**
 * 統計卡數字。
 * 待外部 = 待審 + 待機關（都在等他人回應）。
 * 本月完成 = actualDate 落在基準月份者。
 */
export function summarizeObligations(
  rows: ObligationRow[],
  today: string | Date = new Date(),
): ObligationStats {
  const base = typeof today === "string" ? new Date(today) : today;
  const y = base.getUTCFullYear();
  const m = base.getUTCMonth();

  let notStarted = 0;
  let inProgress = 0;
  let pendingExternal = 0;
  let overdue = 0;
  let doneThisMonth = 0;

  for (const r of rows) {
    switch (r.status) {
      case "NOT_STARTED":
        notStarted += 1;
        break;
      case "IN_PROGRESS":
        inProgress += 1;
        break;
      case "PENDING_REVIEW":
      case "PENDING_EXTERNAL":
        pendingExternal += 1;
        break;
      case "OVERDUE":
        overdue += 1;
        break;
      case "DONE":
        if (r.actualDate) {
          const d = new Date(r.actualDate);
          if (d.getUTCFullYear() === y && d.getUTCMonth() === m) {
            doneThisMonth += 1;
          }
        }
        break;
    }
  }

  return { notStarted, inProgress, pendingExternal, overdue, doneThisMonth };
}

/** 顯示排序：逾期最前，其後依期限近者優先（無期限排後），再依管制編號。 */
export function sortObligations(rows: ObligationRow[]): ObligationRow[] {
  const rank: Record<ObligationStatus, number> = {
    OVERDUE: 0,
    IN_PROGRESS: 1,
    PENDING_REVIEW: 2,
    PENDING_EXTERNAL: 3,
    NOT_STARTED: 4,
    DONE: 5,
  };
  const time = (v: string | null) => (v ? new Date(v).getTime() : null);

  return [...rows].sort((a, b) => {
    if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
    const ad = time(a.dueDate);
    const bd = time(b.dueDate);
    if (ad !== bd) {
      if (ad === null) return 1;
      if (bd === null) return -1;
      return ad - bd;
    }
    return a.code.localeCompare(b.code);
  });
}

/** 匯出 CSV（含表頭，欄位順序與畫面一致）。 */
export function toCsv(
  rows: ObligationRow[],
  labels: {
    stage: (v: ObligationStage) => string;
    risk: (v: ObligationRisk) => string;
    trigger: (v: ObligationTrigger) => string;
    status: (v: ObligationStatus) => string;
  },
): string {
  const head = [
    "風險",
    "管制編號",
    "階段",
    "履約事項",
    "責任單位/人",
    "觸發方式",
    "期限",
    "狀態",
    "契約依據",
  ];
  const esc = (v: string) =>
    /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;

  const lines = [head.join(",")];
  for (const r of rows) {
    lines.push(
      [
        labels.risk(r.risk),
        r.code,
        labels.stage(r.stage),
        r.title,
        ownerLabel(r),
        labels.trigger(r.triggerType),
        r.dueDate?.slice(0, 10) ?? "",
        labels.status(r.status),
        r.contractBasis ?? "",
      ]
        .map((v) => esc(String(v)))
        .join(","),
    );
  }
  return lines.join("\n");
}

/**
 * 履約事項篩選條件寫入網址。
 *
 * 專案不在這條篩選裡 —— 目前專案由左上角選單決定並存在 `?project=`，
 * 套用篩選時必須把它原封不動帶過去，否則按一次搜尋就會跳回全部專案。
 *
 * @param project 目前專案；null／"all" 代表全部專案
 */
export function obligationFilterHref(
  project: string | null | undefined,
  filter: { q?: string; stage?: string; risk?: string; status?: string },
): string {
  const sp = new URLSearchParams();
  const id = project?.trim();
  if (id && id !== "all") sp.set("project", id);
  const q = filter.q?.trim();
  if (q) sp.set("q", q);
  for (const key of ["stage", "risk", "status"] as const) {
    const value = filter[key]?.trim();
    if (value && value !== "all") sp.set(key, value);
  }
  const qs = sp.toString();
  return qs ? `/obligations?${qs}` : "/obligations";
}
