import type { AuditAction } from "@/repository/supervisionReportAudit.repository";

/**
 * 日報變更軌跡的差異描述（純函式，無 I/O，便於單元測試）。
 *
 * 目的是讓「改了什麼」看得懂：只記「被更新過」等於沒記，
 * 對帳時仍無從說明月報數字為何改變。
 */

/** 參與比對的日報欄位；值一律先轉為可比較的字串或 null。 */
export type ComparableFields = Record<string, string | null>;

/** 欄位的中文標題，供描述使用；未列者以欄位名呈現。 */
const FIELD_LABELS: Record<string, string> = {
  weather: "天氣",
  summary: "施工概況",
  manpower: "人員機具",
  equipment: "機具",
  keyNotes: "重要事項",
  stopReason: "停工原因",
  excludedFromDuration: "免計工期",
  exclusionBasis: "免計工期依據",
};

const show = (v: string | null): string => {
  const s = v?.trim();
  return s ? s : "（空）";
};

/** 過長的值截斷，避免單筆軌跡塞入整段敘述。 */
const clip = (v: string, max = 60): string =>
  v.length <= max ? v : `${v.slice(0, max)}…`;

/**
 * 比對欄位並產生「欄位：舊 → 新」的描述；無異動時回 null。
 *
 * 只列出**真正改變**的欄位 —— 每次儲存都把所有欄位記一遍，
 * 會讓軌跡淹沒在雜訊裡而失去查閱價值。
 */
export function describeFieldChanges(
  before: ComparableFields,
  after: ComparableFields,
): string | null {
  const parts: string[] = [];
  for (const key of Object.keys(after)) {
    const a = before[key] ?? null;
    const b = after[key] ?? null;
    if ((a ?? "") === (b ?? "")) continue;
    const label = FIELD_LABELS[key] ?? key;
    parts.push(`${label}：${clip(show(a))} → ${clip(show(b))}`);
  }
  return parts.length > 0 ? parts.join("；") : null;
}

/** 數量表一列（比對與留存用的最小欄位）。 */
export type QtySnapshotRow = {
  workItemId: string | null;
  itemName: string;
  unit: string | null;
  dailyQty: number;
};

export type QtyChange = {
  /** 供人閱讀的摘要。 */
  summary: string;
  /** 變更前的完整明細（JSON），使數字可回溯重建。 */
  before: string;
};

const qtyKey = (r: QtySnapshotRow) => r.workItemId ?? `x:${r.itemName}`;

/**
 * 比對數量表並產生變更描述；無異動時回 null。
 *
 * 保存**變更前**的完整明細而非變更後：變更後的值可從現況讀出，
 * 變更前的值一旦覆寫就永遠消失 —— 那才是軌跡要保住的東西。
 */
export function describeQtyChanges(
  before: QtySnapshotRow[],
  after: QtySnapshotRow[],
): QtyChange | null {
  const beforeMap = new Map(before.map((r) => [qtyKey(r), r]));
  const afterMap = new Map(after.map((r) => [qtyKey(r), r]));

  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];

  for (const [k, a] of afterMap) {
    const b = beforeMap.get(k);
    if (!b) {
      added.push(`${a.itemName} ${a.dailyQty}${a.unit ?? ""}`);
    } else if (b.dailyQty !== a.dailyQty) {
      changed.push(
        `${a.itemName} ${b.dailyQty} → ${a.dailyQty}${a.unit ?? ""}`,
      );
    }
  }
  for (const [k, b] of beforeMap) {
    if (!afterMap.has(k)) {
      removed.push(`${b.itemName} ${b.dailyQty}${b.unit ?? ""}`);
    }
  }

  if (added.length === 0 && removed.length === 0 && changed.length === 0) {
    return null;
  }

  const segs: string[] = [];
  if (changed.length > 0) segs.push(`修改 ${changed.join("、")}`);
  if (added.length > 0) segs.push(`新增 ${added.join("、")}`);
  if (removed.length > 0) segs.push(`移除 ${removed.join("、")}`);

  return {
    summary: clip(segs.join("；"), 300),
    before: JSON.stringify(before),
  };
}

/** 依是否有欄位／數量異動決定要寫哪些軌跡動作。 */
export function actionsFor(input: {
  isNew: boolean;
  fieldChanges: string | null;
  statusChanged: boolean;
  qtyChanges: QtyChange | null;
}): AuditAction[] {
  if (input.isNew) return ["CREATE"];
  const out: AuditAction[] = [];
  if (input.fieldChanges) out.push("UPDATE");
  if (input.statusChanged) out.push("STATUS");
  if (input.qtyChanges) out.push("ITEMS");
  return out;
}
