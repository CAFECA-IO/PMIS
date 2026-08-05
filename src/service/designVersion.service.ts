import * as designRepo from "@/repository/designVersion.repository";
import * as memberRepo from "@/repository/projectMember.repository";
import { canSeeAllProjects } from "@/lib/auth";
import type { AccountRole } from "@/generated/prisma/enums";

export type Actor = { id: string; role: AccountRole };

/** 費思產出的結構化施工設計。 */
export type DesignPayload = {
  reply?: string;
  workItems: unknown[];
  milestones: unknown[];
};

/** 供前端顯示的版本摘要（不含 html）。 */
export type DesignVersionSummary = {
  id: string;
  version: number;
  summary: string | null;
  instruction: string | null;
  baseVersion: number | null;
  createdAt: string;
  createdByName: string | null;
  workItemCount: number;
  milestoneCount: number;
};

async function canAccess(projectId: string, actor: Actor): Promise<boolean> {
  if (canSeeAllProjects(actor.role)) return true;
  return Boolean(await memberRepo.exists(projectId, actor.id));
}

/** 安全地解析存下的設計 JSON；壞掉的資料不應讓整頁掛掉。 */
function parseDesign(raw: string): DesignPayload {
  try {
    const parsed = JSON.parse(raw) as Partial<DesignPayload>;
    return {
      reply: typeof parsed.reply === "string" ? parsed.reply : undefined,
      workItems: Array.isArray(parsed.workItems) ? parsed.workItems : [],
      milestones: Array.isArray(parsed.milestones) ? parsed.milestones : [],
    };
  } catch {
    return { workItems: [], milestones: [] };
  }
}

/** 版本清單（新版在前）。無權限時回空陣列而非拋錯。 */
export async function listVersions(
  projectId: string,
  actor: Actor,
): Promise<DesignVersionSummary[]> {
  if (!projectId || !(await canAccess(projectId, actor))) return [];
  const rows = await designRepo.listByProject(projectId);
  return rows.map((r) => {
    const design = parseDesign(r.design);
    return {
      id: r.id,
      version: r.version,
      summary: r.summary,
      instruction: r.instruction,
      baseVersion: r.baseVersion,
      createdAt: r.createdAt.toISOString(),
      createdByName: r.createdBy?.name ?? null,
      workItemCount: design.workItems.length,
      milestoneCount: design.milestones.length,
    };
  });
}

/** 取某一版的完整內容（含 html），供切換檢視與作為修訂基礎。 */
export async function getVersion(
  id: string,
  actor: Actor,
): Promise<
  | { ok: true; version: number; html: string; design: DesignPayload }
  | { ok: false; error: string }
> {
  const row = await designRepo.findById(id);
  if (!row) return { ok: false, error: "找不到此版本。" };
  if (!(await canAccess(row.projectId, actor))) {
    return { ok: false, error: "權限不足，無法檢視此版本。" };
  }
  return {
    ok: true,
    version: row.version,
    html: row.html,
    design: parseDesign(row.design),
  };
}

/**
 * 取指定版號的 html 與設計，作為「基於此版本更新」的輸入。
 * 找不到時回 null，由呼叫端退回「從零生成」。
 */
export async function getBase(
  projectId: string,
  version: number | null | undefined,
): Promise<{ version: number; html: string; design: DesignPayload } | null> {
  if (!version) return null;
  const row = await designRepo.findByVersion(projectId, version);
  if (!row) return null;
  return { version: row.version, html: row.html, design: parseDesign(row.design) };
}

/** 保存一版。回傳新版號供前端立即切換過去。 */
export async function saveVersion(input: {
  projectId: string;
  html: string;
  design: DesignPayload;
  instruction?: string | null;
  baseVersion?: number | null;
  actor: Actor;
}): Promise<{ ok: true; id: string; version: number } | { ok: false; error: string }> {
  if (!(await canAccess(input.projectId, input.actor))) {
    return { ok: false, error: "權限不足，無法保存設計版本。" };
  }
  const row = await designRepo.create({
    projectId: input.projectId,
    html: input.html,
    design: JSON.stringify(input.design),
    summary: input.design.reply ?? null,
    instruction: input.instruction ?? null,
    baseVersion: input.baseVersion ?? null,
    createdById: input.actor.id,
  });
  return { ok: true, id: row.id, version: row.version };
}
