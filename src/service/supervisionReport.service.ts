import * as reportRepo from "@/repository/supervisionReport.repository";
import * as memberRepo from "@/repository/projectMember.repository";
import * as inspectionRepo from "@/repository/inspection.repository";
import * as defectRepo from "@/repository/defect.repository";
import * as workItemRepo from "@/repository/workItem.repository";
import * as auditRepo from "@/repository/supervisionReportAudit.repository";
import {
  actionsFor,
  describeCreation,
  describeFieldChanges,
  describeQtyChanges,
  type ComparableFields,
  type QtySnapshotRow,
} from "@/service/report-audit";
import {
  loadDailyQtyTotals,
  loadDailyQtyTotalsUpTo,
} from "@/service/daily-qty.service";
import {
  effectiveCompletedQty,
  excludeOwnDailyQty,
  withEffectiveProgressAll,
} from "@/service/work-item-effective";
import { derivedProgress } from "@/service/obligation-rollup";
import { plannedProgressAt } from "@/service/scurve";
import { canSeeAllProjects } from "@/lib/auth";
import {
  countsTowardQty,
  reportStatusMeta,
  workStopReasonMeta,
  inspectionTypeMeta,
  inspectionResultMeta,
  defectSeverityMeta,
} from "@/constant/pmis";
import type {
  AccountRole,
  ReportStatus,
  WorkStopReason,
} from "@/generated/prisma/enums";

/**
 * 監造報表（工程日誌 PMIS-11 之「日報」）服務。
 * 日報由監造人員人工填報，不再由 AI 生成；週/月/季/年報由 AI 彙整（見 report.service）。
 */
export type Actor = { id: string; role: AccountRole; name?: string };

const VALID_STATUSES = Object.keys(reportStatusMeta) as ReportStatus[];

async function canAccess(projectId: string, actor: Actor): Promise<boolean> {
  if (canSeeAllProjects(actor.role)) return true;
  return Boolean(await memberRepo.exists(projectId, actor.id));
}

function parseStatus(v: string | undefined): ReportStatus {
  return VALID_STATUSES.includes(v as ReportStatus)
    ? (v as ReportStatus)
    : "DRAFT";
}

/** 把日報列轉成可比對的欄位表（決策 J-b）。 */
function comparable(r: {
  weather: string | null;
  summary: string | null;
  manpower: string | null;
  equipment: string | null;
  keyNotes: string | null;
  stopReason: WorkStopReason | null;
  excludedFromDuration: boolean;
  exclusionBasis: string | null;
}): ComparableFields {
  return {
    weather: r.weather,
    summary: r.summary,
    manpower: r.manpower,
    equipment: r.equipment,
    keyNotes: r.keyNotes,
    stopReason: r.stopReason,
    excludedFromDuration: r.excludedFromDuration ? "是" : "否",
    exclusionBasis: r.exclusionBasis,
  };
}

const toSnapshot = (rows: {
  workItemId: string | null;
  itemName: string;
  unit: string | null;
  dailyQty: unknown;
  note: string | null;
}[]): QtySnapshotRow[] =>
  rows.map((r) => ({
    workItemId: r.workItemId,
    itemName: r.itemName,
    unit: r.unit,
    dailyQty: Number(r.dailyQty),
    note: r.note,
  }));

/*
  停工原因的合法值取自 `workStopReasonMeta`（同 VALID_STATUSES 的作法），
  不在此另抄一份 —— enum 增減時內聯清單必然漏改，而漏改的後果是
  使用者選了新原因卻被靜默當成「當日有施工」。
*/
const VALID_STOP_REASONS = Object.keys(workStopReasonMeta) as WorkStopReason[];

/** 停工原因；空字串或未知值一律視為「當日有施工」（null）。 */
function parseStopReason(v: string | undefined): WorkStopReason | null {
  const s = v?.trim();
  if (!s) return null;
  return VALID_STOP_REASONS.includes(s as WorkStopReason)
    ? (s as WorkStopReason)
    : null;
}

export function listReports(projectId: string) {
  return reportRepo.listByProject(projectId);
}

export function listReportsInPeriod(projectId: string, start: Date, end: Date) {
  return reportRepo.listByProjectInPeriod(projectId, start, end);
}

export type ReportInput = {
  projectId: string;
  reportDate?: string;
  weather?: string;
  summary?: string;
  manpower?: string;
  equipment?: string;
  keyNotes?: string;
  status?: string;
  /** 停工原因（決策 H）；空值代表當日有施工。 */
  stopReason?: string;
  /** 是否免計工期（E5）；表單以 checkbox 送出。 */
  excludedFromDuration?: string;
  /** 免計工期的契約依據。 */
  exclusionBasis?: string;
  /** 數量表（E1）：由表單以 JSON 字串送出，見 parseQtyEntries。 */
  items?: string;
};

// ── 數量表（E1）─────────────────────────────────────────────

/** 表單一列的數量輸入（前端送來的原始形狀，尚未驗證）。 */
type RawQtyEntry = {
  workItemId?: unknown;
  itemName?: unknown;
  unit?: unknown;
  dailyQty?: unknown;
  note?: unknown;
};

/** 預帶清單的一列：工項識別與判讀所需的參考數字。 */
export type QtyFormRow = {
  workItemId: string;
  name: string;
  unit: string | null;
  contractQty: number | null;
  /**
   * 目前有效累計量（期初＋已計入的日報加總），供填寫時判斷合理性。
   *
   * **不含正在編輯的這一份日報**——否則表單上的
   * 「填報後累計 = 本欄 + 本日填報」會把同一筆量算兩次。
   */
  cumulativeQty: number | null;
  /** 本日已填的數量；新報表為 null。 */
  dailyQty: number | null;
};

/** 契約外臨時項目（不在台帳上）的既有填寫內容。 */
export type QtyExtraRow = {
  itemName: string;
  unit: string | null;
  dailyQty: number;
};

export type QtyFormData = {
  rows: QtyFormRow[];
  extras: QtyExtraRow[];
};

const toNum = (v: unknown): number | null =>
  v == null ? null : Number(v as number);

/**
 * 數量表的預帶清單。
 *
 * 開啟表單即列出該專案所有工程分項（含單位、契約數量、目前累計），
 * 監造只需在「本日完成」填數字 —— 逐格從頭輸入在實務上會導致
 * 「隨便填」或「不填」，比欄位不足更糟。
 *
 * 給定 `dateISO` 且該日已有報表時，一併帶回已填的數量以供編輯。
 */
export async function loadQtyForm(
  projectId: string,
  dateISO: string | undefined,
  actor: Actor,
): Promise<QtyFormData | null> {
  if (!(await canAccess(projectId, actor))) return null;

  const [ledger, cumulativeTotals] = await Promise.all([
    workItemRepo.listLedgerByProject(projectId),
    loadDailyQtyTotals(projectId),
  ]);

  // 該日既有報表的已填數量（若有）
  let existing: Awaited<ReturnType<typeof reportRepo.listItems>> = [];
  /** 正在編輯的這一份是否已計入累計（決策 G）。 */
  let ownAlreadyCounted = false;
  if (dateISO) {
    const date = new Date(dateISO);
    if (!Number.isNaN(date.getTime())) {
      const report = await reportRepo.findByProjectDate(projectId, date);
      if (report) {
        existing = await reportRepo.listItems(report.id);
        ownAlreadyCounted = countsTowardQty(report.status);
      }
    }
  }
  const filled = new Map(
    existing
      .filter((i) => i.workItemId)
      .map((i) => [i.workItemId as string, Number(i.dailyQty)]),
  );

  /*
    編輯一份已提送／已核備的日報時，它的數量已經在 cumulativeTotals 裡。
    「目前累計」要呈現的是「這一份以外」的累計，否則表單的
    「填報後累計 = 目前累計 + 本日填報」會重複計入同一筆量，
    連帶讓「超出契約數量」的提示誤報。草稿則本來就沒被計入，不需扣。
  */
  const baseTotals = ownAlreadyCounted
    ? excludeOwnDailyQty(cumulativeTotals, filled)
    : cumulativeTotals;

  return {
    rows: ledger.map((w) => ({
      workItemId: w.id,
      name: w.name,
      unit: w.unit,
      contractQty: toNum(w.contractQty),
      cumulativeQty: effectiveCompletedQty(
        toNum(w.completedQty),
        baseTotals.get(w.id) ?? null,
      ),
      dailyQty: filled.get(w.id) ?? null,
    })),
    // 契約外臨時項目沿用既有填寫內容（無台帳可預帶）
    extras: existing
      .filter((i) => !i.workItemId)
      .map((i) => ({
        itemName: i.itemName,
        unit: i.unit,
        dailyQty: Number(i.dailyQty),
      })),
  };
}

/**
 * 解析並驗證表單送來的數量表。
 *
 * 關鍵防護：
 *  - 台帳工項的 `itemName`／`unit` **一律以伺服器端的 WorkItem 為準**，
 *    不採信前端送來的值。單位若可由前端指定，同一工項會在不同日報用不同
 *    單位而無法加總（見 schema 對 unit 的註解）。
 *  - 不屬於本專案的 workItemId 一律丟棄，避免跨專案寫入。
 *  - 空白輸入視為未填而略過；明確輸入的 0 則保留
 *    （「今日檢視過、確實沒做」與「沒填」意義不同）。
 *  - 負數丟棄：數量表記錄的是本日完成量，倒扣應以更正該日報表處理。
 */
export async function parseQtyEntries(
  projectId: string,
  raw: string | undefined,
): Promise<reportRepo.SupervisionReportItemData[]> {
  if (!raw?.trim()) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const ledger = await workItemRepo.listLedgerByProject(projectId);
  const byId = new Map(ledger.map((w) => [w.id, w]));

  const out: reportRepo.SupervisionReportItemData[] = [];
  for (const entry of parsed as RawQtyEntry[]) {
    if (!entry || typeof entry !== "object") continue;

    const qty = Number(
      typeof entry.dailyQty === "string"
        ? entry.dailyQty.replace(/,/g, "").trim()
        : entry.dailyQty,
    );
    if (!Number.isFinite(qty) || qty < 0) continue;

    const workItemId =
      typeof entry.workItemId === "string" && entry.workItemId
        ? entry.workItemId
        : null;
    const note =
      typeof entry.note === "string" && entry.note.trim()
        ? entry.note.trim()
        : null;

    if (workItemId) {
      const w = byId.get(workItemId);
      if (!w) continue; // 非本專案工項
      out.push({
        workItemId,
        // 名稱與單位取自台帳（快照），不採信前端
        itemName: w.name,
        unit: w.unit,
        dailyQty: qty,
        note,
        sortOrder: out.length,
      });
      continue;
    }

    // 契約外臨時項目：名稱必填，單位由填報者自述
    const itemName =
      typeof entry.itemName === "string" ? entry.itemName.trim() : "";
    if (!itemName) continue;
    out.push({
      workItemId: null,
      itemName,
      unit:
        typeof entry.unit === "string" && entry.unit.trim()
          ? entry.unit.trim()
          : null,
      dailyQty: qty,
      note,
      sortOrder: out.length,
    });
  }
  return out;
}

/** 新增／更新每日監造報表（同一專案同一日期以更新處理）。 */
export async function fileReport(input: ReportInput, actor: Actor) {
  if (!input.projectId || !input.reportDate) return false;
  if (!(await canAccess(input.projectId, actor))) return false;

  const reportDate = new Date(input.reportDate);
  if (Number.isNaN(reportDate.getTime())) return false;

  const data = {
    weather: input.weather?.trim() || null,
    summary: input.summary?.trim() || null,
    manpower: input.manpower?.trim() || null,
    equipment: input.equipment?.trim() || null,
    keyNotes: input.keyNotes?.trim() || null,
    stopReason: parseStopReason(input.stopReason),
    // checkbox 未勾選時 formData 不帶該鍵，故以「有值即為真」判定
    excludedFromDuration: Boolean(input.excludedFromDuration),
    exclusionBasis: input.exclusionBasis?.trim() || null,
    status: parseStatus(input.status),
  };

  const items = await parseQtyEntries(input.projectId, input.items);

  const existing = await reportRepo.findByProjectDate(input.projectId, reportDate);
  // 變更前的內容須在覆寫前取出（決策 J-b）
  const beforeFields = existing ? comparable(existing) : null;
  const beforeItems =
    existing && input.items !== undefined
      ? toSnapshot(await reportRepo.listItems(existing.id))
      : [];

  const reportId = existing
    ? (await reportRepo.update(existing.id, data), existing.id)
    : (
        await reportRepo.create(input.projectId, {
          reportDate,
          filedBy: actor.name || null,
          ...data,
        })
      ).id;

  /*
    僅在表單確實帶了 items 欄位時才動數量表。
    未帶（undefined）代表該表單沒有數量表區塊，此時不應把既有明細清空；
    帶了空陣列則是「使用者把數量全部清掉」，屬有意為之，照實取代。
  */
  if (input.items !== undefined) {
    await reportRepo.replaceItems(reportId, items);
  }

  await writeAudit({
    reportId,
    projectId: input.projectId,
    actor,
    isNew: !existing,
    beforeFields,
    afterFields: comparable({ ...data, exclusionBasis: data.exclusionBasis }),
    fromStatus: existing?.status ?? null,
    toStatus: data.status,
    beforeItems,
    afterItems: input.items !== undefined ? toSnapshot(items) : null,
  });
  return true;
}

/**
 * 寫入變更軌跡（決策 J-b）。
 *
 * 只在確實有異動時寫入：每次儲存都記一筆會讓軌跡淹沒在雜訊裡，
 * 對帳時反而找不到真正的變更。
 */
async function writeAudit(input: {
  reportId: string;
  projectId: string;
  actor: Actor;
  isNew: boolean;
  beforeFields: ComparableFields | null;
  afterFields: ComparableFields;
  fromStatus: ReportStatus | null;
  toStatus: ReportStatus;
  beforeItems: QtySnapshotRow[];
  afterItems: QtySnapshotRow[] | null;
}): Promise<void> {
  const fieldChanges = input.beforeFields
    ? describeFieldChanges(input.beforeFields, input.afterFields)
    : null;
  const statusChanged =
    !input.isNew && input.fromStatus !== null && input.fromStatus !== input.toStatus;
  const qtyChanges = input.afterItems
    ? describeQtyChanges(input.beforeItems, input.afterItems)
    : null;

  const actions = actionsFor({
    isNew: input.isNew,
    fieldChanges,
    statusChanged,
    qtyChanges,
  });
  if (actions.length === 0) return;

  const base = {
    reportId: input.reportId,
    projectId: input.projectId,
    actorId: input.actor.id,
    actorName: input.actor.name ?? null,
  };
  await auditRepo.createMany(
    actions.map((action) => {
      if (action === "STATUS") {
        return {
          ...base,
          action,
          fromStatus: input.fromStatus,
          toStatus: input.toStatus,
        };
      }
      if (action === "ITEMS") {
        return {
          ...base,
          action,
          // 保存變更「前」的明細：變更後的值讀現況即得，變更前的一旦覆寫即永久消失
          detail: `${qtyChanges!.summary}\n${qtyChanges!.before}`,
        };
      }
      if (action === "CREATE") {
        /*
          CREATE 先前只寫下 action 而 detail 為 null（新建無「變更前」可比對），
          軌跡上只看得到「有人建了一份」。缺了初始內容與初始狀態，
          後續的「舊 → 新」就接不回起點。
        */
        return {
          ...base,
          action,
          toStatus: input.toStatus,
          detail: describeCreation(input.afterFields, input.afterItems ?? []),
        };
      }
      return { ...base, action, detail: fieldChanges };
    }),
  );
}

export async function updateReport(
  id: string,
  input: Omit<ReportInput, "projectId" | "reportDate">,
  actor: Actor,
) {
  const existing = await reportRepo.findById(id);
  if (!existing || !(await canAccess(existing.projectId, actor))) return false;
  const beforeFields = comparable(existing);
  const beforeItems =
    input.items !== undefined ? toSnapshot(await reportRepo.listItems(id)) : [];
  const nextStatus = parseStatus(input.status);
  await reportRepo.update(id, {
    weather: input.weather?.trim() || null,
    summary: input.summary?.trim() || null,
    manpower: input.manpower?.trim() || null,
    equipment: input.equipment?.trim() || null,
    keyNotes: input.keyNotes?.trim() || null,
    stopReason: parseStopReason(input.stopReason),
    // checkbox 未勾選時 formData 不帶該鍵，故以「有值即為真」判定
    excludedFromDuration: Boolean(input.excludedFromDuration),
    exclusionBasis: input.exclusionBasis?.trim() || null,
    status: parseStatus(input.status),
  });
  // 同 fileReport：未帶 items 者不動既有數量表
  const nextItems =
    input.items !== undefined
      ? await parseQtyEntries(existing.projectId, input.items)
      : null;
  if (nextItems) await reportRepo.replaceItems(id, nextItems);

  await writeAudit({
    reportId: id,
    projectId: existing.projectId,
    actor,
    isNew: false,
    beforeFields,
    afterFields: comparable({
      weather: input.weather?.trim() || null,
      summary: input.summary?.trim() || null,
      manpower: input.manpower?.trim() || null,
      equipment: input.equipment?.trim() || null,
      keyNotes: input.keyNotes?.trim() || null,
      stopReason: parseStopReason(input.stopReason),
      excludedFromDuration: Boolean(input.excludedFromDuration),
      exclusionBasis: input.exclusionBasis?.trim() || null,
    }),
    fromStatus: existing.status,
    toStatus: nextStatus,
    beforeItems,
    afterItems: nextItems ? toSnapshot(nextItems) : null,
  });
  return true;
}

export async function deleteReport(id: string, actor: Actor) {
  const existing = await reportRepo.findById(id);
  if (!existing || !(await canAccess(existing.projectId, actor))) return false;

  /*
    刪除前先保存數量明細：日報數量是月報金額的來源（決策 A），
    整份刪除會改變彙整結果，這正是最需要留下軌跡的事件。
    軌跡表刻意不設外鍵，故此紀錄在日報刪除後仍存在。
  */
  const items = toSnapshot(await reportRepo.listItems(id));
  await reportRepo.remove(id);
  await auditRepo.create({
    reportId: id,
    projectId: existing.projectId,
    action: "DELETE",
    actorId: actor.id,
    actorName: actor.name ?? null,
    fromStatus: existing.status,
    detail:
      items.length > 0
        ? `刪除日報，含數量表 ${items.length} 列\n${JSON.stringify(items)}`
        : "刪除日報（無數量表）",
  });
  return true;
}

/** 某份日報的變更軌跡（決策 J-b）。 */
export async function listReportAudit(reportId: string, actor: Actor) {
  const existing = await reportRepo.findById(reportId);
  // 日報可能已被刪除；此時改以軌跡自身的 projectId 判權限
  if (existing) {
    if (!(await canAccess(existing.projectId, actor))) return [];
    return auditRepo.listByReport(reportId);
  }
  const rows = await auditRepo.listByReport(reportId);
  if (rows.length === 0) return [];
  if (!(await canAccess(rows[0].projectId, actor))) return [];
  return rows;
}

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;

/**
 * 依專案與日期，彙整當日查驗與缺失，產生監造報表草稿（施工概況、重要事項），
 * 供日報填報時「一鍵帶入」（串接 PMIS-07）。
 */
export async function suggestReport(
  projectId: string,
  dateISO: string,
  actor: Actor,
): Promise<{ summary: string; keyNotes: string } | null> {
  if (!(await canAccess(projectId, actor))) return null;
  const target = dateISO.slice(0, 10);

  const [inspections, defects] = await Promise.all([
    inspectionRepo.listWithRelations(projectId),
    defectRepo.listWithProject(projectId),
  ]);

  const dayInspections = inspections.filter(
    (i) => ymd(new Date(i.scheduledAt)) === target,
  );
  const dayDefects = defects.filter(
    (d) => ymd(new Date(d.createdAt)) === target,
  );

  const summary =
    dayInspections.length > 0
      ? `當日查驗：${dayInspections
          .map(
            (i) =>
              `${inspectionTypeMeta[i.type].label}｜${
                i.workItem?.name ?? i.location ?? "全案"
              }（${inspectionResultMeta[i.result].label}）`,
          )
          .join("；")}。`
      : "當日無查驗紀錄。";

  const keyNotes =
    dayDefects.length > 0
      ? `當日缺失：${dayDefects
          .map(
            (d) =>
              `${d.title}（${defectSeverityMeta[d.severity].label}${
                d.workItem?.name ? `・${d.workItem.name}` : ""
              }）`,
          )
          .join("；")}。`
      : "當日無新增缺失。";

  return { summary, keyNotes };
}

// ── 當日進度（決策 C）─────────────────────────────────────

export type DailyProgress = {
  /** 當日預定累計進度（%）；無具預定起訖日的工項時為 null。 */
  planned: number | null;
  /** 截至當日的實際累計進度（%）。 */
  actual: number;
};

/**
 * 某一日的預定與實際累計進度（決策 C）。
 *
 * **兩者皆即時推導，不存欄位。**
 * 預定取自工項預定起訖日的線性展開（`plannedProgressAt`），與月報同基準（決策 I）；
 * 實際取自「期初 + Σ 截至該日的日報數量」推得的有效進度（決策 A／F）。
 *
 * 這兩個數字供監造目視判讀與繪圖，不是日報上具法律效力的載明值，故不做快照。
 * 若日後需保存核定當下的數字，應於核定時鎖定整份報表（見待定決策 J），
 * 而非零散地存欄位 —— 存了就會與數量修正後的推導值不一致。
 *
 * 注意實際進度取的是「**截至該日**」而非「截至今日」的累計：
 * 補填三個月前的日報時，該日應呈現當時的累計，
 * 否則整份歷史日報會全部顯示同一個今日數字而失去意義。
 */
export async function getDailyProgress(
  projectId: string,
  dateISO: string,
  actor: Actor,
): Promise<DailyProgress | null> {
  if (!(await canAccess(projectId, actor))) return null;
  const date = new Date(dateISO);
  if (Number.isNaN(date.getTime())) return null;
  // 當日結束時點，確保含當日的日報
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  const [rows, totalsToDate] = await Promise.all([
    workItemRepo.listDetailByProject(projectId),
    loadDailyQtyTotalsUpTo(projectId, endOfDay),
  ]);
  const items = withEffectiveProgressAll(rows, totalsToDate);

  return {
    planned: plannedProgressAt(items, endOfDay),
    actual: derivedProgress(items),
  };
}
