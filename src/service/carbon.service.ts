import * as carbonRepo from "@/repository/carbon.repository";
import * as memberRepo from "@/repository/projectMember.repository";
import { canSeeAllProjects } from "@/lib/auth";
import * as calc from "@/service/carbon.calc";
import type {
  AccountRole,
  CarbonScope,
  CarbonEntryStatus,
  CarbonIntensityBasis,
} from "@/generated/prisma/enums";

// Info: (20260721 - Luphia) 具身分與角色的操作者（用於權限判斷與稽核軌跡署名）
export type Actor = { id: string; name: string; role: AccountRole };

const num = (v: unknown): number => (v == null ? 0 : Number(v));
const numOrNull = (v: unknown): number | null => (v == null ? null : Number(v));

const DAY = 86_400_000;

function monthsBetween(
  start: Date | null | undefined,
  end: Date | null | undefined,
): number | null {
  if (!start || !end) return null;
  const diff = new Date(end).getTime() - new Date(start).getTime();
  if (diff <= 0) return null;
  return Math.round((diff / (DAY * 30.44)) * 10) / 10;
}

// Info: (20260721 - Luphia) 權限
export async function canAccessProject(
  projectId: string,
  actor: Actor,
): Promise<boolean> {
  if (canSeeAllProjects(actor.role)) return true;
  return Boolean(await memberRepo.exists(projectId, actor.id));
}

// Info: (20260721 - Luphia) 係數庫
export function listFactorSets() {
  return carbonRepo.listFactorSets();
}
export function listCategories() {
  return carbonRepo.listCategories();
}

export type FactorOption = {
  categoryId: string;
  scope: CarbonScope;
  name: string;
  unit: string;
  factorValue: number;
};

// Info: (20260721 - Luphia) 某係數版本下的類別+係數，供新增表單即時試算
export async function listFactorOptions(
  factorSetId: string | null | undefined,
): Promise<FactorOption[]> {
  if (factorSetId) {
    const factors = await carbonRepo.listFactorsForSet(factorSetId);
    return factors.map((f) => ({
      categoryId: f.categoryId,
      scope: f.category.scope,
      name: f.category.name,
      unit: f.unit,
      factorValue: num(f.value),
    }));
  }
  const cats = await carbonRepo.listCategories();
  return cats.map((c) => ({
    categoryId: c.id,
    scope: c.scope,
    name: c.name,
    unit: c.unit,
    factorValue: 0,
  }));
}

// Info: (20260721 - Luphia) 查詢
type EntrySlim = { scope: CarbonScope; co2e: unknown; status: CarbonEntryStatus };

function summarize(entries: EntrySlim[]) {
  return calc.summarizeEntries(
    entries.map((e) => ({
      scope: e.scope,
      co2e: num(e.co2e),
      status: e.status,
    })),
  );
}

// Info: (20260721 - Luphia) 專案的所有盤查（含各自彙總）
export async function getProjectInventories(projectId: string, actor: Actor) {
  if (!(await canAccessProject(projectId, actor))) return null;
  const inventories = await carbonRepo.listInventoriesByProject(projectId);
  return inventories.map((inv) => ({
    ...inv,
    summary: summarize(inv.entries),
  }));
}

// Info: (20260721 - Luphia) 單一盤查明細 + 彙總 + 強度 + 對比目標
export async function getInventory(id: string, actor: Actor) {
  const inv = await carbonRepo.findInventory(id);
  if (!inv) return null;
  if (!(await canAccessProject(inv.projectId, actor))) return null;

  const summary = summarize(inv.entries);
  const basis = inv.intensityBasis as CarbonIntensityBasis;
  const intensity = calc.computeIntensity({
    totalTonnes: summary.totalTonnes,
    basis,
    budget: numOrNull(inv.project.budget),
    floorArea: numOrNull(inv.project.floorArea),
    durationMonths: monthsBetween(
      inv.periodStart ?? inv.project.startDate,
      inv.periodEnd ?? inv.project.endDate,
    ),
  });
  const target = calc.assessTarget(summary.totalTonnes, numOrNull(inv.targetCo2e));

  return { inventory: inv, summary, intensity, target };
}

// Info: (20260721 - Luphia) 跨專案彙總（供 /carbon 模組）；可選 projectId 只統計單一專案
export async function crossProjectSummary(actor: Actor, projectId?: string) {
  let ids = await carbonRepo.accessibleProjectIds(
    canSeeAllProjects(actor.role),
    actor.id,
  );
  if (projectId) ids = ids.includes(projectId) ? [projectId] : [];
  const inventories = await carbonRepo.listInventoriesForProjects(ids);

  const perProject = new Map<
    string,
    { projectId: string; projectName: string; totalTonnes: number }
  >();
  let overallKg = 0;
  const byScopeKg: Record<CarbonScope, number> = {
    SCOPE_1: 0,
    SCOPE_2: 0,
    SCOPE_3: 0,
  };

  for (const inv of inventories) {
    for (const e of inv.entries) {
      const v = num(e.co2e);
      overallKg += v;
      byScopeKg[e.scope] += v;
      const cur = perProject.get(inv.projectId) ?? {
        projectId: inv.projectId,
        projectName: inv.project.name,
        totalTonnes: 0,
      };
      cur.totalTonnes += v / 1000;
      perProject.set(inv.projectId, cur);
    }
  }

  return {
    inventoryCount: inventories.length,
    totalTonnes: Math.round((overallKg / 1000) * 1000) / 1000,
    byScopeKg,
    projects: [...perProject.values()]
      .map((p) => ({ ...p, totalTonnes: Math.round(p.totalTonnes * 1000) / 1000 }))
      .sort((a, b) => b.totalTonnes - a.totalTonnes),
  };
}

// Info: (20260721 - Luphia) 盤查 CRUD
export type CreateInventoryInput = {
  projectId: string;
  name?: string;
  factorSetId?: string;
  periodStart?: string;
  periodEnd?: string;
  baselineCo2e?: string;
  targetCo2e?: string;
  intensityBasis?: string;
  note?: string;
};

const VALID_BASIS: CarbonIntensityBasis[] = [
  "CONTRACT_AMOUNT",
  "FLOOR_AREA",
  "DURATION",
];

function toDate(v?: string) {
  return v && v.trim() ? new Date(v) : null;
}
function toNum(v?: string) {
  return v != null && v.trim() !== "" && !Number.isNaN(Number(v))
    ? Number(v)
    : null;
}

export async function createInventory(input: CreateInventoryInput, actor: Actor) {
  const name = input.name?.trim();
  if (!input.projectId || !name) return null;
  if (!(await canAccessProject(input.projectId, actor))) return null;

  let factorSetId = input.factorSetId?.trim() || null;
  if (!factorSetId) {
    const def = await carbonRepo.getDefaultFactorSet();
    factorSetId = def?.id ?? null;
  }
  const basis: CarbonIntensityBasis = VALID_BASIS.includes(
    input.intensityBasis as CarbonIntensityBasis,
  )
    ? (input.intensityBasis as CarbonIntensityBasis)
    : "CONTRACT_AMOUNT";

  const inv = await carbonRepo.createInventory({
    projectId: input.projectId,
    factorSetId,
    name,
    periodStart: toDate(input.periodStart),
    periodEnd: toDate(input.periodEnd),
    baselineCo2e: toNum(input.baselineCo2e),
    targetCo2e: toNum(input.targetCo2e),
    intensityBasis: basis,
    note: input.note?.trim() || null,
  });

  await carbonRepo.createAuditLog({
    inventoryId: inv.id,
    action: "CREATE",
    actorId: actor.id,
    actorName: actor.name,
    detail: `建立盤查「${name}」`,
  });
  return inv;
}

// Info: (20260721 - Luphia) 活動數據記錄
export type AddEntryInput = {
  inventoryId: string;
  scope?: string;
  categoryId?: string;
  activityQty?: string;
  activityUnit?: string;
  workItemId?: string;
  occurredAt?: string;
  evidenceUrl?: string;
  note?: string;
  aiExtracted?: boolean;
};

const VALID_SCOPES: CarbonScope[] = ["SCOPE_1", "SCOPE_2", "SCOPE_3"];

export async function addEntry(input: AddEntryInput, actor: Actor) {
  const inv = await carbonRepo.findInventory(input.inventoryId);
  if (!inv) return null;
  if (!(await canAccessProject(inv.projectId, actor))) return null;

  const categoryId = input.categoryId?.trim();
  const qty = toNum(input.activityQty);
  if (!categoryId || qty == null) return null;

  // Info: (20260721 - Luphia) 解析係數：以本盤查採用之版本集 + 類別查得
  let factorId: string | null = null;
  let factorValue = 0;
  let unit = input.activityUnit?.trim() || "";
  if (inv.factorSetId) {
    const factor = await carbonRepo.findFactor(inv.factorSetId, categoryId);
    if (factor) {
      factorId = factor.id;
      factorValue = num(factor.value);
      if (!unit) unit = factor.unit;
    }
  }

  const scope: CarbonScope = VALID_SCOPES.includes(input.scope as CarbonScope)
    ? (input.scope as CarbonScope)
    : "SCOPE_1";

  const entry = await carbonRepo.createEntry({
    inventoryId: inv.id,
    scope,
    categoryId,
    factorId,
    workItemId: input.workItemId?.trim() || null,
    activityQty: qty,
    activityUnit: unit,
    factorValue,
    co2e: calc.computeCo2e(qty, factorValue),
    status: "DRAFT",
    aiExtracted: input.aiExtracted ?? false,
    occurredAt: toDate(input.occurredAt),
    evidenceUrl: input.evidenceUrl?.trim() || null,
    note: input.note?.trim() || null,
    createdBy: actor.id,
  });

  await carbonRepo.createAuditLog({
    inventoryId: inv.id,
    entryId: entry.id,
    action: input.aiExtracted ? "CREATE_AI" : "CREATE",
    actorId: actor.id,
    actorName: actor.name,
    toStatus: "DRAFT",
    detail: input.aiExtracted ? "費思自憑證擷取草稿" : "新增活動數據",
  });
  return entry;
}

// Info: (20260721 - Luphia) 狀態流：DRAFT → CONFIRMED → VERIFIED（含稽核軌跡）
export async function setEntryStatus(
  entryId: string,
  toStatus: CarbonEntryStatus,
  actor: Actor,
) {
  const entry = await carbonRepo.findEntry(entryId);
  if (!entry) return null;
  const inv = await carbonRepo.findInventory(entry.inventoryId);
  if (!inv) return null;
  if (!(await canAccessProject(inv.projectId, actor))) return null;

  const fromStatus = entry.status;
  const verifying = toStatus === "VERIFIED";
  await carbonRepo.updateEntry(entryId, {
    status: toStatus,
    verifiedById: verifying ? actor.id : null,
    verifiedAt: verifying ? new Date() : null,
  });
  await carbonRepo.createAuditLog({
    inventoryId: inv.id,
    entryId,
    action: verifying ? "VERIFY" : toStatus === "CONFIRMED" ? "CONFIRM" : "UPDATE",
    actorId: actor.id,
    actorName: actor.name,
    fromStatus,
    toStatus,
  });
  return true;
}

export async function removeEntry(entryId: string, actor: Actor) {
  const entry = await carbonRepo.findEntry(entryId);
  if (!entry) return null;
  const inv = await carbonRepo.findInventory(entry.inventoryId);
  if (!inv || !(await canAccessProject(inv.projectId, actor))) return null;
  await carbonRepo.softDeleteEntry(entryId);
  await carbonRepo.createAuditLog({
    inventoryId: inv.id,
    entryId,
    action: "DELETE",
    actorId: actor.id,
    actorName: actor.name,
    detail: "刪除活動數據",
  });
  return true;
}
