import { prisma } from "./client";
import type {
  AlertAnchor,
  AlertMetric,
  AlertOperator,
  AlertRuleKind,
  AlertSeverity,
} from "@/generated/prisma/enums";

export type AlertRuleData = {
  projectId?: string | null;
  name: string;
  description?: string | null;
  kind: AlertRuleKind;
  module: string;
  severity: AlertSeverity;
  enabled?: boolean;
  fixedDate?: Date | null;
  anchor?: AlertAnchor | null;
  offsetDays?: number | null;
  metric?: AlertMetric | null;
  operator?: AlertOperator | null;
  threshold?: number | null;
  unit?: string | null;
  action?: string | null;
  notify?: string | null;
};

export function listAll() {
  return prisma.alertRule.findMany({
    where: { deletedAt: null },
    orderBy: [{ kind: "asc" }, { createdAt: "asc" }],
    include: { project: { select: { id: true, name: true } } },
  });
}

/** 供評估使用：僅取已啟用的規則（可限定專案或全域規則）。 */
export function listEnabled(projectId?: string) {
  return prisma.alertRule.findMany({
    where: {
      deletedAt: null,
      enabled: true,
      ...(projectId ? { OR: [{ projectId }, { projectId: null }] } : {}),
    },
    orderBy: { createdAt: "asc" },
  });
}

export function findById(id: string) {
  return prisma.alertRule.findFirst({ where: { id, deletedAt: null } });
}

export function create(data: AlertRuleData) {
  return prisma.alertRule.create({ data });
}

export function update(id: string, data: Partial<AlertRuleData>) {
  return prisma.alertRule.update({ where: { id }, data });
}

export function setEnabled(id: string, enabled: boolean) {
  return prisma.alertRule.update({ where: { id }, data: { enabled } });
}

export function softDelete(id: string) {
  return prisma.alertRule.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}

export function restore(id: string) {
  return prisma.alertRule.update({ where: { id }, data: { deletedAt: null } });
}
