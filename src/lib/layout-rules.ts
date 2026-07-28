/**
 * 版面規則（純函式，無 I/O，便於單元測試）。
 *
 * 集中判斷「哪些畫面需要讓出最大寬度」。分散在各元件各自比對路徑，
 * 側邊欄與頂列很容易對不上（一邊藏了選單、另一邊沒把入口補回來）。
 */

/**
 * 需要隱藏側邊欄的路由。
 *
 * 專案建置同時要放「解析進度欄 + 表單」，右側還可能被費思分掉一欄；
 * 三欄並存時中間的履約事項與工程分項表格會被壓到不可用，
 * 因此這類畫面在桌機一律收掉選單，改由頂列的漢堡鈕以抽屜開啟。
 */
const FULL_WIDTH_ROUTES = ["/projects/new"];

export function hidesSidebar(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return FULL_WIDTH_ROUTES.some(
    (r) => pathname === r || pathname.startsWith(`${r}/`),
  );
}
