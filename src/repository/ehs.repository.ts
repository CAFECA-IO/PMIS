import { prisma } from "./client";
import type { EhsType, EhsResult } from "@/generated/prisma/enums";

const activeProject = { project: { deletedAt: null } };

export function listWithProject(projectId?: string) {
  return prisma.ehsAudit.findMany({
    where: { ...activeProject, ...(projectId ? { projectId } : {}) },
    orderBy: { auditedAt: "desc" },
    include: {
      project: true,
      attachments: { orderBy: { createdAt: "desc" } },
      notes: { orderBy: { createdAt: "desc" } },
    },
  });
}

export function count() {
  return prisma.ehsAudit.count({ where: activeProject });
}

export function findById(id: string) {
  return prisma.ehsAudit.findUnique({ where: { id } });
}

export type CreateEhsData = {
  projectId: string;
  type: EhsType;
  auditedAt: Date;
  inspector?: string | null;
  location?: string | null;
  result: EhsResult;
  findings?: string | null;
  dueDate?: Date | null;
};

export function create(data: CreateEhsData) {
  return prisma.ehsAudit.create({ data });
}

export function updateResult(
  id: string,
  data: { result: EhsResult; resolvedAt?: Date | null },
) {
  return prisma.ehsAudit.update({ where: { id }, data });
}

// Info: (20260721 - Luphia) 追蹤紀錄與上傳文件
export function addNote(data: {
  auditId: string;
  body: string;
  authorId?: string | null;
  authorName?: string | null;
}) {
  return prisma.ehsNote.create({ data });
}

export function addAttachment(
  auditId: string,
  a: { fileName: string; storedName: string; mimeType: string; size: number },
) {
  return prisma.ehsAttachment.create({ data: { auditId, ...a } });
}

export function findAttachment(id: string) {
  return prisma.ehsAttachment.findUnique({ where: { id } });
}

/** 全部環安衛上傳檔案（含所屬稽核與專案），供資料庫彙整。 */
export function listAllAttachments() {
  return prisma.ehsAttachment.findMany({
    where: { audit: { project: { deletedAt: null } } },
    orderBy: { createdAt: "desc" },
    include: { audit: { include: { project: true } } },
  });
}
