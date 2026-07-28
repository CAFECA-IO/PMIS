/**
 * 輸入法（IME）友善的送出判斷。
 *
 * 中文／日文／韓文等輸入法在「選字」階段會以 Enter 確認候選字，
 * 該次 Enter 不應被當成「送出訊息」，否則會誤送並吃掉使用者正在選的字。
 *
 * 三重判斷以涵蓋各瀏覽器差異：
 *  - `composing`：由 compositionstart / compositionend 維護的旗標（最可靠）
 *  - `isComposing`：KeyboardEvent 標準屬性，部分瀏覽器於 keydown 已正確回報
 *  - `keyCode === 229`：Safari 與舊版 Chrome 在選字中回報的特殊值
 */
export type EnterKeyLike = {
  key: string;
  shiftKey: boolean;
  isComposing?: boolean;
  keyCode?: number;
};

export function shouldSendOnEnter(
  event: EnterKeyLike,
  composing: boolean,
): boolean {
  // Shift+Enter 為換行，其餘按鍵不處理
  if (event.key !== "Enter" || event.shiftKey) return false;
  if (composing) return false;
  if (event.isComposing) return false;
  if (event.keyCode === 229) return false;
  return true;
}
