import { prisma } from "./client";
import type { MediaType } from "@/generated/prisma/enums";

const activeProject = { project: { deletedAt: null } };

export function listAssets() {
  return prisma.mediaAsset.findMany({
    where: activeProject,
    orderBy: { createdAt: "desc" },
    include: { project: true },
  });
}

export type CreateMediaData = {
  projectId: string;
  title: string;
  type: MediaType;
  category?: string | null;
  fileUrl?: string | null; // 已上傳檔案存 storedName
  fileSizeKb?: number | null;
  uploadedBy?: string | null;
  capturedAt?: Date | null;
};

export function create(data: CreateMediaData) {
  return prisma.mediaAsset.create({ data });
}

export function findById(id: string) {
  return prisma.mediaAsset.findUnique({ where: { id } });
}

export function remove(id: string) {
  return prisma.mediaAsset.delete({ where: { id } });
}

export function countAssets() {
  return prisma.mediaAsset.count({ where: activeProject });
}

export function listReports() {
  return prisma.supervisionReport.findMany({
    where: activeProject,
    orderBy: { reportDate: "desc" },
    include: { project: true },
  });
}
