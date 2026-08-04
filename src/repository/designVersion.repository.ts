import { prisma } from "./client";

/**
 * 3D 施工設計版本。
 *
 * 每次費思生成或修訂都留下一版，供使用者切換、基於某版繼續更新或完全重做。
 */

export type CreateDesignVersionData = {
  projectId: string;
  html: string;
  design: string;
  summary?: string | null;
  instruction?: string | null;
  baseVersion?: number | null;
  createdById?: string | null;
};

/** 版本清單（新版在前）。刻意不取 html —— 清單只需要標題與時間，
 *  一次把數十 KB 的網頁全撈出來會讓頁面初次載入變慢。 */
export function listByProject(projectId: string) {
  return prisma.designVersion.findMany({
    where: { projectId, deletedAt: null },
    orderBy: { version: "desc" },
    select: {
      id: true,
      version: true,
      design: true,
      summary: true,
      instruction: true,
      baseVersion: true,
      createdAt: true,
      createdBy: { select: { name: true } },
    },
  });
}

/** 取單一版本的完整內容（含 html）。 */
export function findById(id: string) {
  return prisma.designVersion.findFirst({
    where: { id, deletedAt: null },
  });
}

/** 取某專案的指定版號。 */
export function findByVersion(projectId: string, version: number) {
  return prisma.designVersion.findFirst({
    where: { projectId, version, deletedAt: null },
  });
}

/** 該專案目前的最大版號；尚無版本時回 0。 */
export async function maxVersion(projectId: string): Promise<number> {
  const latest = await prisma.designVersion.findFirst({
    where: { projectId },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  return latest?.version ?? 0;
}

/**
 * 新增一版。
 *
 * 版號由目前最大值 +1；並發下若撞號（unique 約束）則重試，
 * 讓兩人同時生成不會有一邊直接失敗。
 */
export async function create(data: CreateDesignVersionData) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const next = (await maxVersion(data.projectId)) + 1;
    try {
      return await prisma.designVersion.create({
        data: {
          projectId: data.projectId,
          version: next,
          html: data.html,
          design: data.design,
          summary: data.summary ?? null,
          instruction: data.instruction ?? null,
          baseVersion: data.baseVersion ?? null,
          createdById: data.createdById ?? null,
        },
      });
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code !== "P2002") throw error; // 非撞號的錯誤照實拋出
    }
  }
  throw new Error("版本號配置失敗，請重試。");
}

/** 軟刪除一版。 */
export function softDelete(id: string) {
  return prisma.designVersion.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}
