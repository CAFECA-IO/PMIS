import type { ObligationStatus } from "@/constant/obligation";

/**
 * 履約事項的完成條件（純函式，無 I/O，便於單元測試）。
 *
 * 規則 ——
 * 一項履約事項要完成，歸屬它的工程分項必須全部完成。
 * 這條規則的意義在於「完成」是有憑據的：契約事項的完成應該對應到
 * 實際做完的工作，而不是承辦人在清單上按一下。
 *
 * 刻意的例外：沒有任何工程分項時允許完成。
 * 審查計畫書、提報表單這類管理型事項本來就不會有工程分項，
 * 擋下來只會迫使使用者亂建假分項來繞過限制 —— 那比不擋更糟，
 * 因為假分項會汙染進度上捲的計算。
 */

/** 判斷完成條件所需的工程分項資訊。 */
export type WorkItemState = {
  id: string;
  name: string;
  status: string;
  progress: number;
};

/** 視為已完成的工程分項狀態。 */
export const DONE_WORK_ITEM_STATUS = "COMPLETED";

export type CompletionCheck = {
  /** 是否可以完成。 */
  ok: boolean;
  /** 阻擋完成的工程分項（未完成者）。 */
  blockers: WorkItemState[];
  /** 歸屬的工程分項總數。 */
  total: number;
  /** 已完成數。 */
  done: number;
};

/**
 * 這項履約事項現在可以完成嗎？
 *
 * 只看狀態、不看百分比：進度 100% 但狀態仍為「進行中」的分項，
 * 代表承辦人還沒確認完成，此時履約事項就不該被結案。
 * 反過來把 progress 也納入條件會讓規則變成兩套標準，
 * 使用者無從得知要改哪一個才過關。
 */
export function checkCompletion(workItems: WorkItemState[]): CompletionCheck {
  const blockers = workItems.filter((w) => w.status !== DONE_WORK_ITEM_STATUS);
  return {
    ok: blockers.length === 0,
    blockers,
    total: workItems.length,
    done: workItems.length - blockers.length,
  };
}

/** 是否已完成（用於畫面上判斷要不要顯示完成按鈕）。 */
export function isDone(status: ObligationStatus | string): boolean {
  return status === "DONE";
}

/** 顯示在按鈕旁的進度說明，如「工程分項 3/5 已完成」。 */
export function progressLabel(check: CompletionCheck): string | null {
  if (check.total === 0) return null;
  return `工程分項 ${check.done}/${check.total} 已完成`;
}

/**
 * 不能完成的原因。
 *
 * 明確列出卡住的分項名稱（多則只列前幾項並說明還有幾項），
 * 只寫「尚有未完成分項」會讓使用者得自己去比對是哪一項。
 */
export const MAX_NAMED_BLOCKERS = 3;

export function blockReason(check: CompletionCheck): string | null {
  if (check.ok) return null;
  const named = check.blockers.slice(0, MAX_NAMED_BLOCKERS).map((w) => w.name);
  const rest = check.blockers.length - named.length;
  const list = rest > 0 ? `${named.join("、")} 等 ${check.blockers.length} 項` : named.join("、");
  return `尚有工程分項未完成：${list}`;
}

/** 完成確認視窗的文案。 */
export type ConfirmCopy = { title: string; description: string };

/**
 * 完成履約事項的確認文案。
 *
 * 一併寫出會連帶發生什麼（寫入完成日、轉為完成狀態），
 * 因為這個動作會進到進度上捲與預警判定，不是單純改一個標記。
 */
export function completeConfirm(
  title: string,
  check: CompletionCheck,
): ConfirmCopy {
  const scope =
    check.total === 0
      ? "此事項沒有歸屬的工程分項。"
      : `歸屬的 ${check.total} 項工程分項均已完成。`;
  return {
    title: `完成「${title}」？`,
    description: `${scope}確認後將寫入今日為實際完成日，狀態轉為「完成」，並反映到專案進度與預警判定。`,
  };
}

/** 完成單一工程分項的確認文案。 */
export function completeWorkItemConfirm(name: string): ConfirmCopy {
  return {
    title: `完成「${name}」？`,
    description:
      "確認後此工程分項的狀態將轉為「已完成」、完成百分比設為 100%，未填實際完工日者填入今日。",
  };
}

/** 完成百分比的合法範圍。 */
export function clampProgress(value: unknown): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

/**
 * 拒絕完成時回給使用者的訊息。
 *
 * 伺服器端與畫面端共用同一句話 —— 兩邊各寫一份時，
 * 繞過畫面直接送出請求的人會得到一句語意不同的錯誤，難以對照。
 */
export function completionBlockedMessage(check: CompletionCheck): string {
  const reason = blockReason(check);
  return reason
    ? `${reason}。請先完成所有歸屬的工程分項，再完成此履約事項。`
    : "無法完成此履約事項。";
}
