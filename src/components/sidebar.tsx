import Link from "next/link";
import {
  HardHat,
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
  type LucideIcon,
} from "lucide-react";

import pkg from "../../package.json";

type NavItem = { href: string; label: string; code?: string; icon: LucideIcon };

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
  { href: "/documents", label: "資料庫", code: "PMIS-08", icon: FolderArchive },
  { href: "/people", label: "人員管理", code: "PMIS-09", icon: Users },
];

export function Sidebar() {
  return (
    <aside className="flex h-screen w-60 shrink-0 flex-col border-r bg-card">
      <div className="flex items-center gap-2 border-b px-5 py-4">
        <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <HardHat className="size-5" />
        </div>
        <div className="leading-tight">
          <div className="text-sm font-semibold">PMIS</div>
          <div className="text-xs text-muted-foreground">智慧監造管理系統</div>
        </div>
      </div>
      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-3">
        {nav.map(({ href, label, code, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <Icon className="size-4 shrink-0" />
            <span className="flex-1">{label}</span>
            {code ? (
              <span className="text-[10px] tabular-nums text-muted-foreground/60">
                {code}
              </span>
            ) : null}
          </Link>
        ))}
      </nav>
      <div className="mt-auto p-4 text-xs text-muted-foreground">
        {pkg.name} v{pkg.version}
      </div>
    </aside>
  );
}
