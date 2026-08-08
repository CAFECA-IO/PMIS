import { prisma } from "./client";
import type { PeriodReportType } from "@/generated/prisma/enums";

export type CreateGeneratedReportData = {
  projectId: string;
  type: PeriodReportType;
  /** 期間身分（如 `MONTHLY:2026-08`）；不受伺服器時區影響。 */
  periodKey: string;
  periodStart: Date;
  periodEnd: Date;
  periodLabel: string;
  title: string;
  markdown: string;
  sources?: string | null;
  aiAuthored: boolean;
  generatedById?: string | null;
  generatedBy?: string | null;
};

/** 產出時間戳；覆寫既有草稿時一併更新，故不能靠 createdAt。 */
const stamp = () => new Date();

/**
 * 建立或覆寫草稿留存 —— 這是 `GeneratedReport` 唯一的寫入入口。
 *
 * 刻意不另外導出一個裸的 `create`：那條路徑不套用下述「同期只留一份草稿」
 * 的規則，而多一份自稱是同一個月的報表，就無從判斷以何者為準。
 *
 * 同一專案／週期／期間只保留一份草稿留存：有則覆寫，無則新建。
 *
 * 之所以不用 `upsert`：（projectId, type, periodStart）沒有唯一鍵，
 * 也不該有 —— 同期間可以同時存在一份定稿與一份草稿。
 * 因此以 status=DRAFT 為條件先查再寫。
 *
 * 併發下兩個同時的預覽有可能各建一份草稿；此處不加鎖，
 * 因為草稿本身可刪除，且定稿階段有「同期只允許一份 CONFIRMED」的守門。
 */
export async function upsertDraft(data: CreateGeneratedReportData) {
  /*
    期間鍵是留存的身分，空字串會讓不同期間互相覆寫。
    型別上它是必填，但字串的「必填」不排除空字串 ——
    在此擋下，而非等到兩個月份的報表互相覆蓋才發現。
  */
  if (!data.periodKey.trim()) {
    throw new Error("periodKey 不可為空：期間鍵是留存的身分");
  }
  /*
    取最新的一筆。`findFirst` 不給 orderBy 時的順序是不確定的，
    而歷史資料裡可能存在同期多份草稿（自動產製時代的殘骸）——
    不指定排序會導致「畫面顯示的是 A、覆寫到的是 B」。
  */
  const existing = await prisma.generatedReport.findFirst({
    where: {
      projectId: data.projectId,
      periodKey: data.periodKey,
      status: "DRAFT",
    },
    orderBy: { generatedAt: "desc" },
    select: { id: true },
  });
  if (!existing) {
    return prisma.generatedReport.create({ data: { ...data, generatedAt: stamp() } });
  }
  // 期間鍵（projectId／periodKey）即查找條件，不重複寫入
  return prisma.generatedReport.update({
    where: { id: existing.id },
    data: {
      periodStart: data.periodStart,
      periodEnd: data.periodEnd,
      periodLabel: data.periodLabel,
      title: data.title,
      markdown: data.markdown,
      sources: data.sources ?? null,
      aiAuthored: data.aiAuthored,
      generatedAt: stamp(),
      generatedById: data.generatedById ?? null,
      generatedBy: data.generatedBy ?? null,
    },
  });
}

export function findById(id: string) {
  return prisma.generatedReport.findUnique({ where: { id } });
}

/** 清單用的欄位；刻意不含 `markdown`（見 listByProject）。 */
const LIST_SELECT = {
  id: true,
  type: true,
  periodStart: true,
  periodEnd: true,
  periodLabel: true,
  title: true,
  status: true,
  aiAuthored: true,
  periodKey: true,
  generatedAt: true,
  generatedBy: true,
  confirmedAt: true,
  confirmedBy: true,
  createdAt: true,
} as const;

/**
 * 某專案的報表留存，依**產出時間**新到舊。
 *
 * 排序取 `generatedAt` 而非 `createdAt`：草稿覆寫不新建列，
 * 用 createdAt 排會讓「剛剛才重新生成、正顯示在畫面上的那一份」
 * 沉到清單下方，離它對應的預覽最遠 —— 正好與使用者要找它的路徑相反。
 *
 * 刻意**不取 `markdown`**：清單只需要辨識用的欄位，而全文動輒數十 KB，
 * 一次載入全部會把整個報表庫送到瀏覽器。要讀內容請用 `findById`
 * （對應 `openSavedReportAction`），一次只取一份。
 */
export async function listByProject(projectId: string, draftTake = 30) {
  /*
    定稿與草稿分開查再合併，而非單一 take。

    定稿是送審依據，且清單是唯一能開啟它們的 UI；若與草稿共用同一個
    take，草稿一多就會把去年的定稿擠出清單，等於讓已送審的文件在系統中消失。
    草稿可再生、可刪除，該被截斷的是草稿。
  */
  const [confirmed, drafts] = await Promise.all([
    prisma.generatedReport.findMany({
      where: { projectId, status: "CONFIRMED" },
      orderBy: { generatedAt: "desc" },
      select: LIST_SELECT,
    }),
    prisma.generatedReport.findMany({
      where: { projectId, status: "DRAFT" },
      orderBy: { generatedAt: "desc" },
      take: draftTake,
      select: LIST_SELECT,
    }),
  ]);
  return [...confirmed, ...drafts].sort(
    (a, b) => b.generatedAt.getTime() - a.generatedAt.getTime(),
  );
}

/** 同一專案、同期間的草稿留存（同期只保留一份）。 */
export function findDraftForPeriod(projectId: string, periodKey: string) {
  // 同 upsertDraft：明確取最新一筆，避免同期多份草稿時取到不確定的那個
  return prisma.generatedReport.findFirst({
    where: { projectId, periodKey, status: "DRAFT" },
    orderBy: { generatedAt: "desc" },
  });
}

/**
 * 同一專案、同期間是否已有定稿（同期只允許一份 CONFIRMED）。
 *
 * 以 `periodKey` 而非 `periodStart` 比對：後者由伺服器時區推導，
 * 部署時區一改（例如 UTC → Asia/Taipei），既有列與新查詢的值就不再相等，
 * 這道守門會**靜默**失效，而它是「哪一份才是那個月的送審依據」的唯一保證。
 */
export function findConfirmedForPeriod(projectId: string, periodKey: string) {
  return prisma.generatedReport.findFirst({
    where: { projectId, periodKey, status: "CONFIRMED" },
  });
}

/**
 * 標記定稿。
 *
 * 一併寫入 `confirmedPeriodKey`，讓「同期只允許一份定稿」由資料庫的
 * 唯一約束保證，而不是只靠服務層的 check-then-write —— 後者在兩個並行的
 * 確認之下會各自通過檢查而寫出兩份定稿。
 * 違反約束時 Prisma 丟 P2002，由呼叫端轉成可讀訊息。
 */
export function confirm(
  id: string,
  periodKey: string,
  by: { confirmedById?: string | null; confirmedBy?: string | null },
) {
  return prisma.generatedReport.update({
    where: { id },
    data: {
      status: "CONFIRMED",
      confirmedAt: new Date(),
      confirmedPeriodKey: periodKey,
      ...by,
    },
  });
}

/** Prisma 唯一約束違反。 */
export function isUniqueViolation(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    (e as { code?: unknown }).code === "P2002"
  );
}

/**
 * 刪除一份報表留存。
 *
 * 呼叫端須先確認其非 CONFIRMED —— 已確認者是當時送審依據的留存，
 * 不可刪除亦不可修改（見 schema 註解）。
 */
export function remove(id: string) {
  return prisma.generatedReport.delete({ where: { id } });
}

export type GeneratedReportRow = Awaited<ReturnType<typeof findById>>;

