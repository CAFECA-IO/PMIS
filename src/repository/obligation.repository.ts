import { prisma } from "./client";
import type {
  ObligationRisk,
  ObligationStage,
  ObligationStatus,
  ObligationTrigger,
} from "@/generated/prisma/enums";

/** 履約事項的資料存取。 */

export type CreateObligationData = {
  /** 推導來源的契約履約標的。 */
  scopeItemId?: string | null;
  projectId: string;
  code: string;
  title: string;
  stage: ObligationStage;
  risk?: ObligationRisk;
  triggerType?: ObligationTrigger;
  status?: ObligationStatus;
  dueDate?: Date;
  actualDate?: Date;
  ownerUnit?: string;
  ownerName?: string;
  contractBasis?: string;
  weight?: number;
  commissioning?: boolean;
  offsetDays?: number;
  docNo?: string;
  note?: string;
  relativeAnchor?: string | null;
  predecessorId?: string | null;
  conditionKind?: string | null;
  conditionDetail?: string | null;
  dueDateOverridden?: boolean;
};

export function create(data: CreateObligationData) {
  return prisma.contractObligation.create({ data });
}

export function findById(id: string) {
  return prisma.contractObligation.findUnique({
    where: { id },
    select: { id: true, projectId: true, stage: true, status: true },
  });
}

/** 畫面用的完整清單（含專案名稱，供跨專案檢視）。以可存取專案 id 收斂範圍。 */
export function listForView(projectIds: string[]) {
  return prisma.contractObligation.findMany({
    where: {
      deletedAt: null,
      projectId: { in: projectIds },
      project: { deletedAt: null },
    },
    select: {
      id: true,
      projectId: true,
      code: true,
      title: true,
      stage: true,
      risk: true,
      triggerType: true,
      status: true,
      dueDate: true,
      actualDate: true,
      ownerUnit: true,
      ownerName: true,
      contractBasis: true,
      project: { select: { name: true } },
    },
    orderBy: { code: "asc" },
  });
}

/**
 * 單一履約事項的完整內容（供細節頁檢視與編輯）。
 *
 * listForView 只挑清單需要的欄位，缺了 weight、note、docNo 等；
 * 編輯表單必須拿到全部欄位，否則使用者一存檔就把沒送出的欄位清空。
 */
export function findDetail(id: string) {
  return prisma.contractObligation.findFirst({
    where: { id, deletedAt: null },
    include: {
      project: { select: { id: true, code: true, name: true } },
      scopeItem: { select: { id: true, code: true, title: true } },
    },
  });
}

/**
 * 同專案全部事項的觸發相關欄位。
 *
 * 推算期限需要：前置事項的期限（可能再往上串）、以及誰以誰為前置
 * （用於擋下循環相依）。一次取回整個專案比逐項追鏈省往返。
 */
export function listTriggerScope(projectId: string) {
  return prisma.contractObligation.findMany({
    where: { projectId, deletedAt: null },
    select: {
      id: true,
      code: true,
      title: true,
      dueDate: true,
      actualDate: true,
      predecessorId: true,
    },
    orderBy: { code: "asc" },
  });
}

/**
 * 指定事項的前置關係（供甘特圖畫依存線）。
 *
 * 不併進 listForView 的 select：那裡多一個未知欄位會讓整個 select 失效，
 * 連帶把 project 這類關聯一起弄掉，錯誤訊息還會指向無關的地方。
 */
export function listPredecessors(ids: string[]) {
  if (ids.length === 0) {
    return Promise.resolve([] as { id: string; predecessorId: string | null }[]);
  }
  return prisma.contractObligation.findMany({
    where: { id: { in: ids } },
    select: { id: true, predecessorId: true },
  });
}

/** 同專案的其他履約事項（供編輯時挑選歸屬用的參照）。 */
export function listOptionsByProject(projectId: string) {
  return prisma.contractObligation.findMany({
    where: { projectId, deletedAt: null },
    select: { id: true, code: true, title: true },
    orderBy: { code: "asc" },
  });
}

/** 進度指標用（排除已刪除與已刪除專案）。 */
export function listForMetrics() {
  return prisma.contractObligation.findMany({
    where: {
      deletedAt: null,
      project: { deletedAt: null },
    },
    select: {
      id: true,
      weight: true,
      dueDate: true,
      actualDate: true,
      commissioning: true,
    },
  });
}

/** 標記完成：寫入實際完成日並轉為 DONE。 */
export function markDone(id: string, actualDate: Date = new Date()) {
  return prisma.contractObligation.update({
    where: { id },
    data: { actualDate, status: "DONE" },
  });
}

export function update(id: string, data: Partial<CreateObligationData>) {
  return prisma.contractObligation.update({ where: { id }, data });
}

/**
 * 細節頁的編輯寫回。
 *
 * 與 update 的差別是可寫入 null —— 清空責任人、期限、備註等欄位是常見操作，
 * Partial 的 undefined 在 Prisma 代表「不改」，用它就永遠清不掉既有值。
 */
export type UpdateObligationDetailData = {
  code: string;
  title: string;
  stage: ObligationStage;
  risk: ObligationRisk;
  triggerType: ObligationTrigger;
  status: ObligationStatus;
  dueDate: Date | null;
  actualDate: Date | null;
  ownerUnit: string | null;
  ownerName: string | null;
  contractBasis: string | null;
  weight: number;
  commissioning: boolean;
  offsetDays: number | null;
  docNo: string | null;
  note: string | null;
  /** 觸發設定。 */
  relativeAnchor: string | null;
  predecessorId: string | null;
  conditionKind: string | null;
  conditionDetail: string | null;
  dueDateOverridden: boolean;
};

export function updateDetail(id: string, data: UpdateObligationDetailData) {
  return prisma.contractObligation.update({ where: { id }, data });
}

/** 同專案內以管制編號查（供改編號時檢查重複）。 */
export function findByProjectCode(projectId: string, code: string) {
  return prisma.contractObligation.findFirst({
    where: { projectId, code, deletedAt: null },
    select: { id: true },
  });
}

export function softDelete(id: string) {
  return prisma.contractObligation.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}

export function restore(id: string) {
  return prisma.contractObligation.update({
    where: { id },
    data: { deletedAt: null },
  });
}
