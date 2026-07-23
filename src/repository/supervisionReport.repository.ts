import { prisma } from "./client";
import type { ReportStatus } from "@/generated/prisma/enums";

export type SupervisionReportData = {
  reportDate: Date;
  weather?: string | null;
  summary?: string | null;
  manpower?: string | null;
  equipment?: string | null;
  keyNotes?: string | null;
  filedBy?: string | null;
  status: ReportStatus;
};

export function listByProject(projectId: string) {
  return prisma.supervisionReport.findMany({
    where: { projectId },
    orderBy: { reportDate: "desc" },
  });
}

export function listByProjectInPeriod(projectId: string, start: Date, end: Date) {
  return prisma.supervisionReport.findMany({
    where: { projectId, reportDate: { gte: start, lte: end } },
    orderBy: { reportDate: "asc" },
  });
}

export function findById(id: string) {
  return prisma.supervisionReport.findUnique({ where: { id } });
}

export function findByProjectDate(projectId: string, reportDate: Date) {
  return prisma.supervisionReport.findUnique({
    where: { projectId_reportDate: { projectId, reportDate } },
  });
}

export function create(projectId: string, data: SupervisionReportData) {
  return prisma.supervisionReport.create({ data: { projectId, ...data } });
}

export function update(
  id: string,
  data: Partial<Omit<SupervisionReportData, "reportDate">>,
) {
  return prisma.supervisionReport.update({ where: { id }, data });
}

export function remove(id: string) {
  return prisma.supervisionReport.delete({ where: { id } });
}
