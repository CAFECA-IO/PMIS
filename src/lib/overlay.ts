/**
 * 頂列下拉面板（系統通知、用戶帳號）的共用定位。
 *
 * 為什麼需要這一份共用定義：
 *  1. 外殼是 `mx-auto max-w-[1680px]` 的置中框（見 app/layout.tsx）。
 *     若用 `right-4`，面板會貼齊「視窗」右緣 —— 在寬於 1680px 的螢幕上，
 *     面板會浮到外殼之外的空白邊緣，與觸發它的按鈕明顯脫節。
 *     此處改為貼齊「外殼」右緣：視窗較窄時退回固定邊距。
 *  2. 兩個面板先前各自寫一份 class 字串，任一處微調就會失去對齊。
 *     集中成一個常數，兩者必然一致。
 *
 * 注意：1680px 必須與 app/layout.tsx 的 max-w-[1680px] 相同；
 * 若調整外殼寬度，兩處要一起改。
 */

/** 外殼最大寬度（與 layout.tsx 的 max-w-[1680px] 對應）。 */
export const SHELL_MAX_WIDTH_PX = 1680;

/**
 * 貼齊外殼右緣的定位。top-14 對應頂列高度 h-14，面板自頂列下緣展開。
 * z-index 需高於遮罩（z-140）。
 */
export const HEADER_PANEL_POSITION = [
  "fixed top-14 z-[141]",
  // 窄螢幕：距視窗右緣 0.5rem
  "right-[max(0.5rem,calc((100vw-1680px)/2+0.5rem))]",
  // sm 以上：距外殼右緣 1rem
  "sm:right-[max(1rem,calc((100vw-1680px)/2+1rem))]",
].join(" ");

/** 點擊面板外側關閉用的透明遮罩。 */
export const HEADER_PANEL_OVERLAY = "fixed inset-0 z-[140]";
