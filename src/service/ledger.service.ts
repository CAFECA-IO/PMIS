import * as workItemRepo from "@/repository/workItem.repository";
import * as projectRepo from "@/repository/project.repository";
import * as memberRepo from "@/repository/projectMember.repository";
import * as supervisionRepo from "@/repository/supervisionReport.repository";
import {
  loadDailyQtyTotals,
  loadPendingDailyQtyTotals,
} from "@/service/daily-qty.service";
import { withEffectiveQtyAll } from "@/service/work-item-effective";
import { canSeeAllProjects } from "@/lib/auth";
import { WBS_CATEGORIES } from "@/constant/ledger";
import {
  anomalyRows,
  groupByWbs,
  ledgerRows,
  ledgerTotals,
  type LedgerRow,
  type LedgerRowInput,
  type LedgerTotals,
  type WbsGroup,
} from "@/service/work-item-ledger";
import type { AccountRole } from "@/generated/prisma/enums";

/**
 * 詳細工項數量與估驗台帳。
 *
 * 台帳把「契約怎麼計價」與「實際做到哪裡」放在同一張表上：
 * 契約數量 × 單價是應得的，累計完成是做了的，查驗合格是驗過的，
 * 累計估驗是請領過的。四者之間的落差就是每期對帳要談的事。
 *
 * 所有推導（複價、完成率、狀態、彙整）都在 work-item-ledger（純函式、有測試），
 * 本層只負責權限、取數與寫回。
 */

export type Viewer = { id: string; role: AccountRole };

async function canAccess(projectId: string, viewer: Viewer): Promise<boolean> {
  if (canSeeAllProjects(viewer.role)) return true;
  return Boolean(await memberRepo.exists(projectId, viewer.id));
}

/** Prisma 的 Decimal 不是 number；直接運算會得到字串相接的結果。 */
function num(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * 台帳一列，外加「尚未計入的草稿數量」（決策 G 的可見性配套）。
 *
 * pendingQty 純為畫面提示，不參與任何累計、金額或狀態推導 ——
 * 它代表「已填但還不算數」的量，混入運算會讓草稿影響正式數字。
 */
export type LedgerRowWithPending = LedgerRow & {
  /** 尚未計入累計的數量（來自草稿日報）；無則 null。 */
  pendingQty: number | null;
  /**
   * 期初累計完成量，即 `WorkItem.completedQty` 的**原始欄位值**（決策 A）。
   *
   * 本列的 `completedQty` 已被 `withEffectiveQtyAll` 換成有效累計
   * （期初＋日報加總），是推導值。編輯表單一律回寫本欄而非 `completedQty`
   * —— 把有效累計寫回期初，等於每存一次檔就讓期初再吃一次日報加總，
   * 累計會一路翻倍而使用者從未輸入過那些數字。
   */
  openingQty: number | null;
};

export type ProjectLedger = {
  projectId: string;
  projectName: string;
  projectCode: string;
  rows: LedgerRowWithPending[];
  totals: LedgerTotals;
  /** 依 WBS 類別彙整。 */
  groups: WbsGroup[];
  /** 數量互相矛盾的列。 */
  anomalies: LedgerRowWithPending[];
  /** 尚未填入契約數量的列數（台帳完整度）。 */
  unpriced: number;
};

/** 取整本台帳；無權存取或找不到專案時回 null。 */
export async function getProjectLedger(
  projectId: string,
  viewer: Viewer,
): Promise<ProjectLedger | null> {
  if (!(await canAccess(projectId, viewer))) return null;
  const project = await projectRepo.findBasic(projectId);
  if (!project) return null;

  const [raw, dailyTotals, pendingTotals] = await Promise.all([
    workItemRepo.listLedgerByProject(projectId),
    loadDailyQtyTotals(projectId),
    loadPendingDailyQtyTotals(projectId),
  ]);
  const inputs: LedgerRowInput[] = raw.map((w) => ({
    id: w.id,
    code: w.code,
    name: w.name,
    unit: w.unit,
    wbsCode: w.wbsCode,
    // 未指定 WBS 類別時退回既有的 category 欄位，讓舊資料也能彙整
    wbsCategory: w.wbsCategory ?? null,
    contractQty: num(w.contractQty),
    unitPrice: num(w.unitPrice),
    // completedQty 欄位自決策 A 起為「期初」；當前累計為期初＋日報加總
    completedQty: num(w.completedQty),
    inspectedQty: num(w.inspectedQty),
    valuatedQty: num(w.valuatedQty),
  }));

  /*
    以有效累計量取代期初值後才交給推導函式。

    ledgerRow 及其下的金額、完成率、估驗狀態、異常判定全部以參數接收數量，
    因此這一行就讓整本台帳改以日報為準，推導邏輯本身零改動（決策 A）。
  */
  // 期初原值另存一份：換算後 completedQty 即為推導值，編輯表單需要的是期初
  const openingById = new Map(inputs.map((i) => [i.id, i.completedQty]));

  const rows: LedgerRowWithPending[] = ledgerRows(
    withEffectiveQtyAll(inputs, dailyTotals),
  ).map((r) => ({
    ...r,
    pendingQty: pendingTotals.get(r.id) ?? null,
    openingQty: openingById.get(r.id) ?? null,
  }));
  return {
    projectId,
    projectName: project.name,
    projectCode: project.code,
    rows,
    totals: ledgerTotals(rows),
    groups: groupByWbs(rows, WBS_CATEGORIES),
    anomalies: anomalyRows(rows),
    unpriced: rows.filter((r) => r.contractQty === null).length,
  };
}

export type LedgerQtyInput = {
  wbsCode?: string;
  wbsCategory?: string;
  unit?: string;
  contractQty?: string;
  unitPrice?: string;
  completedQty?: string;
  inspectedQty?: string;
  valuatedQty?: string;
};

export type MutationResult = { ok: true } | { ok: false; error: string };

/** 數量字串轉數值；空白視為清空（null），不合法則拒絕。 */
function qty(
  value: string | undefined,
  label: string,
): { ok: true; value: number | null } | { ok: false; error: string } {
  if (value === undefined) return { ok: true, value: null };
  const s = value.trim();
  if (s === "") return { ok: true, value: null };
  const n = Number(s.replace(/,/g, ""));
  if (!Number.isFinite(n)) return { ok: false, error: `${label}不是有效數字。` };
  if (n < 0) return { ok: false, error: `${label}不可為負數。` };
  return { ok: true, value: n };
}

const text = (v: string | undefined) => {
  const s = v?.trim() ?? "";
  return s === "" ? null : s;
};

/**
 * 更新一列台帳的數量與單價。
 *
 * 此處輸入的 `completedQty` 自決策 A 起是**期初累計量**（開始以日報填報
 * 之前的基準），不是當前累計 —— 當前累計為期初＋日報加總，不回寫欄位。
 *
 * **不回寫 `progress`**（決策 F）。進度改由取數時推導：
 * 累計量會隨日報填報隨時改變，若在此存一份推導值，任何一個寫入路徑
 * 忘了重算就會出現「日報已更新、S 曲線仍是舊值」而兩邊都自稱正確。
 * 下游（上捲、S 曲線）一律經 `withEffectiveProgress` 換算後才使用，
 * 故此處只需保存數量本身。
 */
export async function updateLedgerQty(
  id: string,
  input: LedgerQtyInput,
  viewer: Viewer,
): Promise<MutationResult> {
  const existing = await workItemRepo.findById(id);
  if (!existing) return { ok: false, error: "找不到此工程分項。" };
  if (!(await canAccess(existing.projectId, viewer))) {
    return { ok: false, error: "無權編輯此工程分項。" };
  }

  /*
    ── 單位變更守門（決策 L）────────────────────────────────
    日報數量列的 unit 是建立當下自 WorkItem.unit 取的快照。
    若該工項已有日報列之後才改單位，新舊列量綱不同卻照樣加總，
    而台帳上每一列看起來都很正常 —— 這正是知識庫審閱清單警告過的失效樣態
    （單位為規則推斷、未經查證，審閱中會有大量 m→m2 這類修正）。
    故已有日報列時禁止改單位，而非事後才發現數字對不起來。
  */
  const nextUnit = text(input.unit);
  if (input.unit !== undefined && nextUnit !== existing.unit) {
    const used = await supervisionRepo.countItemsByWorkItem(id);
    if (used > 0) {
      return {
        ok: false,
        error:
          `此工項已有 ${used} 筆日報數量紀錄，變更單位會使新舊紀錄量綱不一致而無法加總。` +
          `如確需更正單位，請先確認既有紀錄之量綱並修正該些日報，或改以新增工項處理。`,
      };
    }
  }

  const parsed = {
    contractQty: qty(input.contractQty, "契約數量"),
    unitPrice: qty(input.unitPrice, "單價"),
    // 標籤刻意寫「期初」：此欄自決策 A 起不是當前累計，錯誤訊息也應這樣講
    completedQty: qty(input.completedQty, "期初完成量"),
    inspectedQty: qty(input.inspectedQty, "查驗合格量"),
    valuatedQty: qty(input.valuatedQty, "累計估驗量"),
  };
  for (const p of Object.values(parsed)) {
    if (!p.ok) return { ok: false, error: p.error };
  }

  const values = {
    contractQty: parsed.contractQty.ok ? parsed.contractQty.value : null,
    unitPrice: parsed.unitPrice.ok ? parsed.unitPrice.value : null,
    completedQty: parsed.completedQty.ok ? parsed.completedQty.value : null,
    inspectedQty: parsed.inspectedQty.ok ? parsed.inspectedQty.value : null,
    valuatedQty: parsed.valuatedQty.ok ? parsed.valuatedQty.value : null,
  };

  /*
    數量之間的矛盾不在此擋下 —— 台帳的用途之一就是「把矛盾顯示出來」。
    現場常先量到完成量、隔幾天才補查驗紀錄，過程中本來就會不一致；
    此時拒絕輸入只會逼使用者亂填以通過檢核。差異異常頁負責讓它被看見。
  */

  await workItemRepo.update(id, {
    wbsCode: text(input.wbsCode),
    wbsCategory: text(input.wbsCategory),
    unit: text(input.unit),
    ...values,
  });
  return { ok: true };
}
