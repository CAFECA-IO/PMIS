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

/**
 * 全部專案的人力配置（帳號管理的「專案配置」用）。
 *
 * 以專案為外層一次撈完，而非逐案查詢：這一頁要回答的是
 * 「誰被配置在哪些案子」，逐案查會變成 N+1，且看不出未配置人力的案子。
 */
export function listAllStaffing() {
  return prisma.project.findMany({
    where: { deletedAt: null },
    orderBy: { code: "asc" },
    select: {
      id: true,
      code: true,
      name: true,
      members: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          role: true,
          account: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              orgUnit: { select: { name: true } },
            },
          },
        },
      },
    },
  });
}
