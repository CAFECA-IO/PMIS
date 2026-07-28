/**
 * 檔案管理的提示文案（純函式，無 I/O，便於單元測試）。
 *
 * 刪除確認與上傳通知的措辭集中在此，理由是這些字句必須「說得準」：
 * 刪除資料夾時要講清楚會連帶刪掉多少內容，上傳結束時要如實回報成敗，
 * 這類正確性適合以測試釘住，而不是散落在元件的 JSX 裡。
 */

import type { NodeKind, SubtreeCount } from "./file-tree";

export type DeleteTarget = {
  kind: NodeKind;
  name: string;
};

/**
 * 資料夾底下（含子層）的內容量。
 * 沿用 file-tree 的型別，避免同一概念出現兩份互相漂移的定義。
 */
export type SubtreeCounts = SubtreeCount;

export type ConfirmCopy = {
  title: string;
  description: string;
  confirmLabel: string;
};

/**
 * 刪除確認的文案。
 *
 * 資料夾一律列出連帶影響的數量 —— 使用者只看到「確定刪除？」時，
 * 無法判斷這個資料夾底下是否還藏著三層子資料夾與數十個檔案。
 */
export function deleteConfirmCopy(
  target: DeleteTarget,
  contents?: SubtreeCounts | null,
): ConfirmCopy {
  if (target.kind === "file") {
    return {
      title: `刪除檔案「${target.name}」？`,
      description:
        "此檔案將從檔案管理移除，原始檔案仍保留於儲存區，必要時可由管理者復原。",
      confirmLabel: "刪除檔案",
    };
  }

  const folders = contents?.folders ?? 0;
  const files = contents?.files ?? 0;
  const parts: string[] = [];
  if (folders > 0) parts.push(`${folders} 個子資料夾`);
  if (files > 0) parts.push(`${files} 個檔案`);

  const scope =
    parts.length > 0
      ? // 「與」是一般字元，後接阿拉伯數字須留空格（與全文「共 8 個檔案」一致）
        `連帶刪除其中的 ${parts.join("與 ")}。`
      : "此資料夾目前沒有內容。";

  return {
    title: `刪除資料夾「${target.name}」？`,
    description: `${scope}原始檔案仍保留於儲存區，必要時可由管理者復原。`,
    confirmLabel: parts.length > 0 ? "一併刪除" : "刪除資料夾",
  };
}

// ── 上傳通知 ────────────────────────────────────────────────

/** 開始上傳時的通知標題與說明。 */
export function uploadStartCopy(
  total: number,
  folderName: string,
): { title: string; description: string } {
  return {
    title: `正在上傳 ${total} 個檔案`,
    description: `目的地：${folderName}`,
  };
}

/** 上傳中的進度說明。百分比以已完成筆數計算。 */
export function uploadProgressCopy(
  done: number,
  total: number,
): { description: string; percent: number } {
  const safeTotal = total > 0 ? total : 0;
  const capped = Math.min(Math.max(done, 0), safeTotal);
  return {
    description: safeTotal === 0 ? "準備中…" : `已完成 ${capped} / ${safeTotal}`,
    percent: safeTotal === 0 ? 0 : Math.round((capped / safeTotal) * 100),
  };
}

export type UploadOutcome = {
  saved: number;
  failed: number;
  /** 失敗檔名與原因，用於通知細節；過長會截斷。 */
  failures?: { name: string; reason: string }[];
  folderName: string;
};

export type UploadResultCopy = {
  title: string;
  description: string;
  variant: "success" | "error" | "info";
};

/** 彈出通知中最多列出的失敗檔案數，避免通知變成一整片錯誤清單。 */
export const MAX_LISTED_FAILURES = 3;

/**
 * 上傳結束的彈出通知。
 * 成敗如實呈現：只要有失敗就不會說成成功，並直接點出是哪些檔案，
 * 否則使用者得自己比對清單才知道少了什麼。
 */
export function uploadResultCopy(outcome: UploadOutcome): UploadResultCopy {
  const { saved, failed, folderName } = outcome;
  const failures = outcome.failures ?? [];

  const listed = failures.slice(0, MAX_LISTED_FAILURES);
  const rest = failures.length - listed.length;
  const lines = listed.map((f) => `${f.name}：${f.reason}`);
  if (rest > 0) lines.push(`…另有 ${rest} 個檔案失敗`);

  const describe = (extra: string[]) =>
    [`目的地：${folderName}`, ...extra].join("\n");

  if (saved === 0 && failed > 0) {
    return {
      title: `上傳失敗，${failed} 個檔案未存入`,
      description: describe(lines),
      variant: "error",
    };
  }
  if (failed > 0) {
    return {
      title: `已上傳 ${saved} 個檔案，${failed} 個失敗`,
      description: describe(lines),
      variant: "error",
    };
  }
  if (saved === 0) {
    return {
      title: "沒有檔案被上傳",
      description: describe([]),
      variant: "info",
    };
  }
  return {
    title: `已上傳 ${saved} 個檔案`,
    description: describe([]),
    variant: "success",
  };
}
