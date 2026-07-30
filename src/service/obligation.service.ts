import * as obligationRepo from "@/repository/obligation.repository";
import * as workItemRepo from "@/repository/workItem.repository";
import * as projectRepo from "@/repository/project.repository";
import * as memberRepo from "@/repository/projectMember.repository";
import * as focusRepo from "@/repository/screenFocus.repository";
import { canSeeAllProjects } from "@/lib/auth";
import type { Viewer } from "@/service/project.service";
import {
  filterObligations,
  sortObligations,
  summarizeObligations,
  type ObligationFilter,
  type ObligationRow,
  type ObligationStats,
} from "./obligation-view";
import {
  checkCompletion,
  completionBlockedMessage,
  type CompletionCheck,
  type WorkItemState,
} from "./obligation-completion";
import {
  planObligationUpdate,
  type ObligationEditInput,
} from "./obligation-edit";
import {
  computeDueDate,
  predecessorCandidates,
} from "./obligation-trigger";
import type { GanttInput } from "./obligation-gantt";
import type {
  ObligationRisk,
  ObligationStage,
  ObligationStatus,
  ObligationTrigger,
} from "@/constant/obligation";

/**
 * 履約事項的讀取流程：先依可存取專案取資料，再交由純函式
 * （obligation-view）篩選、統計與排序，UI 只負責呈現。
 */

export type ObligationListResult = {
  rows: ObligationRow[];
  /** 統計卡以「篩選前」的全體為母數，讓數字不隨篩選跳動。 */
  stats: ObligationStats;
  total: number;
  /**
   * 各事項的完成條件（以事項 id 為鍵）。
   *
   * 清單上就要看得出「還差幾項分項」，否則使用者按下完成才被拒絕，
   * 得回頭猜是哪裡卡住。多一次查詢換掉一次白跑的操作。
   */
  gates: Record<string, CompletionCheck>;
  /**
   * 甘特圖資料。
   *
   * 與 rows 同一批事項，但另外帶了畫圖需要的東西：前置關係與歸屬分項的
   * 預定起訖。刻意不塞進 ObligationRow —— 那個型別同時餵給 CSV 匯出與
   * 篩選邏輯，混入圖形專用欄位會讓兩者都變難懂。
   */
  gantt: GanttInput[];
  /** 由伺服器決定的今天，避免與瀏覽器算出不同的日期。 */
  today: string;
};

const iso = (d: Date | null) => (d ? d.toISOString() : null);

export async function listObligations(
  viewer: Viewer,
  projectId?: string,
  filter: ObligationFilter = {},
): Promise<ObligationListResult> {
  // 非管理者僅能看到自己被指派的專案
  const allowed = await focusRepo.accessibleProjectIds(
    canSeeAllProjects(viewer.role),
    viewer.id,
  );
  // 指定專案時取交集，避免以 URL 參數越權讀取他人專案
  const scope =
    projectId && projectId !== "all"
      ? allowed.filter((id) => id === projectId)
      : allowed;

  const raw = await obligationRepo.listForView(scope);
  const rows: ObligationRow[] = raw.map((r) => ({
      id: r.id,
      code: r.code,
      title: r.title,
      stage: r.stage as ObligationStage,
      risk: r.risk as ObligationRisk,
      triggerType: r.triggerType as ObligationTrigger,
      status: r.status as ObligationStatus,
      dueDate: iso(r.dueDate),
      actualDate: iso(r.actualDate),
      ownerUnit: r.ownerUnit,
      ownerName: r.ownerName,
      contractBasis: r.contractBasis,
    projectName: r.project?.name ?? null,
  }));

  const visible = sortObligations(filterObligations(rows, filter));
  const [gates, gantt] = await Promise.all([
    completionGates(rows.map((r) => r.id)),
    // 甘特圖只畫篩選後的事項：篩選是使用者當下關注的範圍，圖也該跟著收斂
    ganttData(visible),
  ]);

  return {
    rows: visible,
    stats: summarizeObligations(rows),
    total: rows.length,
    gates,
    gantt,
    today: new Date().toISOString().slice(0, 10),
  };
}

/** 組出甘特圖資料：前置關係與歸屬分項的預定起訖。 */
async function ganttData(visible: ObligationRow[]): Promise<GanttInput[]> {
  if (visible.length === 0) return [];
  const ids = visible.map((r) => r.id);
  const [items, chain] = await Promise.all([
    workItemRepo.listPlanByObligations(ids),
    obligationRepo.listPredecessors(ids),
  ]);
  const grouped = new Map<string, { plannedStart: string | null; plannedEnd: string | null }[]>();
  for (const w of items) {
    if (!w.obligationId) continue;
    const list = grouped.get(w.obligationId) ?? [];
    list.push({ plannedStart: day(w.plannedStart), plannedEnd: day(w.plannedEnd) });
    grouped.set(w.obligationId, list);
  }
  const predecessorOf = new Map(chain.map((r) => [r.id, r.predecessorId]));

  return visible.map((r) => ({
    id: r.id,
    code: r.code,
    title: r.title,
    stage: r.stage,
    status: r.status,
    risk: r.risk,
    dueDate: r.dueDate ? r.dueDate.slice(0, 10) : null,
    actualDate: r.actualDate ? r.actualDate.slice(0, 10) : null,
    predecessorId: predecessorOf.get(r.id) ?? null,
    workItems: grouped.get(r.id) ?? [],
  }));
}

/** 逐事項算出完成條件。 */
async function completionGates(
  ids: string[],
): Promise<Record<string, CompletionCheck>> {
  const items = await workItemRepo.listStatesByObligations(ids);
  const grouped = new Map<string, WorkItemState[]>();
  for (const w of items) {
    if (!w.obligationId) continue;
    const list = grouped.get(w.obligationId);
    if (list) list.push(w);
    else grouped.set(w.obligationId, [w]);
  }
  const out: Record<string, CompletionCheck> = {};
  for (const id of ids) out[id] = checkCompletion(grouped.get(id) ?? []);
  return out;
}

// ── 單一事項的檢視與編輯 ─────────────────────────────────────

export type ObligationWorkItem = WorkItemState & {
  code: string | null;
  category: string | null;
  workPackage: string | null;
  plannedStart: string | null;
  plannedEnd: string | null;
  actualStart: string | null;
  actualEnd: string | null;
};

export type ObligationDetail = {
  id: string;
  projectId: string;
  projectName: string;
  projectCode: string;
  code: string;
  title: string;
  stage: ObligationStage;
  risk: ObligationRisk;
  triggerType: ObligationTrigger;
  status: ObligationStatus;
  dueDate: string | null;
  actualDate: string | null;
  ownerUnit: string | null;
  ownerName: string | null;
  contractBasis: string | null;
  weight: number;
  commissioning: boolean;
  offsetDays: number | null;
  docNo: string | null;
  note: string | null;
  /** 觸發設定。 */
  relativeAnchor: string | null;
  predecessorId: string | null;
  conditionKind: string | null;
  conditionDetail: string | null;
  dueDateOverridden: boolean;
  /** 期限的推算依據與結果（供畫面說明）。 */
  dueBasis: string | null;
  dueReason: string | null;
  /** 可作為前置事項的其他事項（已排除自己與會成環者）。 */
  predecessorOptions: { id: string; code: string; title: string }[];
  /** 推算期限所需的專案日期。 */
  triggerContext: {
    projectStart: string | null;
    projectEnd: string | null;
    contractSigned: string | null;
    noticeToProceed: string | null;
    dueDates: Record<string, string | null>;
    today: string;
  };
  /** 推導來源的合約標的（由專案建置時寫入）。 */
  scopeItem: { id: string; code: string | null; title: string } | null;
  workItems: ObligationWorkItem[];
  /** 依歸屬工程分項算出的完成條件。 */
  completion: CompletionCheck;
};

/** 日期輸入框需要 YYYY-MM-DD，不是完整 ISO。 */
const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

async function canAccessProject(
  projectId: string,
  viewer: Viewer,
): Promise<boolean> {
  if (canSeeAllProjects(viewer.role)) return true;
  return Boolean(await memberRepo.exists(projectId, viewer.id));
}

/**
 * 取單一履約事項的完整內容。
 *
 * 回傳 null 同時代表「不存在」與「無權存取」——
 * 分開回報會讓外人能以 id 逐一試探哪些事項存在。
 */
export async function getObligation(
  id: string,
  viewer: Viewer,
): Promise<ObligationDetail | null> {
  const row = await obligationRepo.findDetail(id);
  if (!row) return null;
  if (!(await canAccessProject(row.projectId, viewer))) return null;

  /*
    同專案的其他事項：既是前置事項的候選，也是推算前置期限的資料來源。
    專案日期則是相對期限的基準。兩者都取回來才算得出期限。
  */
  const [items, siblings, project] = await Promise.all([
    workItemRepo.listByObligation(id),
    obligationRepo.listTriggerScope(row.projectId),
    projectRepo.findScheduleDates(row.projectId),
  ]);
  const predecessorOf = new Map(
    siblings.map((o) => [o.id, o.predecessorId] as const),
  );
  const today = new Date().toISOString().slice(0, 10);
  const computed = computeDueDate(
    {
      triggerType: row.triggerType as ObligationTrigger,
      dueDate: day(row.dueDate),
      relativeAnchor: row.relativeAnchor,
      offsetDays: row.offsetDays,
      predecessorId: row.predecessorId,
      conditionKind: row.conditionKind,
      conditionDetail: row.conditionDetail,
      dueDateOverridden: row.dueDateOverridden,
    },
    {
      projectStart: day(project?.startDate ?? null),
      projectEnd: day(project?.endDate ?? null),
      contractSigned: day(project?.signedDate ?? null),
      noticeToProceed: day(project?.noticeDate ?? null),
      dueDateOf: (target) =>
        day(siblings.find((o) => o.id === target)?.dueDate ?? null),
      today,
    },
    (target) => siblings.find((o) => o.id === target)?.title ?? null,
  );

  const workItems: ObligationWorkItem[] = items.map((w) => ({
    id: w.id,
    name: w.name,
    status: w.status,
    progress: w.progress,
    code: w.code,
    category: w.category,
    workPackage: w.workPackage,
    plannedStart: day(w.plannedStart),
    plannedEnd: day(w.plannedEnd),
    actualStart: day(w.actualStart),
    actualEnd: day(w.actualEnd),
  }));

  return {
    id: row.id,
    projectId: row.projectId,
    projectName: row.project.name,
    projectCode: row.project.code,
    code: row.code,
    title: row.title,
    stage: row.stage as ObligationStage,
    risk: row.risk as ObligationRisk,
    triggerType: row.triggerType as ObligationTrigger,
    status: row.status as ObligationStatus,
    dueDate: day(row.dueDate),
    actualDate: day(row.actualDate),
    ownerUnit: row.ownerUnit,
    ownerName: row.ownerName,
    contractBasis: row.contractBasis,
    weight: row.weight,
    commissioning: row.commissioning,
    offsetDays: row.offsetDays,
    docNo: row.docNo,
    note: row.note,
    relativeAnchor: row.relativeAnchor,
    predecessorId: row.predecessorId,
    conditionKind: row.conditionKind,
    conditionDetail: row.conditionDetail,
    dueDateOverridden: row.dueDateOverridden,
    dueBasis: computed.basis,
    dueReason: computed.reason,
    predecessorOptions: predecessorCandidates(
      id,
      siblings.map((o) => ({ id: o.id, code: o.code, title: o.title })),
      (target) => predecessorOf.get(target) ?? null,
    ),
    triggerContext: {
      projectStart: day(project?.startDate ?? null),
      projectEnd: day(project?.endDate ?? null),
      contractSigned: day(project?.signedDate ?? null),
      noticeToProceed: day(project?.noticeDate ?? null),
      dueDates: Object.fromEntries(
        siblings.map((o) => [o.id, day(o.dueDate)]),
      ),
      today,
    },
    scopeItem: row.scopeItem,
    workItems,
    completion: checkCompletion(workItems),
  };
}

export type ObligationUpdateInput = ObligationEditInput;

export type MutationResult = { ok: true } | { ok: false; error: string };

/**
 * 更新履約事項。
 *
 * 所有欄位皆可改（含管制編號、名稱與契約依據）——這些多由 AI 自契約解讀，
 * 解讀有誤時人工更正是唯一的補救途徑，鎖住反而沒有出路。
 *
 * 驗證與「改成完成」的把關在 planObligationUpdate（純函式、有測試）；
 * 本層只負責權限、編號重複查詢與寫入。
 */
export async function updateObligation(
  id: string,
  input: ObligationUpdateInput,
  viewer: Viewer,
): Promise<MutationResult> {
  const row = await obligationRepo.findDetail(id);
  if (!row) return { ok: false, error: "找不到此履約事項。" };
  if (!(await canAccessProject(row.projectId, viewer))) {
    return { ok: false, error: "無權編輯此履約事項。" };
  }

  const plan = planObligationUpdate(
    input,
    {
      code: row.code,
      status: row.status,
      stage: row.stage,
      risk: row.risk,
      triggerType: row.triggerType,
      weight: row.weight,
    },
    await workItemRepo.listByObligation(id),
  );
  if (!plan.ok) return plan;

  // 管制編號在同一專案內唯一（資料庫層也有 unique，先擋以便回報可讀訊息）
  if (plan.data.code !== row.code) {
    const clash = await obligationRepo.findByProjectCode(
      row.projectId,
      plan.data.code,
    );
    if (clash && clash.id !== id) {
      return {
        ok: false,
        error: `管制編號「${plan.data.code}」在本專案已被使用。`,
      };
    }
  }

  await obligationRepo.updateDetail(id, plan.data);
  return { ok: true };
}

/**
 * 完成履約事項。
 *
 * 關卡在此，而非只在畫面上：畫面按鈕會被停用，但動作可以被直接呼叫。
 */
export async function completeObligation(
  id: string,
  viewer: Viewer,
): Promise<MutationResult> {
  const row = await obligationRepo.findById(id);
  if (!row) return { ok: false, error: "找不到此履約事項。" };
  if (!(await canAccessProject(row.projectId, viewer))) {
    return { ok: false, error: "無權完成此履約事項。" };
  }
  if (row.status === "DONE") return { ok: true };

  const items = await workItemRepo.listByObligation(id);
  const check = checkCompletion(items);
  if (!check.ok) return { ok: false, error: completionBlockedMessage(check) };

  await obligationRepo.markDone(id);
  return { ok: true };
}
