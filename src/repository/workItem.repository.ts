import { prisma } from "./client";

export function count() {
  return prisma.workItem.count({ where: { project: { deletedAt: null } } });
}
