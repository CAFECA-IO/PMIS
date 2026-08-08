import * as reportRepo from "@/repository/report.repository";
import * as supervisionRepo from "@/repository/supervisionReport.repository";
import * as memberRepo from "@/repository/projectMember.repository";
import * as savedReportRepo from "@/repository/generatedReport.repository";
import { getWorkItemDetails } from "@/service/project.service";
import * as faith from "@/service/faith.service";
import { canSeeAllProjects } from "@/lib/auth";
import { isPeriodReportFrozen } from "@/constant/pmis";
import { PERIOD_LABEL, PERIOD_REPORT_NAME } from "@/service/report-period";
import { buildReportMarkdown } from "@/service/report-template";
import { assembleReport } from "@/service/report-assemble";
import {
  loadDailyQtyTotalsInPeriod,
  loadDailyQtyTotalsUpTo,
} from "@/service/daily-qty.service";
import { periodKeyFor, weekStart } from "@/service/period-key";
import { formatDate } from "@/lib/utils";
import type { AccountRole } from "@/generated/prisma/enums";

export type ReportType = "DAILY" | "WEEKLY" | "MONTHLY" | "QUARTERLY" | "ANNUAL";
export type Actor = { id: string; name: string; role: AccountRole };

export const REPORT_TYPES: { value: ReportType; label: string }[] = [
  { value: "DAILY", label: "日報" },
  { value: "WEEKLY", label: "週報" },
  { value: "MONTHLY", label: "月報" },
  { value: "QUARTERLY", label: "季報" },
  { value: "ANNUAL", label: "年報" },
];

const TYPE_LABEL: Record<ReportType, string> = {
  DAILY: "日報",
  WEEKLY: "週報",
  MONTHLY: "月報",
  QUARTERLY: "季報",
  ANNUAL: "年報",
};

const startOfDay = (d: Date) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
const endOfDay = (d: Date) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

/**
 * 基準日的合理範圍。
 *
 * `<input type="date">` 在年份欄位逐鍵輸入時會**每按一鍵就送出一次**
 * 完整日期：輸入 2026 依序產生 0002／0020／0202／2026 年。
 * 沒有守門的話，西元 2 年、20 年、202 年會各自成為一個「期間」而各留一份報表。
 * 用戶端防抖只能減少次數，不能保證 —— 守門必須在伺服器端。
 */
const MIN_YEAR = 2000;
const MAX_YEAR = 2100;

/** 表單送來的純日期（`<input type="date">` 的格式）。 */
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * 解析基準日；無效或超出合理範圍時回 `null`（呼叫端應拒絕該請求）。
 *
 * 未給定則以今日為準 —— 那是使用者沒有指定期間時唯一合理的預設。
 *
 * **純日期字串一律以「本地日曆日」解析，不用 `new Date(str)`。**
 * JS 對 `"YYYY-MM-DD"` 是以 UTC 午夜解析，而下游的 `periodRange`
 * 用本地取值（`getFullYear`／`getMonth`）決定期間與身分鍵 —— 兩套慣例混用時，
 * 在 UTC 偏移為負的部署選 2026-01-01 會得到 `ANNUAL:2025`：
 * 使用者以為在產 2026 年報，系統卻覆寫了 2025 年的草稿。
 * 期間鍵是留存的身分，這種漂移沒有任何跡象可循。
 * 上面〈日曆日與時間點的界線〉那段講的是同一件事，只是那時只修了日報邊界。
 *
 * 帶時間的 ISO 字串（少見，非表單路徑）維持原樣解析：
 * 那種輸入本來就指定了時點，沒有「使用者心中的日曆日」可還原。
 */
export function parseRefDate(refIso: string | undefined): Date | null {
  if (!refIso) return new Date();
  const m = DATE_ONLY.exec(refIso);
  const d = m
    ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    : new Date(refIso);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  if (y < MIN_YEAR || y > MAX_YEAR) return null;
  /*
    `new Date(2026, 12, 40)` 不會是 NaN，而是靜默進位到隔年 ——
    純日期字串的年月日必須原樣還原，否則 `2026-13-01` 會變成 2027 年 1 月。
  */
  if (
    m &&
    (d.getFullYear() !== Number(m[1]) ||
      d.getMonth() !== Number(m[2]) - 1 ||
      d.getDate() !== Number(m[3]))
  ) {
    return null;
  }
  return d;
}

/*
  ── 日曆日與時間點的界線 ───────────────────────────────────

  `SupervisionReport.reportDate` 存的是**日曆日**：它由
  `new Date("YYYY-MM-DD")` 產生，而 JS 對純日期字串一律以 **UTC 午夜**解析。
  但 `periodRange` 的期間邊界是用本地建構子算的。兩套慣例混用時，
  在 UTC 偏移為負的部署（如 UTC−5）中，本地 8/1 00:00 等於 UTC 8/1 05:00，
  於是「8 月 1 日的日報」（UTC 8/1 00:00）會落在 8 月的區間之外
  —— 當月第一天的數量整個消失，而報表看起來完全正常。

  故凡是要拿來和 `reportDate` 比較的邊界，一律先換算成同一個基準：
  取該日期的**日曆日**，再組成 UTC 的當日起／迄。
*/
const utcDayStart = (d: Date) =>
  new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
const utcDayEnd = (d: Date) =>
  new Date(
    Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999),
  );

/**
 * 期間的起訖、顯示標籤與**身分鍵**。
 *
 * `key` 一律取自 `period-key.periodKeyFor`，不在此另寫一份 ——
 * 回填腳本需要同一套算法，兩份實作靠註解約定一致遲早會分岔，
 * 而分岔的後果是新舊資料被當成不同期間，且定稿無法事後修正。
 *
 * 鍵取自 `ref` 的**本地日曆日**，故呼叫端必須先以 `parseRefDate` 解析，
 * 讓 `ref` 代表使用者心中的那一天（見該函式的說明）。
 */
function periodRange(type: ReportType, ref: Date) {
  const y = ref.getFullYear();
  const m = ref.getMonth();
  const key = periodKeyFor(type, ref);
  switch (type) {
    case "DAILY":
      return {
        start: startOfDay(ref),
        end: endOfDay(ref),
        label: `${formatDate(ref)}`,
        key,
      };
    case "WEEKLY": {
      const start = startOfDay(weekStart(ref));
      const end = endOfDay(
        new Date(
          start.getFullYear(),
          start.getMonth(),
          start.getDate() + 6,
        ),
      );
      return {
        start,
        end,
        label: `${formatDate(start)} ~ ${formatDate(end)}`,
        key,
      };
    }
    case "MONTHLY":
      return {
        start: new Date(y, m, 1),
        end: endOfDay(new Date(y, m + 1, 0)),
        label: `${y} 年 ${m + 1} 月`,
        key,
      };
    case "QUARTERLY": {
      const q = Math.floor(m / 3);
      return {
        start: new Date(y, q * 3, 1),
        end: endOfDay(new Date(y, q * 3 + 3, 0)),
        label: `${y} 年 Q${q + 1}`,
        key,
      };
    }
    case "ANNUAL":
    default:
      return {
        start: new Date(y, 0, 1),
        end: endOfDay(new Date(y, 11, 31)),
        label: `${y} 年`,
        key,
      };
  }
}

export async function canAccess(projectId: string, actor: Actor) {
  if (canSeeAllProjects(actor.role)) return true;
  return Boolean(await memberRepo.exists(projectId, actor.id));
}

export type GeneratedReport = {
  title: string;
  periodLabel: string;
  typeLabel: string;
  markdown: string;
  // Info: (20260803 - Julian) 治理：本產出為 AI 草稿，核定前需人工確認（人在迴路）
  isDraft: boolean;
  // Info: (20260803 - Julian) 治理：本次生成引用的數據集來源（稽核可回溯）
  sources: string[];
  // Info: (20260803 - Julian) 稽核：本體是否由 LLM 主導（false = 回退決定論組裝）
  aiAuthored: boolean;
};


/**
 * Info: (20260804 - Julian)
 * 產出監造報表（週／月／季／年），採五層式監造月報範本。
 *
 * 報表結構屬法定格式，故骨架由程式決定論組裝（`report-template`），
 * LLM 僅撰寫「期間評述」一段；評述失敗時以決定論句子回退，報表永遠可產出。
 * 圖表以 custom-scurve / custom-progress / mermaid 圍欄嵌入，於前端渲染。
 */
export async function generateReport(
  projectId: string,
  type: ReportType,
  /**
   * 基準日；由呼叫端以 `parseRefDate` 解析後傳入。
   *
   * 刻意不在此再讀一次時鐘：先前 `generateReportView` 與本函式各自
   * `new Date()`，在跨月的午夜前後產製，`periodLabel` 與 `periodKey`
   * 會落在不同月份 —— 報表標題寫 7 月、留存卻歸在 8 月。
   */
  ref: Date,
  actor: Actor,
): Promise<GeneratedReport | null> {
  if (!(await canAccess(projectId, actor))) return null;
  const project = await reportRepo.getProject(projectId);
  if (!project) return null;

  const { start, end, label } = periodRange(type, ref);
  const typeLabel = TYPE_LABEL[type];
  const periodWord = PERIOD_LABEL[type];

  /*
    取數：期間內的全部日報（含草稿）、進度基準用的工項明細、兩組數量加總。

    決策 G 的過濾**不在此處做**，交給 `assembleReport` ——
    由呼叫端過濾就會出現「有人記得、有人忘記」的兩套母體，
    那正是先前施工天數含草稿而數量不含的成因。
  */
  // 與 reportDate 同基準（見 utcDayStart 的說明）；直接用本地邊界會漏掉當月第一天
  const qStart = utcDayStart(start);
  const qEnd = utcDayEnd(end);

  /*
    累計一律以**期末**為上限，不是「現在」。

    先前此處取全期間加總（`loadDailyQtyTotals`／無上限的 `getWorkItemDetails`），
    於 8/7 補產 2 月月報時會把 3–7 月的量算進 2 月的累計，
    印出「累計超前」這種當時並不存在的數字 —— 而月報是送審文件。
    同一 codebase 的日報進度條（`getDailyProgress`）本就以當日為界，
    兩者若不同界，同一天會出現兩個「累計完成」，正是決策 A 要消滅的問題。
  */
  const [allDailyReports, wiDetails, cumulativeQtyTotals, periodQtyTotals] =
    await Promise.all([
      supervisionRepo.listByProjectInPeriod(projectId, qStart, qEnd),
      getWorkItemDetails(projectId, end),
      loadDailyQtyTotalsUpTo(projectId, qEnd),
      loadDailyQtyTotalsInPeriod(projectId, qStart, qEnd),
    ]);

  /*
    每個數字是什麼，全部由純函式決定（`report-assemble`）。
    本函式只剩取數、呼叫 LLM、蓋產出時間三件事 ——
    歷次出問題的都是組裝而非算式，組裝可測才守得住。
  */
  const { template, facts } = assembleReport({
    type,
    typeLabel,
    period: { start, end, label },
    project: {
      name: project.name,
      code: project.code,
      client: project.client,
      contractor: project.contractor,
      supervisor: project.supervisor,
      budget: project.budget,
      startDate: project.startDate,
      endDate: project.endDate,
      contractWorkDays: project.contractWorkDays ?? null,
      scopeTitles: project.scopeItems.map((s) => s.title),
    },
    dailyReports: allDailyReports,
    workItemDetails: wiDetails,
    ledgerWorkItems: project.workItems,
    cumulativeQtyTotals,
    periodQtyTotals,
  });

  // ── 期間評述：僅餵摘要層既算數字，LLM 不得引入其他資訊 ──
  const review = await faith.generatePeriodReview(
    facts,
    periodWord,
    PERIOD_REPORT_NAME[type],
  );

  const markdown = buildReportMarkdown({
    ...template,
    generatedAt: new Date(),
    review,
  });

  // Info: (20260804 - Julian) 治理：留存本次引用的資料來源，供稽核回溯
  const sources = [
    "專案基本資料（Project）",
    "契約標的－工程概要（ContractScopeItem.title）",
    "履約事項權重與期限（ContractObligation）",
    "工程分項估驗台帳（WorkItem）",
    "監造日報（SupervisionReport）",
  ];

  return {
    title: `${project.name}｜${label}${typeLabel}`,
    periodLabel: label,
    typeLabel,
    markdown,
    isDraft: true,
    sources,
    aiAuthored: Boolean(review),
  };
}

// ── 報表留存（決策 J-a）───────────────────────────────────

export type ReportView = {
  report: GeneratedReport;
  /**
   * 畫面上這一份的留存 id。
   * null 代表未留存 —— 無編輯權限，或本期已有定稿（見 confirmedId）。
   */
  savedId: string | null;
  /** 本期已有定稿時的該份 id；此時畫面上的即時預覽不是送審依據。 */
  confirmedId: string | null;
};

/**
 * 產出報表並**同步留存**畫面上這一份（決策 J-a）。
 *
 * 為何產出即留存，而非另設一顆「留存」按鈕：
 * 報表的每個數字都是即時推導（決策 A／F／I），連期間評述都由 LLM 現寫，
 * 同一期間隔五分鐘產生兩次結果就不同。若按鈕另跑一次產製，
 * 存下來的必然不是使用者讀過的那一份 —— 接著按「確認定稿」，
 * 就凍結了一份沒人讀過的送審文件。故此處只產一次，
 * 回傳的 markdown 與寫進 `GeneratedReport.markdown` 的是同一個字串。
 *
 * 草稿以「同專案／同週期／同期間」覆寫（見 repository 的 `upsertDraft`），
 * 因此反覆切換日期不會堆出大量無意義草稿。
 *
 * 本期已有定稿時不覆寫、也不另存草稿：定稿是當時送審依據的凍結內容，
 * 而預覽仍應顯示現況（否則使用者無從發現現況已與定稿不同）。
 */
export async function generateReportView(
  projectId: string,
  type: ReportType,
  refIso: string | undefined,
  actor: Actor,
  /** 無編輯權限者只讀不寫：純瀏覽不應在留存清單留下紀錄。 */
  persist: boolean,
): Promise<ReportView | null> {
  const ref = parseRefDate(refIso);
  if (!ref) return null;

  // ref 只解析一次，往下傳同一個時點
  const report = await generateReport(projectId, type, ref, actor);
  if (!report) return null;

  const { start, end, key } = periodRange(type, ref);

  const confirmed = await savedReportRepo.findConfirmedForPeriod(
    projectId,
    key,
  );
  if (confirmed || !persist) {
    return { report, savedId: null, confirmedId: confirmed?.id ?? null };
  }

  const saved = await savedReportRepo.upsertDraft({
    projectId,
    type,
    periodKey: key,
    periodStart: start,
    periodEnd: end,
    periodLabel: report.periodLabel,
    title: report.title,
    markdown: report.markdown,
    sources: report.sources.length > 0 ? report.sources.join("\n") : null,
    aiAuthored: report.aiAuthored,
    generatedById: actor.id,
    generatedBy: actor.name || null,
  });
  return { report, savedId: saved.id, confirmedId: null };
}

/**
 * 某期間**已留存**的報表（唯讀）。
 *
 * 存在的理由是把「看報表」與「產報表」拆開。產製一份報表要呼叫 LLM
 * 並寫一列留存，兩者都是有代價的副作用，不該由開啟頁面或改一個日期觸發
 * —— 先前正是如此：光是打開 /logs 就跑一次付費產製並留下一列草稿，
 * 而在日期欄逐鍵輸入年份會連續產生四份。
 *
 * 因此畫面掛載與切換期間一律走本函式（純讀取，不呼叫 LLM、不寫入），
 * 只有使用者明確按下「產生」才走 `generateReportView`。
 *
 * 同期同時有定稿與草稿時回定稿：定稿才是該期間的送審依據。
 */
export async function getPeriodReport(
  projectId: string,
  type: ReportType,
  refIso: string | undefined,
  actor: Actor,
) {
  if (!(await canAccess(projectId, actor))) return null;
  const ref = parseRefDate(refIso);
  if (!ref) return null;
  const { label, key } = periodRange(type, ref);

  const row =
    (await savedReportRepo.findConfirmedForPeriod(projectId, key)) ??
    (await savedReportRepo.findDraftForPeriod(projectId, key));
  if (!row) return { periodLabel: label, saved: null };

  return {
    periodLabel: label,
    saved: {
      id: row.id,
      title: row.title,
      status: row.status,
      markdown: row.markdown,
      generatedAt: row.generatedAt,
      generatedBy: row.generatedBy,
      aiAuthored: row.aiAuthored,
    },
  };
}

/**
 * 某專案的留存清單；無權限時回 `null` 而非空陣列。
 *
 * 兩者在畫面上意義不同：空陣列會顯示「尚無留存的報表」，
 * 而實際情形是「你看不到」—— 使用者會以為報表從未產生過。
 */
export async function listSavedReports(projectId: string, actor: Actor) {
  if (!(await canAccess(projectId, actor))) return null;
  return savedReportRepo.listByProject(projectId);
}

export async function getSavedReport(id: string, actor: Actor) {
  const row = await savedReportRepo.findById(id);
  if (!row || !(await canAccess(row.projectId, actor))) return null;
  return row;
}

export type ConfirmResult = { ok: true } | { ok: false; error: string };

/** 錯誤訊息用的時間格式；要讓使用者對得上畫面上的「產生於」。 */
const formatStamp = (d: Date): string => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

/**
 * 人工確認定稿。
 *
 * 確認後內容即為當時送審依據的快照，不可再修改或刪除；
 * 需要更新請重新產生一份。同一期間僅允許一份定稿 ——
 * 兩份都宣稱是「那個月的報表」時，無從判斷以何者為準。
 *
 * **`expectedGeneratedAt` 是必填的版本守門，不是可選的保險。**
 * 草稿是同一列原地覆寫（`upsertDraft`），所以 id 不足以指明「哪一版」：
 * A 分頁 09:00 看到的草稿，可能在 09:05 被另一個分頁或同事的重新生成
 * 覆寫成完全不同的內容；A 分頁的畫面與 id 都沒變，按下確認就凍結了
 * 一份沒人讀過的送審文件。呼叫端一律傳入「畫面上那一份」的產出時間，
 * 對不上就拒絕 —— 寧可要求使用者重看一次，也不要凍結他沒讀過的東西。
 */
export async function confirmSavedReport(
  id: string,
  actor: Actor,
  /** 畫面上那一份的 `generatedAt`（毫秒）。 */
  expectedGeneratedAt: number,
): Promise<ConfirmResult> {
  const row = await savedReportRepo.findById(id);
  if (!row) return { ok: false, error: "找不到此報表。" };
  if (!(await canAccess(row.projectId, actor))) {
    return { ok: false, error: "無權確認此報表。" };
  }
  if (isPeriodReportFrozen(row.status)) return { ok: true };

  /*
    期間鍵為空的列只可能來自「schema 已加 periodKey，但回填腳本還沒跑」
    的過渡狀態（見 prisma/backfill-period-key.ts 的三步驟）。
    此時放行會寫入 confirmedPeriodKey = ""，而唯一約束是
    (projectId, confirmedPeriodKey) —— 空字串會讓它退化成
    「每個專案只能有一份定稿」：定稿九月時會收到「八月已有定稿」。
    那個錯誤訊息完全指不到真正的原因，故在此擋下並明說要做什麼。
  */
  if (!row.periodKey.trim()) {
    return {
      ok: false,
      error:
        "此留存缺少期間鍵，尚未完成資料回填，暫時無法定稿。請先執行 npm run db:backfill -- --apply。",
    };
  }

  if (row.generatedAt.getTime() !== expectedGeneratedAt) {
    return {
      ok: false,
      error: `此草稿已於 ${formatStamp(row.generatedAt)} 被重新產生，內容與你看到的不同。請重新檢視最新版本後再確認定稿。`,
    };
  }

  /*
    先查一次只為了給出好讀的訊息；**真正的守門是資料庫的唯一約束**
    （`@@unique([projectId, confirmedPeriodKey])`）。
    只靠這裡的檢查是 check-then-write：兩個並行的確認都會通過檢查，
    然後各寫一份定稿，屆時無從判斷哪一份才是送審依據。
  */
  const existing = await savedReportRepo.findConfirmedForPeriod(
    row.projectId,
    row.periodKey,
  );
  if (existing) {
    return {
      ok: false,
      error: `${row.periodLabel}已有一份定稿報表，請先確認要以何者為準。`,
    };
  }

  try {
    await savedReportRepo.confirm(id, row.periodKey, {
      confirmedById: actor.id,
      confirmedBy: actor.name || null,
    });
  } catch (e) {
    // 競態下由資料庫擋下；轉成與上方相同的訊息，使用者不需要知道差別
    if (savedReportRepo.isUniqueViolation(e)) {
      return {
        ok: false,
        error: `${row.periodLabel}已有一份定稿報表，請先確認要以何者為準。`,
      };
    }
    throw e;
  }
  return { ok: true };
}

/** 刪除草稿留存；已確認者不可刪除。 */
export async function deleteSavedReport(
  id: string,
  actor: Actor,
): Promise<ConfirmResult> {
  const row = await savedReportRepo.findById(id);
  if (!row) return { ok: false, error: "找不到此報表。" };
  if (!(await canAccess(row.projectId, actor))) {
    return { ok: false, error: "無權刪除此報表。" };
  }
  if (isPeriodReportFrozen(row.status)) {
    return { ok: false, error: "已確認的報表為送審依據之留存，不可刪除。" };
  }
  await savedReportRepo.remove(id);
  return { ok: true };
}
