import { prisma } from "./client";
import type { ProjectStatus } from "@/generated/prisma/enums";

export type CreateProjectData = {
  code: string;
  name: string;
  description?: string;
  location?: string;
  contractNo?: string;
  client?: string;
  contractor?: string;
  supervisor?: string;
  budget?: number;
  startDate?: Date;
  endDate?: Date;
  status: ProjectStatus;
};

/** Partial update — only provided keys are written; null clears the field. */
export type UpdateProjectData = {
  name?: string;
  description?: string | null;
  location?: string | null;
  contractNo?: string | null;
  client?: string | null;
  contractor?: string | null;
  supervisor?: string | null;
  budget?: number | null;
  startDate?: Date | null;
  endDate?: Date | null;
  status?: ProjectStatus;
};

export function listWithCounts() {
  return prisma.project.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { workItems: true, inspections: true, defects: true } },
      milestones: {
        where: { deletedAt: null, type: "MILESTONE" },
        select: { weight: true, plannedDate: true, actualDate: true },
      },
    },
  });
}

export function listWithWorkItems() {
  return prisma.project.findMany({
    where: { deletedAt: null, workItems: { some: {} } },
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
      milestones: { where: { deletedAt: null }, orderBy: { plannedDate: "asc" } },
      paymentNodes: { orderBy: { plannedDate: "asc" } },
      documents: { where: { deletedAt: null }, orderBy: { createdAt: "desc" } },
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
