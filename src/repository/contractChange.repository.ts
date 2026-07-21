import { prisma } from "./client";

export type CreateContractChangeData = {
  projectId: string;
  sequence: number;
  description: string;
  amountAfter?: number;
  daysChanged?: number;
  approvedDate?: Date;
  docNo?: string;
};

export function create(data: CreateContractChangeData) {
  return prisma.contractChange.create({ data });
}

export function softDelete(id: string) {
  return prisma.contractChange.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}

export function restore(id: string) {
  return prisma.contractChange.update({
    where: { id },
    data: { deletedAt: null },
  });
}

export function countByProject(projectId: string) {
  return prisma.contractChange.count({
    where: { projectId, deletedAt: null },
  });
}
