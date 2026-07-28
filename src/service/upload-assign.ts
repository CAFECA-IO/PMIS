/**
 * 建置過程上傳檔案的歸屬整理（純函式，無 I/O，便於單元測試）。
 *
 * 專案建置時尚無專案 id，費思上傳的契約／決標文件會先歸檔為「未指派」。
 * 專案建立成功後，這些檔案應改歸該專案 —— 否則使用者得回檔案管理手動補指派。
 */

/**
 * 整理待指派的檔案 id：去除空值、去重、保留出現順序。
 * 同一次建置可能上傳多份文件，也可能因重試而重複收到同一個 id。
 */
export function normalizeUploadIds(
  ids: (string | null | undefined)[] | null | undefined,
): string[] {
  if (!ids?.length) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of ids) {
    const id = raw?.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/** 一次建置最多歸屬的檔案數，避免呼叫端傳入異常長的清單。 */
export const MAX_ASSIGN_IDS = 50;

/** 超過上限時只取前段，並回報是否被截斷。 */
export function limitUploadIds(ids: string[]): {
  ids: string[];
  truncated: boolean;
} {
  if (ids.length <= MAX_ASSIGN_IDS) return { ids, truncated: false };
  return { ids: ids.slice(0, MAX_ASSIGN_IDS), truncated: true };
}
