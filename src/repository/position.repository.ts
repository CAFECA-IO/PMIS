import { prisma } from "./client";

export type CreatePositionData = {
  name: string;
  rank?: number;
};

export function list() {
  return prisma.position.findMany({
    where: { deletedAt: null },
    orderBy: [{ rank: "asc" }, { createdAt: "asc" }],
    include: { _count: { select: { accounts: true } } },
  });
}

export function create(data: CreatePositionData) {
  return prisma.position.create({ data });
}

export function softDelete(id: string) {
  return prisma.position.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}

export function restore(id: string) {
  return prisma.position.update({ where: { id }, data: { deletedAt: null } });
}

export function count() {
  return prisma.position.count({ where: { deletedAt: null } });
}
