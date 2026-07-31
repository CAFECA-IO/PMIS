/**
 * 跨模組維持「目前專案」的連結組裝（純函式，無 I/O，便於單元測試）。
 *
 * 問題 ——
 * 目前專案是以 `?project=<id>` 這個查詢參數表示，各模組頁都讀它。
 * 但側邊欄的導覽連結是裸的 `href="/quality"`，一離開當前頁面參數就消失，
 * 於是使用者選定專案後只要切換模組就得重新選一次。
 *
 * 作法 ——
 * 網址仍是唯一權威來源（可分享、可重載、可回上一頁），
 * 但所有導覽連結一律帶上目前的專案參數，讓它在模組之間傳遞下去。
 * 刻意不改用 cookie 或 localStorage 保存：那會產生兩個來源，
 * 分享出去的網址寫 A、本機記著 B 時就無從判斷哪個才對。
 */

/** 查詢參數名稱。與各模組頁讀取的名稱一致。 */
export const PROJECT_PARAM = "project";

/**
 * 不該帶專案參數的路徑。
 *
 * 專案建置是「還沒有專案」的畫面，帶上既有專案只會混淆；
 * 登入頁與登出動作也不需要。
 */
const EXCLUDED = ["/projects/new", "/login", "/logout"];

/** 此路徑是否應該帶上專案參數。 */
export function carriesProject(href: string): boolean {
  const path = href.split("?")[0].split("#")[0];
  return !EXCLUDED.some((e) => path === e || path.startsWith(`${e}/`));
}

/**
 * 把目前專案接到連結上。
 *
 * 為何連不吃專案的模組（如人員權限、系統通知）也要帶 ——
 * 參數必須能「過境」。使用者從品質稽核繞到人員權限再回環安衛時，
 * 若中途那一頁不帶參數，回來就沒了。多帶一個被忽略的參數無害。
 *
 * @param href 目標連結，可含既有查詢字串
 * @param projectId 目前專案；null／空字串代表「全部專案」，不加參數
 */
export function withProject(
  href: string,
  projectId: string | null | undefined,
): string {
  const id = projectId?.trim();
  if (!id || !carriesProject(href)) return href;

  const [pathAndQuery, hash] = href.split("#");
  const [path, query = ""] = pathAndQuery.split("?");
  const sp = new URLSearchParams(query);
  // 目標連結若自己指定了專案，尊重它 —— 那是更明確的意圖
  if (!sp.get(PROJECT_PARAM)) sp.set(PROJECT_PARAM, id);

  const qs = sp.toString();
  return `${path}${qs ? `?${qs}` : ""}${hash ? `#${hash}` : ""}`;
}

/**
 * 切換專案後的網址：保留目前路徑與其他查詢參數。
 *
 * 抽出來共用是因為側邊欄與各頁的專案篩選器原本各寫一份相同邏輯，
 * 兩處若漂移就會出現「用某個入口切換會掉 tab 參數」這類難查的差異。
 *
 * @param value 專案 id；"all" 或空值代表全部專案
 */
export function switchProjectHref(
  pathname: string,
  currentQuery: string,
  value: string | null | undefined,
): string {
  const sp = new URLSearchParams(currentQuery);
  const id = value?.trim();
  const all = !id || id === "all";
  if (all) sp.delete(PROJECT_PARAM);
  else sp.set(PROJECT_PARAM, id);

  /*
    專案頁的路徑本身就綁著一個專案 id。
    在這種頁面上切換專案時只改查詢參數是不夠的 —— 路徑還指著舊的那件，
    畫面也還是舊的那件。必須連路徑一起換，否則使用者會覺得切換沒有作用。
    切到「全部專案」則回到清單（單一專案的頁面沒有「全部」可言）。
  */
  const detail = pathname.match(/^\/projects\/(?!new$)([^/]+)(\/.*)?$/);
  if (detail) {
    if (all) return "/projects";
    const target = `/projects/${id}${detail[2] ?? ""}`;
    const qs = sp.toString();
    return qs ? `${target}?${qs}` : target;
  }

  const qs = sp.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

/** 從查詢字串取出目前專案；未指定回 null。 */
export function currentProject(query: string | null | undefined): string | null {
  if (!query) return null;
  const id = new URLSearchParams(query).get(PROJECT_PARAM)?.trim();
  return id ? id : null;
}
