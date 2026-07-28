// 導覽分區的單一定義來源。側邊欄與各頁頁首的區塊標籤都讀這份，
// 避免兩處各自寫死而漂移。圖示不放在這裡（由側邊欄依 href 對應），
// 讓此檔可被伺服器元件與單元測試無痛引用。

export type NavEntry = {
  href: string;
  label: string;
  /** 不受職位權限過濾（專案戰情室／功能說明）。 */
  always?: boolean;
};

export type NavSection = { title: string; items: NavEntry[] };

export const NAV_SECTIONS: NavSection[] = [
  {
    title: "01 總覽與決策",
    items: [{ href: "/", label: "專案戰情室", always: true }],
  },
  {
    title: "02 契約與時程管理",
    items: [
      { href: "/projects", label: "工程專案" },
      { href: "/schedule", label: "時程進度" },
      { href: "/obligations", label: "履約事項" },
      { href: "/calendar", label: "行事曆與預警" },
      { href: "/finance", label: "財務管理" },
    ],
  },
  {
    title: "03 文件與協作",
    items: [
      { href: "/submittals", label: "簽核管理" },
      { href: "/documents", label: "檔案管理" },
      { href: "/logs", label: "工程日誌" },
    ],
  },
  {
    title: "04 工程執行與查核",
    items: [
      { href: "/quality", label: "品質稽核" },
      { href: "/ehs", label: "環安衛管理" },
      { href: "/carbon", label: "碳盤查" },
    ],
  },
  {
    title: "05 空間與現場資訊",
    items: [
      { href: "/gis", label: "GIS 地圖" },
      { href: "/monitoring", label: "智能監測" },
    ],
  },
  {
    title: "06 專案與系統設定",
    items: [
      { href: "/people", label: "組織管理" },
      { href: "/docs", label: "功能說明", always: true },
    ],
  },
];

/**
 * 未出現在側邊欄、但仍需要分區標籤的路由。
 * 系統通知由頁首鈴鐺進入，刻意不佔用側邊欄項目。
 */
const OFF_NAV_SECTIONS: Record<string, string> = {
  "/notifications": "01 總覽與決策",
};

/** 路由 → 所屬分區標題，供頁首的區塊標籤使用。 */
export const SECTION_BY_ROUTE: Record<string, string> = {
  ...Object.fromEntries(
    NAV_SECTIONS.flatMap((s) => s.items.map((i) => [i.href, s.title])),
  ),
  ...OFF_NAV_SECTIONS,
};

/**
 * 取得路由的分區標題。子路由（如 /projects/xxx）沿用其父模組的分區。
 */
export function sectionOf(route: string): string | undefined {
  if (SECTION_BY_ROUTE[route]) return SECTION_BY_ROUTE[route];
  const parent = Object.keys(SECTION_BY_ROUTE)
    .filter((h) => h !== "/" && route.startsWith(`${h}/`))
    .sort((a, b) => b.length - a.length)[0];
  return parent ? SECTION_BY_ROUTE[parent] : undefined;
}
