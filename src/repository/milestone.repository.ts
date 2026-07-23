import { prisma } from "./client";
import type { MilestoneType } from "@/generated/prisma/enums";

export type CreateMilestoneData = {
  projectId: string;
  name: string;
  type: MilestoneType;
  plannedDate?: Date;
  actualDate?: Date;
  weight?: number;
  commissioning?: boolean;
  docNo?: string;
  note?: string;
};

export function create(data: CreateMilestoneData) {
  return prisma.milestone.create({ data });
}

export function findById(id: string) {
  return prisma.milestone.findUnique({
    where: { id },
    select: { id: true, projectId: true, type: true },
  });
}

/** Milestones used for progress metrics (實績型，排除展延與已刪除)。 */
export function listForMetrics() {
  return prisma.milestone.findMany({
    where: {
      deletedAt: null,
      type: "MILESTONE",
      project: { deletedAt: null },
    },
    select: {
      id: true,
      weight: true,
      plannedDate: true,
      actualDate: true,
      commissioning: true,
    },
  });
}

export function softDelete(id: string) {
  return prisma.milestone.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}

export function restore(id: string) {
  return prisma.milestone.update({ where: { id }, data: { deletedAt: null } });
}
