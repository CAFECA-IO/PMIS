/**
 * 檔案管理的搜尋比對（純函式，無 I/O，便於單元測試）。
 *
 * 比對一律在記憶體進行，不依賴資料庫的 LIKE 行為：
 * SQLite 的 LIKE 預設對 ASCII 大小寫不敏感，但這是引擎的預設值而非
 * 我們的保證，日後若換資料庫或改 pragma 就會靜默失去大小寫不敏感。
 * 掃描量以 SEARCH_SCAN_LIMIT 設上限，超出時明確告知使用者範圍不完整。
 */

/** 單一專案一次搜尋最多掃描的檔案筆數。 */
export const SEARCH_SCAN_LIMIT = 5000;

/** 回傳給前端的結果上限，避免一次渲染上千列。 */
export const MAX_SEARCH_RESULTS = 200;

/** 整理輸入：去除前後空白並把連續空白收斂為單一空格。 */
export function normalizeQuery(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw.replace(/\s+/g, " ").trim();
}

/**
 * 拆出關鍵詞。以空白分隔，全部轉小寫供不分大小寫比對。
 * 多個關鍵詞為 AND：「契約 pdf」要同時命中，語意才符合使用者預期。
 */
export function queryTerms(query: string): string[] {
  const normalized = normalizeQuery(query);
  if (!normalized) return [];
  return normalized.split(" ").map((t) => t.toLowerCase());
}

/** 是否構成有效搜尋（空字串不搜尋，否則會列出全部檔案）。 */
export function isSearchable(query: string | null | undefined): boolean {
  return queryTerms(normalizeQuery(query)).length > 0;
}

/**
 * 名稱是否命中查詢。
 * 不分大小寫的子字串比對；多關鍵詞需全部命中（AND）。
 */
export function matchesQuery(
  name: string | null | undefined,
  query: string | null | undefined,
): boolean {
  const terms = queryTerms(normalizeQuery(query));
  if (terms.length === 0) return false;
  const haystack = (name ?? "").toLowerCase();
  return terms.every((t) => haystack.includes(t));
}

/** 搜尋結果的所在路徑，如「捷運藍線 / 契約文件」。 */
export function joinPath(names: string[]): string {
  return names.filter((n) => n.trim() !== "").join(" / ");
}

/** 截斷過長的結果清單，並回報是否被截斷。 */
export function limitResults<T>(
  items: T[],
  max: number = MAX_SEARCH_RESULTS,
): { items: T[]; truncated: boolean } {
  if (items.length <= max) return { items, truncated: false };
  return { items: items.slice(0, max), truncated: true };
}

/** 搜尋結果的說明文字。 */
export function searchSummary(input: {
  query: string;
  count: number;
  truncated: boolean;
  scanTruncated: boolean;
}): string {
  const { query, count, truncated, scanTruncated } = input;
  if (count === 0) {
    return `找不到符合「${query}」的檔案或資料夾。`;
  }
  const head = truncated
    ? `符合「${query}」的前 ${count} 筆`
    : `符合「${query}」共 ${count} 筆`;
  return scanTruncated
    ? `${head}（檔案數超過搜尋上限，結果可能不完整）`
    : head;
}
