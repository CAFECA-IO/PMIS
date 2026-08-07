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

/**
 * 數量表一列（比對與留存用的最小欄位）。
 *
 * `unit` 與 `note` 為必填而非選填：只比對 `dailyQty` 曾使「只改單位或備註」
 * 完全不留痕 —— 單位變更會讓同一工項新舊列量綱不一致，
 * 備註則常是免計工期或數量異常的唯一書面理由，兩者都必須進軌跡。
 * 型別上要求傳入，可避免呼叫端在建快照時靜默漏掉欄位。
 */
export type QtySnapshotRow = {
  workItemId: string | null;
  itemName: string;
  unit: string | null;
  dailyQty: number;
  note: string | null;
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
      continue;
    }
    // 數量、單位、備註各自比對：只看數量會讓改單位／改備註完全不留痕
    const diffs: string[] = [];
    if (b.dailyQty !== a.dailyQty) {
      diffs.push(`${b.dailyQty} → ${a.dailyQty}${a.unit ?? ""}`);
    }
    if ((b.unit ?? "") !== (a.unit ?? "")) {
      diffs.push(`單位 ${show(b.unit)} → ${show(a.unit)}`);
    }
    if ((b.note ?? "") !== (a.note ?? "")) {
      diffs.push(`備註 ${clip(show(b.note))} → ${clip(show(a.note))}`);
    }
    if (diffs.length > 0) changed.push(`${a.itemName} ${diffs.join("、")}`);
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

/**
 * 建立一份日報時的初始內容描述。
 *
 * CREATE 若只記「有人建了一份日報」而不記內容，等於沒記：
 * 之後每次 UPDATE 都以「舊 → 新」表達，缺了起點就無法把一份日報的
 * 歷史接起來，也無從說明月報數字最初從何而來。
 *
 * 記錄的是**值**而非欄位名 —— 「填了天氣」與「天氣＝雨」在展延爭議中
 * 意義相差甚遠。
 */
export function describeCreation(
  fields: ComparableFields,
  items: QtySnapshotRow[],
): string {
  const vals = Object.keys(fields)
    .filter((k) => (fields[k] ?? "").trim() !== "")
    .map((k) => `${FIELD_LABELS[k] ?? k}：${clip(fields[k] as string)}`);

  const itemPart =
    items.length > 0
      ? `數量表 ${items.length} 項：${items
          .map((i) => `${i.itemName} ${i.dailyQty}${i.unit ?? ""}`)
          .join("、")}`
      : "數量表無資料";

  const body = [...vals, itemPart].join("；");
  return clip(`建立日報｜${body}`, 500);
}

/**
 * 刪除一份日報時的完整描述。
 *
 * 刪除是唯一「內容自此消失」的動作，因此軌跡必須自帶重建所需的一切：
 *  - **日期**：本表無外鍵，刪除後 `reportId` 已無對應；
 *    月報金額變動時要問的第一個問題就是「哪一天的量不見了」。
 *  - **免計工期宣告**：那是監造依契約條款的宣告，在工期展延爭議中有金額意義，
 *    被刪掉卻沒留紀錄的話，後續無從證明曾經宣告過。
 *  - **完整快照（JSON）**：欄位與數量表一併保存，內容才真的可回溯重建。
 *
 * 回傳 `{ summary, before }`，與數量表軌跡同形狀：摘要給人看，JSON 供重建。
 */
export function describeDeletion(input: {
  reportDateLabel: string;
  statusLabel: string;
  fields: ComparableFields;
  items: QtySnapshotRow[];
}): QtyChange {
  const parts = [`刪除 ${input.reportDateLabel} 日報（狀態：${input.statusLabel}）`];

  // 免計工期一律列示，即使為「否」—— 沒有宣告本身也是需要留存的事實
  const excluded = (input.fields.excludedFromDuration ?? "").trim();
  const basis = (input.fields.exclusionBasis ?? "").trim();
  parts.push(`免計工期：${excluded || "未載明"}${basis ? `（${basis}）` : ""}`);

  const stop = (input.fields.stopReason ?? "").trim();
  if (stop) parts.push(`停工原因：${stop}`);

  parts.push(
    input.items.length > 0
      ? `含數量表 ${input.items.length} 列：${input.items
          .map((i) => `${i.itemName} ${i.dailyQty}${i.unit ?? ""}`)
          .join("、")}`
      : "無數量表",
  );

  return {
    summary: clip(parts.join("；"), 500),
    before: JSON.stringify({ fields: input.fields, items: input.items }),
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
