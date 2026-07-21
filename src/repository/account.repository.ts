import { prisma } from "./client";
import type { AccountRole, AccountStatus } from "@/generated/prisma/enums";

export type CreateAccountData = {
  name: string;
  email: string;
  phone?: string;
  role: AccountRole;
  status: AccountStatus;
  orgUnitId?: string;
  positionId?: string;
};

export function list() {
  return prisma.account.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: "asc" },
    include: { orgUnit: true, position: true },
  });
}

export function findByEmail(email: string) {
  return prisma.account.findUnique({ where: { email } });
}

export function create(data: CreateAccountData) {
  return prisma.account.create({ data });
}

export function setStatus(id: string, status: AccountStatus) {
  return prisma.account.update({ where: { id }, data: { status } });
}

export function softDelete(id: string) {
  return prisma.account.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}

export function restore(id: string) {
  return prisma.account.update({ where: { id }, data: { deletedAt: null } });
}

export function count() {
  return prisma.account.count({ where: { deletedAt: null } });
}
