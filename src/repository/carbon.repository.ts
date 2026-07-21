import { prisma } from "./client";
import type {
  CarbonScope,
  CarbonEntryStatus,
  CarbonIntensityBasis,
} from "@/generated/prisma/enums";

// ── 可存取專案範圍（ADMIN/MANAGER 全部，其餘依指派）──────────
export async function accessibleProjectIds(
  seeAll: boolean,
  accountId: string,
): Promise<string[]> {
  const where = seeAll
    ? { deletedAt: null }
    : { deletedAt: null, members: { some: { accountId } } };
  const rows = await prisma.project.findMany({ where, select: { id: true } });
  return rows.map((r) => r.id);
}

// ── 排放係數版本集 / 類別 / 係數 ────────────────────────────
export function listFactorSets() {
  return prisma.emissionFactorSet.findMany({
    where: { active: true },
    orderBy: [{ isDefault: "desc" }, { year: "desc" }],
  });
}

export function getDefaultFactorSet() {
  return prisma.emissionFactorSet.findFirst({
    where: { active: true, isDefault: true },
  });
}

export function listCategories() {
  return prisma.emissionCategory.findMany({
    where: { active: true },
    orderBy: [{ scope: "asc" }, { name: "asc" }],
  });
}

export function findFactor(setId: string, categoryId: string) {
  return prisma.emissionFactor.findUnique({
    where: { setId_categoryId: { setId, categoryId } },
  });
}

export function listFactorsForSet(setId: string) {
  return prisma.emissionFactor.findMany({
    where: { setId },
    include: { category: true },
  });
}

// ── 盤查 (CarbonInventory) ──────────────────────────────────
export function listInventoriesByProject(projectId: string) {
  return prisma.carbonInventory.findMany({
    where: { projectId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    include: {
      factorSet: true,
      entries: { where: { deletedAt: null }, select: { scope: true, co2e: true, status: true } },
    },
  });
}

export function findInventory(id: string) {
  return prisma.carbonInventory.findFirst({
    where: { id, deletedAt: null },
    include: {
      project: true,
      factorSet: true,
      entries: {
        where: { deletedAt: null },
        orderBy: { createdAt: "asc" },
        include: { category: true, factor: true, workItem: true },
      },
      auditLogs: { orderBy: { createdAt: "desc" } },
    },
  });
}

export function listInventoriesForProjects(projectIds: string[]) {
  return prisma.carbonInventory.findMany({
    where: { projectId: { in: projectIds }, deletedAt: null },
    include: {
      project: true,
      entries: {
        where: { deletedAt: null },
        select: { scope: true, co2e: true, status: true },
      },
    },
  });
}

export type CreateInventoryData = {
  projectId: string;
  factorSetId?: string | null;
  name: string;
  periodStart?: Date | null;
  periodEnd?: Date | null;
  baselineCo2e?: number | null;
  targetCo2e?: number | null;
  intensityBasis?: CarbonIntensityBasis;
  note?: string | null;
};

export function createInventory(data: CreateInventoryData) {
  return prisma.carbonInventory.create({ data });
}

export function updateInventory(
  id: string,
  data: Partial<Omit<CreateInventoryData, "projectId">> & {
    verifier?: string | null;
    verifiedAt?: Date | null;
  },
) {
  return prisma.carbonInventory.update({ where: { id }, data });
}

export function softDeleteInventory(id: string) {
  return prisma.carbonInventory.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}

export function restoreInventory(id: string) {
  return prisma.carbonInventory.update({
    where: { id },
    data: { deletedAt: null },
  });
}

// ── 活動數據記錄 (CarbonEntry) ──────────────────────────────
export type CreateEntryData = {
  inventoryId: string;
  scope: CarbonScope;
  categoryId: string;
  factorId?: string | null;
  workItemId?: string | null;
  activityQty: number;
  activityUnit: string;
  factorValue: number;
  co2e: number;
  status?: CarbonEntryStatus;
  aiExtracted?: boolean;
  occurredAt?: Date | null;
  evidenceUrl?: string | null;
  note?: string | null;
  createdBy?: string | null;
};

export function createEntry(data: CreateEntryData) {
  return prisma.carbonEntry.create({ data });
}

export function findEntry(id: string) {
  return prisma.carbonEntry.findFirst({ where: { id, deletedAt: null } });
}

export function updateEntry(
  id: string,
  data: {
    status?: CarbonEntryStatus;
    verifiedById?: string | null;
    verifiedAt?: Date | null;
    note?: string | null;
  },
) {
  return prisma.carbonEntry.update({ where: { id }, data });
}

export function softDeleteEntry(id: string) {
  return prisma.carbonEntry.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}

export function restoreEntry(id: string) {
  return prisma.carbonEntry.update({
    where: { id },
    data: { deletedAt: null },
  });
}

// ── 稽核軌跡 (CarbonAuditLog) ───────────────────────────────
export type CreateAuditData = {
  inventoryId: string;
  entryId?: string | null;
  action: string;
  actorId?: string | null;
  actorName?: string | null;
  fromStatus?: CarbonEntryStatus | null;
  toStatus?: CarbonEntryStatus | null;
  detail?: string | null;
};

export function createAuditLog(data: CreateAuditData) {
  return prisma.carbonAuditLog.create({ data });
}
