import { PROJECT_PARAM } from "./project-link";

/**
 * 「工程專案」這一頁要顯示什麼。
 *
 * 規則本身兩行就寫完，但它是一組互相牽制的轉向：
 *  - /projects 有選定專案 → 轉到那個專案
 *  - 專案頁沒有選定專案 → 補上參數（否則側邊欄顯示「全部專案」，
 *    而畫面上明明開著某個專案，兩者互相矛盾）
 *  - 專案頁的「全部專案」→ 回到清單且清掉選定
 *
 * 三條規則各自都對，湊在一起卻可能繞不出來：補參數的那條若把
 * 使用者送回清單、清單的那條又把他送回專案頁，就是一個無盡迴圈，
 * 而症狀是瀏覽器直接報錯，看不出是哪一條的問題。故以純函式表示並測出
 * 「任何入口都會在有限步數內停下」。
 */

export type RouteDecision =
  | { kind: "list" }
  | { kind: "stay" }
  | { kind: "redirect"; href: string };

/**
 * /projects 該顯示清單還是轉到某個專案。
 *
 * @param selected 網址上的 ?project=（左上角目前專案）
 * @param visible 使用者看得到的專案 id；選定的專案不在其中時退回清單
 */
export function decideProjectsPage(
  selected: string | null | undefined,
  visible: Iterable<string>,
): RouteDecision {
  const id = selected?.trim();
  if (!id) return { kind: "list" };
  /*
    選定的專案可能已被刪除、或使用者的權限已被移除。
    此時退回清單而非轉過去 —— 轉過去會得到 404 或權限錯誤，
    而使用者只是點了左上角，他不會知道那個 id 還留在網址上。
  */
  const set = visible instanceof Set ? visible : new Set(visible);
  if (!set.has(id)) return { kind: "list" };
  return { kind: "redirect", href: projectHref(id) };
}

/** 專案頁的網址：一律帶上 ?project=，讓側邊欄與畫面一致。 */
export function projectHref(id: string, tab?: string | null): string {
  const sp = new URLSearchParams();
  if (tab) sp.set("tab", tab);
  sp.set(PROJECT_PARAM, id);
  return `/projects/${id}?${sp.toString()}`;
}

/**
 * 專案頁在參數與畫面不一致時該怎麼辦。
 *
 * 兩種不一致，處理方向相反：
 *  - 沒有參數（自通知、費思的連結或書籤進來）→ 採用畫面上開著的專案，
 *    補上參數。否則側邊欄說「全部專案」而畫面開著某一件。
 *  - 參數指向別的專案 → 以參數為準，轉到那一件。那是使用者剛在左上角
 *    切換的結果，是比網址路徑更新的意圖。
 *
 * 這第二條是我第一版寫錯的地方：原本一律改寫參數去符合路徑，
 * 於是在專案頁切換專案會被立刻彈回原本那件 —— 使用者按了沒反應。
 */
export function decideProjectPage(
  openId: string,
  selected: string | null | undefined,
  /**
   * 目前的頁籤。
   *
   * 補參數時要一併帶回去 —— 有人分享的是「履約事項」那一頁的連結，
   * 補個參數就把他丟回總覽，等於這個連結壞了。
   * 切換到別的專案時則不帶：那件專案的同名頁籤未必是他要看的東西，
   * 且路徑已經換了，回到總覽是可預期的起點。
   */
  tab?: string | null,
): { kind: "stay" } | { kind: "redirect"; href: string } {
  const id = selected?.trim();
  if (id === openId) return { kind: "stay" };
  if (!id) return { kind: "redirect", href: projectHref(openId, tab) };
  return { kind: "redirect", href: projectHref(id) };
}

/**
 * 「全部專案」的去處：清單，且不帶專案參數。
 *
 * 專案頁不再自備返回鍵 —— 離開單一專案的唯一入口是左上角切「全部專案」，
 * 與進入的方式對稱（進出都在同一個地方，不必記得畫面上還有第二顆按鈕）。
 * 這個常數仍留著作為那條規則的單一出處：任何指向清單的連結都不得帶
 * ?project=，否則 decideProjectsPage 會立刻把使用者轉回專案頁。
 */
export const ALL_PROJECTS_HREF = "/projects";
