"use client";

import { useState } from "react";
import { GanttChartSquare, Table2 } from "lucide-react";

import { cn } from "@/lib/utils";
import type { ObligationRow } from "@/service/obligation-view";
import type { CompletionCheck } from "@/service/obligation-completion";
import type { GanttInput } from "@/service/obligation-gantt";
import { ObligationTable } from "./obligation-table";
import { ObligationGanttChart } from "./obligation-gantt-chart";

/**
 * 清單與甘特圖的切換。
 *
 * 為何是切換而非上下並列 ——
 * 兩者是同一批資料的兩種讀法：清單回答「這一項的細節與責任是什麼」，
 * 甘特圖回答「這些事項的先後與鬆緊如何」。同時顯示會讓兩者都只剩半個
 * 畫面高度，而使用者一次只在問其中一個問題。
 *
 * 篩選條件在上方，兩種檢視共用 —— 換檢視不必重設條件。
 */
export function ObligationViews({
  rows,
  total,
  canEdit,
  showProject,
  gates,
  projectId,
  gantt,
  today,
}: {
  rows: ObligationRow[];
  total: number;
  canEdit: boolean;
  showProject: boolean;
  gates: Record<string, CompletionCheck>;
  projectId: string | null;
  gantt: GanttInput[];
  today: string;
}) {
  const [view, setView] = useState<"table" | "gantt">("table");

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5">
        <Tab
          active={view === "table"}
          onClick={() => setView("table")}
          icon={<Table2 className="size-3.5" />}
          label="清單"
        />
        <Tab
          active={view === "gantt"}
          onClick={() => setView("gantt")}
          icon={<GanttChartSquare className="size-3.5" />}
          label="甘特圖"
        />
        <span className="ml-1 text-[11px] text-muted-foreground">
          {view === "table"
            ? "逐項檢視責任分工與期限"
            : "工作區間由歸屬工程分項推得，菱形為契約期限"}
        </span>
      </div>

      {view === "table" ? (
        <ObligationTable
          rows={rows}
          total={total}
          canEdit={canEdit}
          showProject={showProject}
          gates={gates}
          projectId={projectId}
        />
      ) : (
        <ObligationGanttChart items={gantt} today={today} projectId={projectId} />
      )}
    </div>
  );
}

function Tab({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "text-muted-foreground hover:border-primary hover:text-primary",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
