import { prisma } from "./client";
import type { ProjectStatus } from "@/generated/prisma/enums";

export type CreateProjectData = {
  code: string;
  name: string;
  description?: string;
  /** 關鍵要求重點：影響施工方式的契約／規範條件。 */
  keyRequirements?: string;
  location?: string;
  contractNo?: string;
  client?: string;
  contractor?: string;
  supervisor?: string;
  budget?: number;
  startDate?: Date;
  endDate?: Date;
  signedDate?: Date | undefined;
  noticeDate?: Date | undefined;
  status: ProjectStatus;
};

/** Partial update — only provided keys are written; null clears the field. */
export type UpdateProjectData = {
  name?: string;
  description?: string | null;
  keyRequirements?: string | null;
  location?: string | null;
  contractNo?: string | null;
  client?: string | null;
  contractor?: string | null;
  supervisor?: string | null;
  budget?: number | null;
  startDate?: Date | null;
  endDate?: Date | null;
  signedDate?: Date | null | undefined;
  noticeDate?: Date | null | undefined;
  status?: ProjectStatus;
};

export function listWithCounts() {
  return prisma.project.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { workItems: true, inspections: true, defects: true } },
      obligations: {
        where: { deletedAt: null },
        select: { id: true, weight: true, dueDate: true, actualDate: true },
      },
    },
  });
}

export function listWithCountsForAccount(accountId: string) {
  return prisma.project.findMany({
    where: { deletedAt: null, members: { some: { accountId } } },
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { workItems: true, inspections: true, defects: true } },
      obligations: {
        where: { deletedAt: null },
        select: { id: true, weight: true, dueDate: true, actualDate: true },
      },
    },
  });
}

/** 側邊欄專案切換用的輕量欄位（含簡介所需資訊）。 */
const OPTION_SELECT = {
  id: true,
  code: true,
  name: true,
  status: true,
  client: true,
  location: true,
  description: true,
  startDate: true,
  endDate: true,
} as const;

/** 輕量清單，供側邊欄專案切換顯示用。 */
export function listOptions() {
  return prisma.project.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: "desc" },
    select: OPTION_SELECT,
  });
}

/** 輕量清單（限指定帳號為成員之專案）。 */
export function listOptionsForAccount(accountId: string) {
  return prisma.project.findMany({
    where: { deletedAt: null, members: { some: { accountId } } },
    orderBy: { createdAt: "desc" },
    select: OPTION_SELECT,
  });
}

export function listWithWorkItems(projectId?: string) {
  return prisma.project.findMany({
    where: {
      deletedAt: null,
      workItems: { some: {} },
      ...(projectId ? { id: projectId } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: { workItems: { orderBy: { createdAt: "asc" } } },
  });
}

export function findByIdWithRelations(id: string) {
  return prisma.project.findFirst({
    where: { id, deletedAt: null },
    include: {
      workItems: { orderBy: { createdAt: "asc" } },
      inspections: {
        orderBy: { scheduledAt: "desc" },
        include: { workItem: true },
      },
      defects: { orderBy: { createdAt: "desc" } },
      contractChanges: {
        where: { deletedAt: null },
        orderBy: { sequence: "asc" },
      },
      obligations: { where: { deletedAt: null }, orderBy: { dueDate: "asc" } },
      paymentNodes: { orderBy: { plannedDate: "asc" } },
      documents: { where: { deletedAt: null }, orderBy: { createdAt: "desc" } },
      members: {
        orderBy: { createdAt: "asc" },
        include: { account: { include: { orgUnit: true, position: true } } },
      },
    },
  });
}

/** 專案的基本識別（不撈關聯，供只需要名稱與代碼的畫面使用）。 */
export function findBasic(id: string) {
  return prisma.project.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, code: true, name: true, status: true },
  });
}

/** 排程基準日期（供履約事項的相對期限推算）。 */
export function findScheduleDates(id: string) {
  return prisma.project.findFirst({
    where: { id, deletedAt: null },
    select: {
      startDate: true,
      endDate: true,
      signedDate: true,
      noticeDate: true,
    },
  });
}

export function findByCode(code: string) {
  return prisma.project.findUnique({ where: { code } });
}

export function create(data: CreateProjectData) {
  return prisma.project.create({ data });
}

export function update(id: string, data: UpdateProjectData) {
  return prisma.project.update({ where: { id }, data });
}

export function softDelete(id: string) {
  return prisma.project.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}

export function restore(id: string) {
  return prisma.project.update({ where: { id }, data: { deletedAt: null } });
}

export function count() {
  return prisma.project.count({ where: { deletedAt: null } });
}

export function countByStatus(status: ProjectStatus) {
  return prisma.project.count({ where: { status, deletedAt: null } });
}

/**
 * 重複檢查用的比對資料。
 *
 * 刻意獨立一支而非擴充 listWithCounts：Prisma 的 select 只要出現一個
 * 不存在的鍵，整份 select 就失效，錯誤還會指向無關的行 ——
 * 混進既有查詢會讓那支跟著壞掉，且症狀難以歸因。
 *
 * 檔名一併撈出（費思歸檔與檔案管理兩處），供「同一份契約已被別的專案用過」
 * 的判斷。只取檔名，不取內容。
 */
export function listForDuplicateCheck() {
  return prisma.project.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      code: true,
      name: true,
      contractNo: true,
      client: true,
      startDate: true,
      endDate: true,
      faithUploads: {
        where: { deletedAt: null },
        select: { fileName: true },
      },
      projectFiles: {
        where: { deletedAt: null },
        select: { fileName: true },
      },
    },
  });
}
