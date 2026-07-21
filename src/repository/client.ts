import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@/generated/prisma/client";

/**
 * Prisma client singleton. This is the ONLY place the database client is
 * instantiated. Per the project's layering rules, it must only be imported by
 * repository modules — services, pages and components must not touch it.
 */
const databaseUrl = process.env.DATABASE_URL ?? "file:./prisma/dev.db";

function createPrismaClient() {
  const adapter = new PrismaBetterSqlite3({ url: databaseUrl });
  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as {
  prisma?: ReturnType<typeof createPrismaClient>;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
