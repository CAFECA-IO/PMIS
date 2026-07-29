import { prisma } from "./client";

/** 契約履約標的的資料存取。 */

export function listByProject(projectId: string) {
  return prisma.contractScopeItem.findMany({
    where: { projectId, deletedAt: null },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      code: true,
      title: true,
      sourceClause: true,
      sortOrder: true,
      _count: { select: { obligations: true, workItems: true } },
    },
  });
}

export function create(data: {
  projectId: string;
  code?: string | null;
  title: string;
  sourceClause?: string | null;
  sortOrder: number;
}) {
  return prisma.contractScopeItem.create({ data });
}

/**
 * 整批建立並回傳「名稱 → id」對照。
 *
 * 履約事項與工程分項是以「標的名稱」參照來源的（模型只認得名稱），
 * 寫入時需要換成 id，故一次建立並回傳對照表。
 */
export async function createMany(
  projectId: string,
  items: { code?: string | null; title: string; sourceClause?: string | null }[],
): Promise<Map<string, string>> {
  const idByTitle = new Map<string, string>();
  let order = 0;
  for (const item of items) {
    const title = item.title?.trim();
    if (!title || idByTitle.has(title)) continue; // 同名視為同一項
    const row = await create({
      projectId,
      code: item.code?.trim() || null,
      title,
      sourceClause: item.sourceClause?.trim() || null,
      sortOrder: order,
    });
    order += 1;
    idByTitle.set(title, row.id);
  }
  return idByTitle;
}

export function softDelete(projectId: string, id: string) {
  return prisma.contractScopeItem.updateMany({
    where: { id, projectId, deletedAt: null },
    data: { deletedAt: new Date() },
  });
}
