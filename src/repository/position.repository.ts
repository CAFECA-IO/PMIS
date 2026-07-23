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

// Info: modulePermissions 於此沙箱無法重新產生 Prisma Client，故以 raw SQL 讀寫。
export type PositionPermRow = {
  id: string;
  name: string;
  rank: number;
  modulePermissions: string | null;
};

export function listWithPermissions() {
  return prisma.$queryRawUnsafe<PositionPermRow[]>(
    `SELECT "id","name","rank","modulePermissions" FROM "Position"
     WHERE "deletedAt" IS NULL ORDER BY "rank" ASC, "createdAt" ASC`,
  );
}

export async function setPermissions(id: string, json: string) {
  await prisma.$executeRawUnsafe(
    `UPDATE "Position" SET "modulePermissions" = ? WHERE "id" = ?`,
    json,
    id,
  );
}

export async function getPermissions(id: string): Promise<string | null> {
  const rows = await prisma.$queryRawUnsafe<{ modulePermissions: string | null }[]>(
    `SELECT "modulePermissions" FROM "Position" WHERE "id" = ? LIMIT 1`,
    id,
  );
  return rows[0]?.modulePermissions ?? null;
}
