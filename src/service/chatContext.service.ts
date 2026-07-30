import type { AccountRole } from "@/generated/prisma/enums";

import * as fileManager from "@/service/fileManager.service";
import * as faithUpload from "@/service/faithUpload.service";
import * as projectService from "@/service/project.service";
import * as obligationService from "@/service/obligation.service";
import * as qualityService from "@/service/quality.service";
import * as scheduleService from "@/service/schedule.service";
import * as submittalService from "@/service/submittal.service";
import * as ehsService from "@/service/ehs.service";
import * as financeService from "@/service/finance.service";
import * as carbonService from "@/service/carbon.service";
import * as alertService from "@/service/alert.service";
import * as scopeRepo from "@/repository/scopeItem.repository";
import { extractDocumentText } from "@/service/docExtract.service";
import {
  allowedDatasets,
  buildManifest,
  capText,
  dayOf,
  renderTable,
  type Budgeted,
  type ContextSection,
  type ManifestFile,
  type RetrievalManifest,
} from "@/service/chat-retrieval";
import {
  canAccessModule,
  getUserModulePermissions,
} from "@/service/access.service";
import type { FaithAttachment } from "@/service/faith.service";

/**
 * 費思對話的專案脈絡：清冊建立與內容載入（本模組負責 I/O）。
 *
 * 判斷「該讀什麼」的邏輯在 chat-retrieval.ts（純函式、有測試），
 * 這裡只做兩件事：把可調閱的東西列出來，以及把選中的東西讀出來。
 *
 * 權限一律走既有機制，不另立一套 ——
 *  - 檔案：fileManager／faithUpload 的 getFile 自帶專案成員判定
 *  - 系統資料：依職位的模組權限過濾（沒有財務權限就查不到財務數字）
 * 兩者缺一都會變成「透過問費思繞過權限」的破口。
 */

export type ChatViewer = {
  id: string;
  name: string;
  role: AccountRole;
  positionId?: string | null;
};

/** 建立本專案的檢索清冊；無權存取或找不到專案時回 null。 */
export async function buildProjectManifest(
  projectId: string,
  viewer: ChatViewer,
): Promise<RetrievalManifest | null> {
  const project = await projectService.getProject(projectId, viewer);
  if (!project) return null;

  const [files, perms] = await Promise.all([
    fileManager.inventory(projectId, project.name, viewer),
    getUserModulePermissions(viewer),
  ]);
  if (!files) return null;

  return buildManifest({
    projectName: project.name,
    files,
    datasets: allowedDatasets((key) => canAccessModule(perms, key)),
  });
}

// ── 讀檔 ────────────────────────────────────────────────────

/**
 * 依來源取檔。
 *
 * 三種來源各有自己的取檔函式，不可只用專案 id 判斷權限 ——
 * 權限規則跟著資料模型走（例如費思上傳可能尚未指派專案，
 * 環安衛附件的專案要繞過稽核紀錄才問得到）。
 */
async function readFile(
  file: ManifestFile,
  viewer: ChatViewer,
): Promise<{ buffer: Buffer; mimeType: string; fileName: string } | null> {
  const result =
    file.source === "faith"
      ? await faithUpload.getFile(file.id, viewer)
      : file.source === "project"
        ? await fileManager.getFile(file.id, viewer)
        : await ehsService.getAttachmentFile(file.id, viewer);
  if (!result.ok) return null;
  return result;
}

export type LoadedFiles = {
  sections: ContextSection[];
  attachments: FaithAttachment[];
  /** 取檔或轉文字失敗的檔案，須回報而非默默略過。 */
  failed: { name: string; why: string }[];
};

/**
 * 讀出選中的檔案：可轉文字者注入上下文，PDF 與影像以原檔交模型判讀。
 */
export async function loadFiles(
  budgeted: Budgeted,
  viewer: ChatViewer,
): Promise<LoadedFiles> {
  const sections: ContextSection[] = [];
  const attachments: FaithAttachment[] = [];
  const failed: { name: string; why: string }[] = [];

  for (const f of budgeted.text) {
    const got = await readFile(f, viewer);
    if (!got) {
      failed.push({ name: f.name, why: "無法取得檔案" });
      continue;
    }
    const result = extractDocumentText(
      new Uint8Array(got.buffer),
      got.mimeType,
      got.fileName,
    );
    if (result.kind !== "text" || !result.text.trim()) {
      failed.push({ name: f.name, why: "內容無法轉為文字" });
      continue;
    }
    const capped = capText(result.text);
    sections.push({
      title: `文件：${f.name}（${f.path}）`,
      body:
        (result.truncated || capped.truncated ? "（內容過長，僅節錄前段）\n" : "") +
        capped.text,
    });
  }

  for (const f of budgeted.native) {
    const got = await readFile(f, viewer);
    if (!got) {
      failed.push({ name: f.name, why: "無法取得檔案" });
      continue;
    }
    attachments.push({
      mimeType: got.mimeType,
      data: got.buffer.toString("base64"),
      name: got.fileName,
    });
  }

  return { sections, attachments, failed };
}

// ── 查表 ────────────────────────────────────────────────────

const OBLIGATION_STATUS: Record<string, string> = {
  NOT_STARTED: "未起算",
  IN_PROGRESS: "辦理中",
  PENDING_REVIEW: "待審查",
  PENDING_EXTERNAL: "待外部",
  OVERDUE: "逾期",
  DONE: "已完成",
};

const RISK: Record<string, string> = {
  GREEN: "綠",
  YELLOW: "黃",
  ORANGE: "橙",
  RED: "紅",
  PURPLE: "紫",
};

/** Prisma 的 Decimal 不是 number，直接內插會得到物件字串。 */
function num(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function money(value: unknown): string | null {
  const n = num(value);
  return n === null ? null : n.toLocaleString("zh-TW");
}

/**
 * 查出一份系統資料並排成文字。
 *
 * 每一份都刻意只挑「回答監造問題真正用得上的欄位」，
 * 而非把整列倒出來 —— 多餘欄位不只花錢，還會稀釋模型的注意力。
 */
async function loadDataset(
  id: string,
  projectId: string,
  viewer: ChatViewer,
): Promise<string | null> {
  const actor = { id: viewer.id, name: viewer.name, role: viewer.role };

  if (id === "obligations") {
    const { rows, stats } = await obligationService.listObligations(
      viewer,
      projectId,
    );
    const table = renderTable(
      ["管制編號", "事項", "階段", "狀態", "風險", "期限", "完成日", "責任", "契約依據"],
      rows.map((r) => [
        r.code,
        r.title,
        r.stage,
        OBLIGATION_STATUS[r.status] ?? r.status,
        RISK[r.risk] ?? r.risk,
        dayOf(r.dueDate),
        dayOf(r.actualDate),
        [r.ownerUnit, r.ownerName].filter(Boolean).join(" / "),
        r.contractBasis,
      ]),
    );
    return (
      `未起算 ${stats.notStarted}、辦理中 ${stats.inProgress}、待外部 ${stats.pendingExternal}、` +
      `逾期 ${stats.overdue}、本月完成 ${stats.doneThisMonth}\n\n${table}`
    );
  }

  if (id === "scope") {
    const items = await scopeRepo.listByProject(projectId);
    const work = await qualityService.listWorkItems(projectId);
    const scopeTable = renderTable(
      ["代號", "合約標的", "契約條號", "履約事項數", "工程分項數"],
      items.map((s) => [
        s.code,
        s.title,
        s.sourceClause,
        s._count.obligations,
        s._count.workItems,
      ]),
    );
    const workTable = renderTable(
      ["工程分項", "狀態"],
      work.map((w) => [w.name, w.status]),
    );
    return `合約標的：\n${scopeTable}\n\n工程分項：\n${workTable}`;
  }

  if (id === "quality") {
    const { inspections, defects } = await qualityService.getQuality(projectId);
    const ins = renderTable(
      ["查驗日", "類別", "結果", "地點", "工項", "查驗人"],
      inspections.map((i) => [
        dayOf(i.scheduledAt),
        i.type,
        i.result,
        i.location,
        i.workItem?.name,
        i.inspector,
      ]),
    );
    const def = renderTable(
      ["缺失", "嚴重度", "狀態", "工項", "負責", "改善期限", "完成日"],
      defects.map((d) => [
        d.title,
        d.severity,
        d.status,
        d.workItem?.name,
        d.assignedTo,
        dayOf(d.dueDate),
        dayOf(d.resolvedAt),
      ]),
    );
    return `查驗紀錄：\n${ins}\n\n缺失：\n${def}`;
  }

  if (id === "schedule") {
    const projects = await scheduleService.listSchedule(projectId);
    const rows = projects.flatMap((p) => p.workItems);
    return renderTable(
      ["工程分項", "類別", "計畫起", "計畫訖", "實際起", "實際訖", "完成率", "狀態"],
      rows.map((w) => [
        w.name,
        w.category,
        dayOf(w.plannedStart),
        dayOf(w.plannedEnd),
        dayOf(w.actualStart),
        dayOf(w.actualEnd),
        `${w.progress}%`,
        w.status,
      ]),
    );
  }

  if (id === "submittals") {
    const rows = await submittalService.listSubmittals(projectId);
    return renderTable(
      ["名稱", "類別", "材料", "計畫提送", "實際提送", "審查日", "審查結果", "狀態", "文號"],
      rows.map((s) => [
        s.name,
        s.category,
        s.materialName,
        dayOf(s.plannedSubmitDate),
        dayOf(s.actualSubmitDate),
        dayOf(s.reviewDate),
        s.reviewResult,
        s.status,
        s.fileNo,
      ]),
    );
  }

  if (id === "ehs") {
    const rows = await ehsService.listEhsAudits(projectId);
    return renderTable(
      ["稽核日", "類別", "地點", "結果", "缺失", "改善期限", "完成日", "稽核人"],
      rows.map((a) => [
        dayOf(a.auditedAt),
        a.type,
        a.location,
        a.result,
        a.findings,
        dayOf(a.dueDate),
        dayOf(a.resolvedAt),
        a.inspector,
      ]),
    );
  }

  if (id === "finance") {
    const data = await financeService.getProjectFinance(projectId, actor);
    if (!data) return null;
    const table = renderTable(
      ["日期", "收支", "科目", "金額", "對象", "摘要", "狀態"],
      data.vouchers.map((v) => [
        dayOf(v.date),
        v.direction === "INCOME" ? "收入" : "支出",
        v.category,
        money(v.amount),
        v.counterparty,
        v.summary,
        v.status,
      ]),
    );
    const { summary } = data;
    return (
      `收入 ${summary.income.toLocaleString("zh-TW")}、支出 ${summary.expense.toLocaleString("zh-TW")}、` +
      `損益 ${summary.profit.toLocaleString("zh-TW")}、現金流 ${summary.cash.toLocaleString("zh-TW")}，` +
      `共 ${summary.count} 筆\n\n${table}`
    );
  }

  if (id === "carbon") {
    const inventories = await carbonService.getProjectInventories(projectId, actor);
    if (!inventories) return null;
    return renderTable(
      ["盤查名稱", "期間", "總排放（公噸）", "範疇一", "範疇二", "範疇三", "筆數", "查證"],
      inventories.map((inv) => [
        inv.name,
        [dayOf(inv.periodStart), dayOf(inv.periodEnd)].filter(Boolean).join(" ~ "),
        inv.summary.totalTonnes,
        inv.summary.byScopeKg.SCOPE_1,
        inv.summary.byScopeKg.SCOPE_2,
        inv.summary.byScopeKg.SCOPE_3,
        inv.summary.entryCount,
        inv.verifiedAt ? dayOf(inv.verifiedAt) : null,
      ]),
    );
  }

  if (id === "alerts") {
    const { hits } = await alertService.evaluateForViewer(viewer, projectId);
    return renderTable(
      ["嚴重度", "規則", "對象", "說明", "期限", "剩餘天數", "建議處置"],
      hits.map((h) => [
        h.severity,
        h.ruleName,
        h.subject,
        h.detail,
        h.dueDate,
        h.daysUntil === null ? null : h.overdue ? `逾期 ${-h.daysUntil} 天` : h.daysUntil,
        h.action,
      ]),
    );
  }

  if (id === "overview") {
    const project = await projectService.getProject(projectId, viewer);
    if (!project) return null;
    const o = projectService.computeProjectOverview(project);
    const lines = [
      `專案名稱：${project.name}（代碼 ${project.code}）`,
      `狀態：${project.status}`,
      `地點：${project.location ?? "—"}`,
      `契約編號：${project.contractNo ?? "—"}`,
      `業主：${project.client ?? "—"}｜承商：${project.contractor ?? "—"}｜監造：${project.supervisor ?? "—"}`,
      `工期：${dayOf(project.startDate) ?? "—"} 至 ${dayOf(project.endDate) ?? "—"}` +
        (o.daysLeft === null
          ? ""
          : o.daysLeft < 0
            ? `（已逾期 ${-o.daysLeft} 天）`
            : `（剩餘 ${o.daysLeft} 天）`),
      `實際進度 ${o.progress.overall}%、計畫進度 ${o.progress.planned}%、落差 ${o.progress.gap}%`,
      `未結案缺失 ${o.openCount} 件（其中逾期 ${o.overdueCount} 件）、待查驗 ${o.pendingInspectionCount} 件`,
      `契約金額：原始 ${money(o.originalAmount) ?? "—"}、現行 ${money(o.currentAmount) ?? "—"}（變更 ${o.changeCount} 次）`,
      `已付款 ${money(o.paidTotal) ?? "—"}（${o.paidPct}%），待付節點 ${o.pendingPaymentCount} 個`,
    ];
    return lines.join("\n");
  }

  return null;
}

/** 查出選中的系統資料。個別查詢失敗不影響其餘。 */
export async function loadDatasets(
  budgeted: Budgeted,
  projectId: string,
  viewer: ChatViewer,
): Promise<{ sections: ContextSection[]; failed: { name: string; why: string }[] }> {
  const sections: ContextSection[] = [];
  const failed: { name: string; why: string }[] = [];

  for (const d of budgeted.datasets) {
    try {
      const body = await loadDataset(d.id, projectId, viewer);
      if (body && body.trim()) sections.push({ title: d.label, body });
      else failed.push({ name: d.label, why: "查無資料或無權查詢" });
    } catch {
      // 單一資料表查詢失敗不該讓整次回答失敗
      failed.push({ name: d.label, why: "查詢失敗" });
    }
  }

  return { sections, failed };
}
