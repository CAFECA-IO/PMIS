"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import {
  LayoutDashboard,
  BookOpen,
  CalendarClock,
  FileText,
  Activity,
  ShieldCheck,
  FileCheck,
  ClipboardCheck,
  ClipboardList,
  FolderArchive,
  Map,
  Users,
  Leaf,
  Radar,
  NotebookPen,
  Wallet,
  Building2,
  Box,
  Wand2,
  ChevronsUpDown,
  X,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import {
  currentProject,
  switchProjectHref,
  withProject,
} from "@/lib/project-link";
import { useMediaQuery } from "@/lib/use-media-query";
import { hidesSidebar } from "@/lib/layout-rules";
import { Logo } from "@/components/logo";
import { useAiAssistant } from "@/components/ai-assistant-context";
import { useShell } from "@/components/shell-context";
import { ProjectSwitchDialog } from "@/components/project-switch-dialog";
import type { ProjectOption } from "@/service/project.service";
import { NAV_SECTIONS, type NavEntry } from "@/constant/navigation";
import pkg from "../../package.json";

type NavItem = NavEntry & { icon: LucideIcon };
type NavSectionView = { title: string; items: NavItem[] };

// Info: 分區結構來自 @/constant/navigation（單一來源），此處只補上圖示。
const ICONS: Record<string, LucideIcon> = {
  "/": LayoutDashboard,
  "/overview-3d": Box,
  "/projects": FileText,
  "/schedule": Activity,
  "/obligations": ClipboardList,
  "/calendar": CalendarClock,
  "/finance": Wallet,
  "/submittals": FileCheck,
  "/documents": FolderArchive,
  "/logs": NotebookPen,
  "/quality": ClipboardCheck,
  "/ehs": ShieldCheck,
  "/carbon": Leaf,
  "/gis": Map,
  "/monitoring": Radar,
  "/people": Users,
  "/docs": BookOpen,
};

const sections: NavSectionView[] = NAV_SECTIONS.map((s) => ({
  title: s.title,
  items: s.items.map((i) => ({ ...i, icon: ICONS[i.href] ?? Building2 })),
}));

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar({
  allowedRoutes = [],
  projects = [],
}: {
  allowedRoutes?: string[];
  projects?: ProjectOption[];
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  const { navOpen: open, setNavOpen: setOpen } = useShell();
  const { expanded: aiExpanded } = useAiAssistant();
  /*
    目前鎖定的專案。導覽連結一律帶上它，讓使用者切換模組時不必重選 ——
    網址仍是唯一權威來源，這裡只負責把它傳遞下去。
  */
  const selectedProjectId = currentProject(params.toString());
  // Info: 依職位權限過濾模組（always 者為儀表板/功能說明，一律顯示），再濾除無可見項目的分區
  const allowed = new Set(allowedRoutes);
  const visibleSections = sections
    .map((s) => ({
      ...s,
      items: s.items.filter((i) => i.always || allowed.has(i.href)),
    }))
    .filter((s) => s.items.length > 0);

  // Info: (20260721 - Luphia) 導航後自動關閉手機抽屜（以 timeout 延遲，避免在 effect 內同步 setState）
  useEffect(() => {
    const id = setTimeout(() => setOpen(false), 0);
    return () => clearTimeout(id);
  }, [pathname, setOpen]);

  /*
    空間不足時優先壓縮選單：費思分欄展開後，工作區同時被左右夾擠，
    中間可用寬度可能不足以正常操作。此時把選單收成圖示軌（約 68px），
    把約 172px 還給工作區。視窗夠寬（≥ 1600px）時三欄並存無虞，維持完整選單。
  */
  const roomy = useMediaQuery("(min-width: 1600px)");
  const rail = aiExpanded && !roomy;

  /*
    專案建置這類需要最大寬度的畫面，桌機直接收掉選單（見 lib/layout-rules）。
    手機仍保留抽屜行為，頂列的漢堡鈕可隨時叫出，不會斷了導覽入口。
  */
  const hidden = hidesSidebar(pathname);


  return (
    <>
      {/* Info: (20260721 - Luphia) 手機遮罩 */}
      {open ? (
        <div
          className={cn(
            "fixed inset-0 z-40 bg-black/40",
            // 一般畫面桌機側邊欄常駐、無需遮罩；
            // 隱藏模式下選單是浮層抽屜，桌機同樣需要遮罩才能點外面關閉
            hidden ? "" : "lg:hidden",
          )}
          onClick={() => setOpen(false)}
        />
      ) : null}

      {/* Info: (20260721 - Luphia) 側邊欄（桌機常駐、手機抽屜） */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex h-screen shrink-0 flex-col border-r bg-card transition-transform duration-200 ease-out",
          "lg:static lg:z-auto lg:translate-x-0 lg:transition-[width,transform]",
          open ? "translate-x-0" : "-translate-x-full",
          /*
            需要最大寬度的畫面：桌機不佔版面。
            開啟時維持浮層（lg:fixed 蓋掉 lg:static），否則會把工作區推開，
            造成開合時的版面跳動。關閉時整個隱藏。
          */
          hidden && "lg:fixed lg:z-50 lg:shadow-overlay",
          hidden && !open && "lg:hidden",
          // 空間不足時優先壓縮選單，把寬度讓給中間工作區。
          // 手機抽屜一律用完整寬度（rail 只在 lg 以上生效）。
          rail ? "w-60 lg:w-[4.25rem]" : "w-60",
        )}
      >
        <div
          className={cn(
            "flex items-center gap-2 border-b py-4",
            rail ? "px-5 lg:flex-col lg:justify-center lg:gap-3 lg:px-2" : "px-5",
          )}
        >
          <Logo className="h-8 w-auto shrink-0" />
          <div className={cn("leading-tight", rail && "lg:hidden")}>
            <div className="text-sm font-semibold">PMIS</div>
            <div className="text-xs text-muted-foreground">智慧監造管理系統</div>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="關閉選單"
            className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground lg:hidden"
          >
            <X className="size-4" />
          </button>
        </div>
        {/* Info: 目前專案區塊 */}
        <Suspense fallback={null}>
          <CurrentProjectBlock projects={projects} rail={rail} />
        </Suspense>
        <nav className="flex flex-1 flex-col gap-3 overflow-y-auto p-3">
          {visibleSections.map((section) => (
            <div key={section.title} className="flex flex-col gap-0.5">
              <div
                className={cn(
                  "px-3 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/60",
                  // rail 模式下以分隔線取代分區標題
                  rail && "lg:mx-auto lg:h-px lg:w-6 lg:overflow-hidden lg:bg-border lg:p-0 lg:text-transparent",
                )}
              >
                {section.title}
              </div>
              {section.items.map(({ href, label, icon: Icon }) => {
                const active = isActive(pathname, href);
                return (
                  <Link
                    key={href}
                    /*
                      帶上目前專案：導覽連結原本是裸的 href，
                      一切換模組 ?project= 就消失，使用者得重新選一次。
                    */
                    href={withProject(href, selectedProjectId)}
                    onClick={() => setOpen(false)}
                    title={rail ? label : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-md py-2 text-sm font-medium transition-colors",
                      rail ? "px-3 lg:justify-center lg:px-0" : "px-3",
                      active
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground",
                    )}
                  >
                    <Icon className="size-4 shrink-0" />
                    <span className={cn("flex-1", rail && "lg:hidden")}>
                      {label}
                    </span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="mt-auto border-t p-3">
          {/* 用戶登入資訊已移至頂列，此處僅保留版號 */}
          <div
            className={cn(
              "px-2 text-center text-[10px] tabular-nums text-muted-foreground/60",
              rail && "lg:hidden",
            )}
          >
            {pkg.name.toUpperCase()} v{pkg.version}
          </div>
        </div>
      </aside>
    </>
  );
}

/**
 * Info: 目前專案區塊。讀取各模組頁共用的 `?project=<id>` 篩選器，
 * 顯示目前鎖定的專案（未指定時顯示「全部專案」）。
 */
function CurrentProjectBlock({
  projects,
  rail = false,
}: {
  projects: ProjectOption[];
  rail?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const params = useSearchParams();
  const [switching, setSwitching] = useState(false);
  const selectedId = params.get("project");
  const current = selectedId
    ? projects.find((p) => p.id === selectedId)
    : undefined;

  // Info: 切換：寫入 ?project=<id>（全部則清除），保留其他查詢參數
  function switchProject(value: string) {
    setSwitching(false);
    // 與各頁的專案篩選器共用同一份邏輯，避免兩處漂移
    router.push(switchProjectHref(pathname, params.toString(), value));
  }

  return (
    <div className="space-y-2 border-b px-3 py-3">
      <button
        type="button"
        onClick={() => setSwitching(true)}
        title={
          rail
            ? `目前專案：${current ? current.name : "全部專案"}（點擊切換）`
            : "點擊切換專案"
        }
        className={cn(
          "group flex w-full items-center gap-2 rounded-md bg-muted/50 py-2 text-left transition-colors hover:bg-accent",
          rail ? "px-3 lg:justify-center lg:px-0" : "px-3",
        )}
      >
        <Building2 className="size-4 shrink-0 text-primary" />
        <div
          className={cn("min-w-0 flex-1 leading-tight", rail && "lg:hidden")}
        >
          <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">
            目前專案
          </div>
          <div className="truncate text-sm font-semibold">
            {current ? current.name : "全部專案"}
          </div>
          {current ? (
            <div className="truncate text-[11px] tabular-nums text-muted-foreground">
              {current.code}
            </div>
          ) : null}
        </div>
        <ChevronsUpDown
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground/60 transition-colors group-hover:text-foreground",
            rail && "lg:hidden",
          )}
        />
      </button>

      {/* 專案建置改為獨立頁面，與費思分欄並存，故此處只是入口連結 */}
      <Link
        href="/projects/new"
        title="專案建置"
        aria-label="專案建置"
        className={cn(
          "flex w-full items-center justify-center rounded-md border border-dashed border-primary/40 text-primary transition-colors hover:bg-primary/10",
          rail ? "py-2 lg:px-0" : "gap-1.5 px-2 py-1.5 text-xs font-medium",
        )}
      >
        <Wand2 className={rail ? "size-4" : "size-3.5"} />
        <span className={cn(rail && "lg:hidden")}>專案建置</span>
      </Link>

      <ProjectSwitchDialog
        open={switching}
        projects={projects}
        selectedId={selectedId}
        onSelect={switchProject}
        onClose={() => setSwitching(false)}
      />
    </div>
  );
}
