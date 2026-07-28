import { prisma } from "@/repository/client";
import * as ruleRepo from "@/repository/alertRule.repository";
import * as deviceRepo from "@/repository/monitoringDevice.repository";
import * as projectService from "@/service/project.service";
import { rolledUpProgress } from "@/service/obligation-rollup";
import {
  evaluateRules,
  type AlertHit,
  type AlertRule as EvalRule,
  type AnchorItem,
  type MetricSample,
} from "@/service/alert-rule";
import type { Viewer } from "@/service/project.service";

/**
 * 行事曆與預警：蒐集各模組現況，交由 alert-rule 純函式引擎評估。
 * 本檔負責 I/O 與資料轉換，判斷邏輯一律在 alert-rule.ts（已單元測試）。
 */

const iso = (d: Date | null | undefined) =>
  d ? d.toISOString().slice(0, 10) : null;

/** 將 Prisma 規則列轉為評估引擎的輸入型別。 */
function toEvalRule(r: {
  id: string;
  name: string;
  kind: string;
  module: string;
  severity: string;
  enabled: boolean;
  projectId: string | null;
  fixedDate: Date | null;
  anchor: string | null;
  offsetDays: number | null;
  metric: string | null;
  operator: string | null;
  threshold: number | null;
  unit: string | null;
  action: string | null;
  notify: string | null;
}): EvalRule {
  return {
    id: r.id,
    name: r.name,
    kind: r.kind as EvalRule["kind"],
    module: r.module,
    severity: r.severity as EvalRule["severity"],
    enabled: r.enabled,
    projectId: r.projectId,
    fixedDate: iso(r.fixedDate),
    anchor: (r.anchor as EvalRule["anchor"]) ?? null,
    offsetDays: r.offsetDays,
    metric: (r.metric as EvalRule["metric"]) ?? null,
    operator: (r.operator as EvalRule["operator"]) ?? null,
    threshold: r.threshold,
    unit: r.unit,
    action: r.action,
    notify: r.notify,
  };
}

/** 蒐集各類基準日（供相對日期規則比對）。 */
async function collectAnchors(
  projects: { id: string; name: string; endDate: Date | null }[],
): Promise<AnchorItem[]> {
  const ids = projects.map((p) => p.id);
  const nameOf = new Map(projects.map((p) => [p.id, p.name]));
  const out: AnchorItem[] = [];

  // 履約完工日
  for (const p of projects) {
    const date = iso(p.endDate);
    if (date) {
      out.push({
        anchor: "CONTRACT_END",
        date,
        label: `${p.name}｜履約完工`,
        projectId: p.id,
        projectName: p.name,
      });
    }
  }

  if (ids.length === 0) return out;

  const [obligations, submittals, inspections, defects] = await Promise.all([
    prisma.contractObligation.findMany({
      where: {
        deletedAt: null,
        projectId: { in: ids },
        actualDate: null,
        dueDate: { not: null },
      },
      select: { id: true, title: true, dueDate: true, projectId: true },
    }),
    prisma.submittal.findMany({
      where: {
        projectId: { in: ids },
        plannedSubmitDate: { not: null },
        status: { notIn: ["APPROVED"] },
      },
      select: {
        id: true,
        name: true,
        plannedSubmitDate: true,
        projectId: true,
      },
    }),
    prisma.inspection.findMany({
      where: { projectId: { in: ids }, result: "PENDING" },
      select: { id: true, type: true, scheduledAt: true, projectId: true, location: true },
    }),
    prisma.defect.findMany({
      where: {
        projectId: { in: ids },
        status: { in: ["OPEN", "IN_PROGRESS"] },
        dueDate: { not: null },
      },
      select: { id: true, title: true, dueDate: true, projectId: true },
    }),
  ]);

  const push = (
    anchor: AnchorItem["anchor"],
    date: Date | null,
    label: string,
    projectId: string,
  ) => {
    const d = iso(date);
    if (!d) return;
    out.push({
      anchor,
      date: d,
      label,
      projectId,
      projectName: nameOf.get(projectId) ?? "",
    });
  };

  for (const m of obligations) {
    push("OBLIGATION_DUE", m.dueDate, `履約事項：${m.title}`, m.projectId);
  }
  for (const s of submittals) {
    push("DOCUMENT_DUE", s.plannedSubmitDate, `送審：${s.name}`, s.projectId);
  }
  for (const i of inspections) {
    push(
      "INSPECTION_DATE",
      i.scheduledAt,
      `查驗：${i.location ?? i.type}`,
      i.projectId,
    );
  }
  for (const d of defects) {
    push("DEFECT_DUE", d.dueDate, `缺失：${d.title}`, d.projectId);
  }

  return out;
}

/** 蒐集各項條件度量的當前數值。 */
async function collectSamples(
  projects: { id: string; name: string; budget: unknown }[],
): Promise<MetricSample[]> {
  const ids = projects.map((p) => p.id);
  const nameOf = new Map(projects.map((p) => [p.id, p.name]));
  const out: MetricSample[] = [];
  if (ids.length === 0) return out;

  const now = Date.now();

  const [obligations, workItems, failedInspections, overdueDefects, pendingSubmittals, devices] =
    await Promise.all([
      prisma.contractObligation.findMany({
        where: { deletedAt: null, projectId: { in: ids } },
        select: {
          id: true,
          weight: true,
          dueDate: true,
          actualDate: true,
          projectId: true,
        },
      }),
      prisma.workItem.findMany({
        where: { projectId: { in: ids } },
        select: {
          obligationId: true,
          plannedStart: true,
          plannedEnd: true,
          actualStart: true,
          actualEnd: true,
          progress: true,
          projectId: true,
        },
      }),
      prisma.inspection.groupBy({
        by: ["projectId"],
        where: { projectId: { in: ids }, result: "FAILED" },
        _count: { _all: true },
      }),
      prisma.defect.groupBy({
        by: ["projectId"],
        where: {
          projectId: { in: ids },
          status: { in: ["OPEN", "IN_PROGRESS"] },
          dueDate: { lt: new Date() },
        },
        _count: { _all: true },
      }),
      prisma.submittal.groupBy({
        by: ["projectId"],
        where: {
          projectId: { in: ids },
          status: { in: ["SUBMITTED", "UNDER_REVIEW", "RETURNED"] },
        },
        _count: { _all: true },
      }),
      deviceRepo.listByProjects(ids),
    ]);

  // 進度落後（%）：以全系統統一的上捲進度計算 planned - overall
  const msBy = new Map<string, typeof obligations>();
  const wiBy = new Map<string, typeof workItems>();
  for (const m of obligations) {
    msBy.set(m.projectId, [...(msBy.get(m.projectId) ?? []), m]);
  }
  for (const w of workItems) {
    wiBy.set(w.projectId, [...(wiBy.get(w.projectId) ?? []), w]);
  }
  for (const p of projects) {
    const prog = rolledUpProgress(msBy.get(p.id) ?? [], wiBy.get(p.id) ?? []);
    // gap 為負代表落後，取正值作為「落後百分比」
    const lag = prog.gap < 0 ? Math.abs(prog.gap) : 0;
    out.push({
      metric: "SCHEDULE_LAG",
      value: lag,
      label: `${p.name}｜全案進度`,
      projectId: p.id,
      projectName: p.name,
    });
  }

  const pushCount = (
    metric: MetricSample["metric"],
    rows: { projectId: string; _count: { _all: number } }[],
    suffix: string,
  ) => {
    for (const r of rows) {
      out.push({
        metric,
        value: r._count._all,
        label: `${nameOf.get(r.projectId) ?? ""}｜${suffix}`,
        projectId: r.projectId,
        projectName: nameOf.get(r.projectId) ?? "",
      });
    }
  };
  pushCount("INSPECTION_FAILED", failedInspections, "查驗不合格");
  pushCount("DEFECT_OVERDUE", overdueDefects, "逾期未改善缺失");
  pushCount("SUBMITTAL_PENDING", pendingSubmittals, "待審送審");

  // 設備離線分鐘數：逐台取樣，讓每台離線設備各自命中
  for (const d of devices) {
    if (d.status === "MAINTENANCE") continue;
    const minutes =
      d.status === "OFFLINE" && d.lastHeartbeat
        ? Math.max(0, Math.round((now - d.lastHeartbeat.getTime()) / 60_000))
        : 0;
    out.push({
      metric: "DEVICE_OFFLINE_MINUTES",
      value: minutes,
      label: `${d.code} ${d.name}`,
      projectId: d.projectId,
      projectName: d.project.name,
    });
  }

  // 預算使用率（%）：已支出 / 契約金額
  const spend = await prisma.financialVoucher.groupBy({
    by: ["projectId"],
    where: { projectId: { in: ids }, direction: "EXPENSE", deletedAt: null },
    _sum: { amount: true },
  });
  const spendBy = new Map(
    spend.map((s) => [s.projectId, Number(s._sum.amount ?? 0)]),
  );
  for (const p of projects) {
    const budget = Number(p.budget ?? 0);
    if (budget <= 0) continue;
    const used = spendBy.get(p.id) ?? 0;
    out.push({
      metric: "BUDGET_USAGE",
      value: Math.round((used / budget) * 1000) / 10,
      label: `${p.name}｜預算使用率`,
      projectId: p.id,
      projectName: p.name,
    });
  }

  return out;
}

export type AlertOverview = {
  hits: AlertHit[];
  ruleCount: number;
  enabledCount: number;
};

/** 進站即時評估：回傳目前命中的預警。 */
export async function evaluateForViewer(
  viewer: Viewer,
  projectId?: string,
): Promise<AlertOverview> {
  const visible = await projectService.listProjectOptions(viewer);
  const scoped = projectId ? visible.filter((p) => p.id === projectId) : visible;

  const rows = await prisma.project.findMany({
    where: { deletedAt: null, id: { in: scoped.map((p) => p.id) } },
    select: { id: true, name: true, endDate: true, budget: true },
  });

  const rules = await ruleRepo.listEnabled(projectId);
  const [anchors, samples] = await Promise.all([
    collectAnchors(rows),
    collectSamples(rows),
  ]);

  const hits = evaluateRules({
    rules: rules.map(toEvalRule),
    anchors,
    samples,
  });

  const all = await ruleRepo.listAll();
  return {
    hits,
    ruleCount: all.length,
    enabledCount: all.filter((r) => r.enabled).length,
  };
}

/** 規則清單（含所屬專案名稱）。 */
export async function listRules() {
  const rows = await ruleRepo.listAll();
  return rows.map((r) => ({
    ...toEvalRule(r),
    description: r.description,
    projectName: r.project?.name ?? null,
  }));
}

export type RuleInput = {
  id?: string;
  projectId?: string;
  name?: string;
  description?: string;
  kind?: string;
  module?: string;
  severity?: string;
  fixedDate?: string;
  anchor?: string;
  offsetDays?: string;
  metric?: string;
  operator?: string;
  threshold?: string;
  unit?: string;
  action?: string;
  notify?: string;
};

const KINDS = ["FIXED_DATE", "RELATIVE_DATE", "CONDITION"];
const SEVERITIES = ["INFO", "WARNING", "CRITICAL"];
const ANCHORS = [
  "CONTRACT_END",
  "OBLIGATION_DUE",
  "DOCUMENT_DUE",
  "INSPECTION_DATE",
  "DEFECT_DUE",
];
const METRICS = [
  "SCHEDULE_LAG",
  "INSPECTION_FAILED",
  "DEFECT_OVERDUE",
  "SUBMITTAL_PENDING",
  "DEVICE_OFFLINE_MINUTES",
  "BUDGET_USAGE",
];
const OPERATORS = ["GTE", "LTE", "GT", "LT", "EQ"];

const pick = <T extends string>(v: string | undefined, allowed: string[]) =>
  v && allowed.includes(v) ? (v as T) : undefined;
const num = (v: string | undefined) =>
  v != null && v.trim() !== "" && !Number.isNaN(Number(v)) ? Number(v) : null;
const text = (v: string | undefined) => v?.trim() || null;

export type SaveResult = { ok: true; id: string } | { ok: false; error: string };

/** 依規則類型只保留相關欄位，避免殘留舊設定造成誤判。 */
function normalize(input: RuleInput) {
  const kind = pick<"FIXED_DATE" | "RELATIVE_DATE" | "CONDITION">(
    input.kind,
    KINDS,
  );
  if (!kind) return null;
  const base = {
    name: input.name?.trim() ?? "",
    description: text(input.description),
    kind,
    module: input.module?.trim() || "/calendar",
    severity: (pick(input.severity, SEVERITIES) ?? "WARNING") as
      | "INFO"
      | "WARNING"
      | "CRITICAL",
    projectId: input.projectId?.trim() ? input.projectId.trim() : null,
    action: text(input.action),
    notify: text(input.notify),
    fixedDate: null as Date | null,
    anchor: null as never,
    offsetDays: null as number | null,
    metric: null as never,
    operator: null as never,
    threshold: null as number | null,
    unit: null as string | null,
  };

  if (kind === "FIXED_DATE") {
    return {
      ...base,
      fixedDate: input.fixedDate?.trim() ? new Date(input.fixedDate) : null,
    };
  }
  if (kind === "RELATIVE_DATE") {
    return {
      ...base,
      anchor: pick(input.anchor, ANCHORS) as never,
      offsetDays: num(input.offsetDays),
    };
  }
  return {
    ...base,
    metric: pick(input.metric, METRICS) as never,
    operator: pick(input.operator, OPERATORS) as never,
    threshold: num(input.threshold),
    unit: text(input.unit),
  };
}

export async function saveRule(input: RuleInput): Promise<SaveResult> {
  const data = normalize(input);
  if (!data) return { ok: false, error: "請選擇規則類型。" };
  if (!data.name) return { ok: false, error: "請輸入規則名稱。" };

  if (data.kind === "FIXED_DATE" && !data.fixedDate) {
    return { ok: false, error: "固定日期規則需設定觸發日期。" };
  }
  if (data.kind === "RELATIVE_DATE" && (!data.anchor || data.offsetDays == null)) {
    return { ok: false, error: "相對日期規則需設定基準日與提前天數。" };
  }
  if (
    data.kind === "CONDITION" &&
    (!data.metric || !data.operator || data.threshold == null)
  ) {
    return { ok: false, error: "條件觸發規則需設定指標、運算子與門檻值。" };
  }

  const saved = input.id
    ? await ruleRepo.update(input.id, data)
    : await ruleRepo.create(data);
  return { ok: true, id: saved.id };
}

export async function toggleRule(id: string, enabled: boolean) {
  await ruleRepo.setEnabled(id, enabled);
}

export async function deleteRule(id: string) {
  await ruleRepo.softDelete(id);
}
