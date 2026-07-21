import { prisma } from "./client";
import type { ProjectDocumentCategory } from "@/generated/prisma/enums";

export type CreateProjectDocumentData = {
  projectId: string;
  category: ProjectDocumentCategory;
  name: string;
  fileNo?: string;
  url?: string;
  issuedDate?: Date;
  note?: string;
};

export function create(data: CreateProjectDocumentData) {
  return prisma.projectDocument.create({ data });
}

export function softDelete(id: string) {
  return prisma.projectDocument.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}

export function restore(id: string) {
  return prisma.projectDocument.update({
    where: { id },
    data: { deletedAt: null },
  });
}
