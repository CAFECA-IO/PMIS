import { prisma } from "./client";

export type WorkflowStepInput = { order: number; positionId: string };

export function list() {
  return prisma.approvalWorkflow.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: "desc" },
    include: {
      steps: { orderBy: { order: "asc" }, include: { position: true } },
      _count: { select: { documents: true } },
    },
  });
}

export function findByIdWithSteps(id: string) {
  return prisma.approvalWorkflow.findUnique({
    where: { id },
    include: { steps: { orderBy: { order: "asc" } } },
  });
}

export function create(data: {
  name: string;
  description?: string;
  steps: WorkflowStepInput[];
}) {
  return prisma.approvalWorkflow.create({
    data: {
      name: data.name,
      description: data.description,
      steps: { create: data.steps },
    },
  });
}

export function softDelete(id: string) {
  return prisma.approvalWorkflow.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}

export function restore(id: string) {
  return prisma.approvalWorkflow.update({
    where: { id },
    data: { deletedAt: null },
  });
}

export function count() {
  return prisma.approvalWorkflow.count({ where: { deletedAt: null } });
}
