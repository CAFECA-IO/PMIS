import { prisma } from "./client";
import type { ProjectMemberRole } from "@/generated/prisma/enums";

export function create(data: {
  projectId: string;
  accountId: string;
  role: ProjectMemberRole;
}) {
  return prisma.projectMember.create({ data });
}

export function upsert(data: {
  projectId: string;
  accountId: string;
  role: ProjectMemberRole;
}) {
  return prisma.projectMember.upsert({
    where: {
      projectId_accountId: {
        projectId: data.projectId,
        accountId: data.accountId,
      },
    },
    update: { role: data.role },
    create: data,
  });
}

export function remove(id: string) {
  return prisma.projectMember.delete({ where: { id } });
}

export function exists(projectId: string, accountId: string) {
  return prisma.projectMember.findFirst({
    where: { projectId, accountId },
    select: { id: true },
  });
}

export function listByProject(projectId: string) {
  return prisma.projectMember.findMany({
    where: { projectId },
    orderBy: { createdAt: "asc" },
    include: { account: { include: { orgUnit: true, position: true } } },
  });
}
