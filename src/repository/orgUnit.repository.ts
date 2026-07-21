import { prisma } from "./client";

export type CreateOrgUnitData = {
  name: string;
  code?: string;
  parentId?: string;
};

export function list() {
  return prisma.orgUnit.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { accounts: true } } },
  });
}

export function create(data: CreateOrgUnitData) {
  return prisma.orgUnit.create({ data });
}

export function softDelete(id: string) {
  return prisma.orgUnit.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}

export function restore(id: string) {
  return prisma.orgUnit.update({ where: { id }, data: { deletedAt: null } });
}

export function count() {
  return prisma.orgUnit.count({ where: { deletedAt: null } });
}
