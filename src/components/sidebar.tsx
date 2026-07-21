"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  BookOpen,
  CalendarClock,
  ListTodo,
  FileText,
  Activity,
  ShieldCheck,
  FileCheck,
  ClipboardCheck,
  FolderArchive,
  Users,
  Leaf,
  Radar,
  NotebookPen,
  Wallet,
  Menu,
  X,
  LogOut,
  type LucideIcon,
} from "lucide-react";

import type { AccountRole } from "@/generated/prisma/enums";
import { accountRoleMeta } from "@/constant/people";
import { logoutAction } from "@/app/login/actions";
import { cn } from "@/lib/utils";
import pkg from "../../package.json";

type NavItem = { href: string; label: string; code?: string; icon: LucideIcon };

type SidebarUser = { name: string; email: string; role: AccountRole };

const nav: NavItem[] = [
  { href: "/", label: "儀表板", icon: LayoutDashboard },
  { href: "/docs", label: "功能說明", icon: BookOpen },
  { href: "/calendar", label: "行事曆預警", code: "PMIS-01", icon: CalendarClock },
  { href: "/todos", label: "待辦追蹤", code: "PMIS-02", icon: ListTodo },
  { href: "/projects", label: "工程專案", code: "PMIS-03", icon: FileText },
  { href: "/schedule", label: "時程進度", code: "PMIS-04", icon: Activity },
  { href: "/ehs", label: "環安衛管理", code: "PMIS-05", icon: ShieldCheck },
  { href: "/submittals", label: "簽核管理", code: "PMIS-06", icon: FileCheck },
  { href: "/quality", label: "品質稽核", code: "PMIS-07", icon: ClipboardCheck },
  { href: "/finance", label: "財務管理", code: "PMIS-08", icon: Wallet },
  { href: "/carbon", label: "碳盤查", code: "PMIS-09", icon: Leaf },
  { href: "/monitoring", label: "智能監測", code: "PMIS-10", icon: Radar },
  { href: "/logs", label: "工程日誌", code: "PMIS-11", icon: NotebookPen },
  { href: "/documents", label: "資料庫", code: "PMIS-12", icon: FolderArchive },
  { href: "/people", label: "人員管理", code: "PMIS-13", icon: Users },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar({ user }: { user: SidebarUser }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // 導航後自動關閉手機抽屜（以 timeout 延遲，避免在 effect 內同步 setState）
  useEffect(() => {
    const id = setTimeout(() => setOpen(false), 0);
    return () => clearTimeout(id);
  }, [pathname]);

  return (
    <>
      {/* 手機頂列 */}
      <div className="fixed inset-x-0 top-0 z-30 flex h-14 items-center gap-3 border-b bg-card px-4 lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="開啟選單"
          className="flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Menu className="size-5" />
        </button>
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.svg"
            alt="PMIS"
            className="h-7 w-auto"
          />
          <span className="text-sm font-semibold">PMIS</span>
        </div>
      </div>

      {/* 手機遮罩 */}
      {open ? (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={() => setOpen(false)}
        />
      ) : null}

      {/* 側邊欄（桌機常駐、手機抽屜） */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex h-screen w-60 shrink-0 flex-col border-r bg-card transition-transform duration-200 ease-out",
          "lg:static lg:z-auto lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center gap-2 border-b px-5 py-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.svg"
            alt="PMIS"
            className="h-8 w-auto shrink-0"
          />
          <div className="leading-tight">
            <div className="text-sm font-semibold">PMIS</div>
            <div className="text-xs text-muted-foreground">智慧監造管理系統</div>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="關閉選單"
            className="ml-auto flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground lg:hidden"
          >
            <X className="size-4" />
          </button>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-3">
          {nav.map(({ href, label, code, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <Icon className="size-4 shrink-0" />
                <span className="flex-1">{label}</span>
                {code ? (
                  <span className="text-[10px] tabular-nums text-muted-foreground/60">
                    {code}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto border-t p-3">
          <div className="flex items-center gap-2 rounded-md px-2 py-1.5">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
              {user.name.slice(0, 1)}
            </div>
            <div className="min-w-0 leading-tight">
              <div className="truncate text-sm font-medium">{user.name}</div>
              <div className="truncate text-[11px] text-muted-foreground">
                {accountRoleMeta[user.role].label}
              </div>
            </div>
            <form action={logoutAction} className="ml-auto">
              <button
                type="submit"
                title="登出"
                className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                <LogOut className="size-4" />
              </button>
            </form>
          </div>
          <div className="px-2 pt-1 text-center text-[10px] tabular-nums text-muted-foreground/60">
            {pkg.name.toUpperCase()} v{pkg.version}
          </div>
        </div>
      </aside>
    </>
  );
}
