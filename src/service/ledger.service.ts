import * as workItemRepo from "@/repository/workItem.repository";
import * as projectRepo from "@/repository/project.repository";
import * as memberRepo from "@/repository/projectMember.repository";
import { canSeeAllProjects } from "@/lib/auth";
import { WBS_CATEGORIES } from "@/constant/ledger";
import {
  anomalyRows,
  groupByWbs,
  ledgerRows,
  ledgerTotals,
  progressFromQty,
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

export type ProjectLedger = {
  projectId: string;
  projectName: string;
  projectCode: string;
  rows: LedgerRow[];
  totals: LedgerTotals;
  /** 依 WBS 類別彙整。 */
  groups: WbsGroup[];
  /** 數量互相矛盾的列。 */
  anomalies: LedgerRow[];
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

  const raw = await workItemRepo.listLedgerByProject(projectId);
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
    completedQty: num(w.completedQty),
    inspectedQty: num(w.inspectedQty),
    valuatedQty: num(w.valuatedQty),
  }));

  const rows = ledgerRows(inputs);
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
 * 一併把 progress 同步為「累計完成 ÷ 契約數量」——
 * S 曲線與履約事項上捲都讀 progress，不同步就會出現
 * 「台帳說 37%、進度曲線說 60%」而兩邊都自稱正確。
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

  const parsed = {
    contractQty: qty(input.contractQty, "契約數量"),
    unitPrice: qty(input.unitPrice, "單價"),
    completedQty: qty(input.completedQty, "累計完成量"),
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
  const derived = progressFromQty(values);

  await workItemRepo.update(id, {
    wbsCode: text(input.wbsCode),
    wbsCategory: text(input.wbsCategory),
    unit: text(input.unit),
    ...values,
    ...(derived === null ? {} : { progress: derived }),
  });
  return { ok: true };
}
