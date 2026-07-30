import * as ehsRepo from "@/repository/ehs.repository";
import * as memberRepo from "@/repository/projectMember.repository";
import * as storage from "@/service/storage.service";
import { canSeeAllProjects } from "@/lib/auth";
import type { AccountRole, EhsType, EhsResult } from "@/generated/prisma/enums";

export type Actor = { id: string; name: string; role: AccountRole };

// Info: (20260721 - Luphia) 專案存取權限（ADMIN/MANAGER 全部，其餘依指派）
async function canAccess(projectId: string, actor: Actor) {
  if (canSeeAllProjects(actor.role)) return true;
  return Boolean(await memberRepo.exists(projectId, actor.id));
}

export function listEhsAudits(projectId?: string) {
  return ehsRepo.listWithProject(projectId);
}

const VALID_TYPES: EhsType[] = ["SAFETY", "ENVIRONMENT", "TRAFFIC", "HEALTH"];
const VALID_RESULTS: EhsResult[] = ["PENDING", "PASS", "FAIL", "IMPROVING"];

export type EhsInput = {
  projectId: string;
  type?: string;
  auditedAt?: string;
  inspector?: string;
  location?: string;
  result?: string;
  findings?: string;
  dueDate?: string;
};

// Info: (20260721 - Luphia) 手動新增稽核紀錄
export async function addAudit(input: EhsInput, actor: Actor) {
  if (!input.projectId) return null;
  if (!(await canAccess(input.projectId, actor))) return null;

  const type: EhsType = VALID_TYPES.includes(input.type as EhsType)
    ? (input.type as EhsType)
    : "SAFETY";
  const result: EhsResult = VALID_RESULTS.includes(input.result as EhsResult)
    ? (input.result as EhsResult)
    : "PENDING";

  return ehsRepo.create({
    projectId: input.projectId,
    type,
    auditedAt: input.auditedAt ? new Date(input.auditedAt) : new Date(),
    inspector: input.inspector?.trim() || actor.name,
    location: input.location?.trim() || null,
    result,
    findings: input.findings?.trim() || null,
    dueDate: input.dueDate ? new Date(input.dueDate) : null,
  });
}

// Info: (20260721 - Luphia) 快速修改稽核結果（合格時記錄改善完成時間）
export async function setResult(id: string, result: string, actor: Actor) {
  const audit = await ehsRepo.findById(id);
  if (!audit || !(await canAccess(audit.projectId, actor))) return null;
  const next: EhsResult = VALID_RESULTS.includes(result as EhsResult)
    ? (result as EhsResult)
    : "PENDING";
  await ehsRepo.updateResult(id, {
    result: next,
    resolvedAt: next === "PASS" ? new Date() : null,
  });
  return true;
}

// Info: (20260721 - Luphia) 新增追蹤紀錄
export async function addNote(auditId: string, body: string, actor: Actor) {
  const audit = await ehsRepo.findById(auditId);
  if (!audit || !(await canAccess(audit.projectId, actor))) return null;
  const text = body?.trim();
  if (!text) return null;
  await ehsRepo.addNote({
    auditId,
    body: text,
    authorId: actor.id,
    authorName: actor.name,
  });
  return true;
}

// Info: (20260721 - Luphia) 上傳／拍攝文件
export async function addAttachment(auditId: string, file: File, actor: Actor) {
  const audit = await ehsRepo.findById(auditId);
  if (!audit || !(await canAccess(audit.projectId, actor))) return null;
  const saved = await storage.saveFile(file);
  if (!saved) return null;
  await ehsRepo.addAttachment(auditId, saved);
  return true;
}

export const getAttachment = (id: string) => ehsRepo.findAttachment(id);

/**
 * 取稽核附件的內容（含權限判定）。
 *
 * 與 fileManager.getFile／faithUpload.getFile 同形，讓需要跨來源取檔的
 * 呼叫端（如費思對話檢索）能以同一種方式處理三種來源，
 * 而不必各自複製一份「先查所屬專案、再判斷是否為成員」的邏輯。
 */
export async function getAttachmentFile(
  id: string,
  viewer: { id: string; role: AccountRole },
): Promise<
  | { ok: true; buffer: Buffer; mimeType: string; fileName: string }
  | { ok: false; reason: "not-found" | "forbidden" }
> {
  const attachment = await ehsRepo.findAttachment(id);
  if (!attachment) return { ok: false, reason: "not-found" };

  const projectId = attachment.audit.projectId;
  const allowed =
    canSeeAllProjects(viewer.role) ||
    Boolean(await memberRepo.exists(projectId, viewer.id));
  if (!allowed) return { ok: false, reason: "forbidden" };

  const buffer = await storage.read(attachment.storedName);
  if (!buffer) return { ok: false, reason: "not-found" };
  return {
    ok: true,
    buffer,
    mimeType: attachment.mimeType,
    fileName: attachment.fileName,
  };
}
