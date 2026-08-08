/**
 * 彙整報表的**期間身分鍵**（純函式，無相依，便於單元測試與腳本共用）。
 *
 * 鍵是留存的身分（見 schema 對 `GeneratedReport.periodKey` 的說明）：
 * 以文字表達「哪一個期間」，取代原先以 `periodStart` 相等比對的做法
 * —— 後者是絕對時點，部署時區一改就對不上，
 * 「同期只有一份定稿」的守門會靜默失效。
 *
 * **為何獨立成一個檔案**：`prisma/backfill-period-key.ts` 需要同一套算法。
 * 先前那支腳本是手抄第二份實作，靠註解約定「必須與 periodRange 完全一致」
 * —— 兩份今天一致，但沒有任何東西在其中一份改動時攔下來，
 * 而不一致的後果是回填出來的鍵永遠對不上、且定稿無法修正。
 * 本檔不引用任何模組（含 `@/` 別名），故腳本可用相對路徑直接匯入。
 *
 * **鍵一律由傳入 Date 的「本地日曆日」取得。** 呼叫端有責任先讓那個 Date
 * 代表使用者心中的日曆日（見 `report.service.parseRefDate`）：
 * `new Date("2026-01-01")` 是 UTC 午夜，在 UTC−5 讀出來是 2025-12-31，
 * 於是使用者選 2026 年而系統覆寫 2025 年的草稿。
 */

/** 與 `report.service.ReportType` 相同的字面集合；此處不 import 以維持零相依。 */
export type PeriodKeyType =
  | "DAILY"
  | "WEEKLY"
  | "MONTHLY"
  | "QUARTERLY"
  | "ANNUAL";

const pad = (n: number) => String(n).padStart(2, "0");

/** 本地日曆日的 `YYYY-MM-DD`。 */
export const ymdKey = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** 週的起日（週一）；與 `periodRange` 的 WEEKLY 分支同一算法。 */
export function weekStart(ref: Date): Date {
  const dow = (ref.getDay() + 6) % 7; // 0 = 星期一
  return new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() - dow);
}

/**
 * 期間身分鍵。
 *
 * `ref` 為該期間內的任一日（通常是使用者選的基準日）；
 * 同一期間內的任何一天都必須得到同一個鍵。
 */
export function periodKeyFor(type: PeriodKeyType, ref: Date): string {
  const y = ref.getFullYear();
  const m = ref.getMonth();
  switch (type) {
    case "DAILY":
      return `DAILY:${ymdKey(ref)}`;
    case "WEEKLY":
      return `WEEKLY:${ymdKey(weekStart(ref))}`;
    case "MONTHLY":
      return `MONTHLY:${y}-${pad(m + 1)}`;
    case "QUARTERLY":
      return `QUARTERLY:${y}-Q${Math.floor(m / 3) + 1}`;
    case "ANNUAL":
    default:
      return `ANNUAL:${y}`;
  }
}

/**
 * 由期間鍵反推顯示標籤，供回填腳本自我檢查用。
 *
 * 腳本要把既有列的 `periodStart` 推回鍵，而 `periodStart` 是絕對時點：
 * 若腳本執行的時區與當初寫入時不同，推出來的鍵會落在相鄰期間，
 * 且該錯誤無法從產品內修正（定稿不可刪改）。
 * 既有列的 `periodLabel` 是當初以正確時區產生的文字，
 * 拿它與本函式的輸出比對即可在寫入前攔下整批錯誤。
 */
export function labelForKey(key: string): string | null {
  const [type, rest] = key.split(":");
  if (!rest) return null;
  switch (type) {
    case "MONTHLY": {
      const [y, m] = rest.split("-");
      return y && m ? `${y} 年 ${Number(m)} 月` : null;
    }
    case "QUARTERLY": {
      const [y, q] = rest.split("-");
      return y && q ? `${y} 年 ${q}` : null;
    }
    case "ANNUAL":
      return `${rest} 年`;
    // DAILY／WEEKLY 的標籤帶格式化日期，交由呼叫端另行判斷
    default:
      return null;
  }
}
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
