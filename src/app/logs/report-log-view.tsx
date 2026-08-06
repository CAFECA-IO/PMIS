"use client";

/**
 * Info: (20260806 - Julian)
 * 日報（監造報表）月曆／清單雙檢視。
 * 資料一天一筆（schema @@unique[projectId, reportDate]），天生適合月曆呈現。
 * 月份與檢視模式皆走 URL（?month=YYYY-MM、?view=calendar|list），由伺服器每月查詢；
 * 切月／切檢視互不重置。新建與編輯沿用既有 CreateRecordDialog 與 ReportEditForm，不動共用元件。
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, List, ChevronLeft, ChevronRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CreateRecordDialog } from "@/components/ui/create-record-dialog";
import { reportStatusMeta } from "@/constant/pmis";
import { formatDate } from "@/lib/utils";
import { ReportDialogFields } from "./report-dialog-fields";
import { ReportEditForm } from "./report-edit-form";
import { fileReportAction } from "./actions";

export type DayReport = {
  id: string;
  dateISO: string; // YYYY-MM-DD（本地日期）
  weather: string;
  status: keyof typeof reportStatusMeta;
  summary: string;
  manpower: string;
  equipment: string;
  keyNotes: string;
  filedBy: string | null;
};

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function ReportLogView({
  projectId,
  canEdit,
  year,
  month, // 1-12
  reports,
  view,
}: {
  projectId: string;
  canEdit: boolean;
  year: number;
  month: number;
  reports: DayReport[];
  view: "calendar" | "list";
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(null);

  const byDate = new Map<string, DayReport>();
  for (const r of reports) byDate.set(r.dateISO, r);

  const monthKey = `${year}-${pad(month)}`;
  const go = (params: { month?: string; view?: "calendar" | "list" }) => {
    const sp = new URLSearchParams();
    sp.set("project", projectId);
    sp.set("month", params.month ?? monthKey);
    sp.set("view", params.view ?? view);
    router.push(`/logs?${sp.toString()}`);
  };

  const shiftMonth = (delta: number) => {
    const base = new Date(year, month - 1 + delta, 1);
    go({ month: `${base.getFullYear()}-${pad(base.getMonth() + 1)}` });
  };

  const monthLabel = `${year} 年 ${month} 月`;
  const today = todayISO();

  return (
    <div className="space-y-4">
      {/* 導覽列：月份切換 + 檢視切換 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label="上個月"
            onClick={() => shiftMonth(-1)}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="min-w-28 text-center text-sm font-medium tabular-nums">
            {monthLabel}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label="下個月"
            onClick={() => shiftMonth(1)}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant={view === "calendar" ? "default" : "outline"}
            size="sm"
            aria-pressed={view === "calendar"}
            onClick={() => go({ view: "calendar" })}
          >
            <CalendarDays className="size-4" />
            月曆
          </Button>
          <Button
            type="button"
            variant={view === "list" ? "default" : "outline"}
            size="sm"
            aria-pressed={view === "list"}
            onClick={() => go({ view: "list" })}
          >
            <List className="size-4" />
            清單
          </Button>
        </div>
      </div>

      {view === "calendar" ? (
        <CalendarGrid
          year={year}
          month={month}
          byDate={byDate}
          today={today}
          selected={selected}
          onSelect={setSelected}
        />
      ) : (
        <ReportList
          reports={reports}
          projectId={projectId}
          canEdit={canEdit}
        />
      )}

      {/* 月曆模式：選取日的明細（檢視／編輯／新建） */}
      {view === "calendar" && selected && (
        <DayDetail
          dateISO={selected}
          report={byDate.get(selected) ?? null}
          projectId={projectId}
          canEdit={canEdit}
        />
      )}
    </div>
  );
}

function CalendarGrid({
  year,
  month,
  byDate,
  today,
  selected,
  onSelect,
}: {
  year: number;
  month: number;
  byDate: Map<string, DayReport>;
  today: string;
  selected: string | null;
  onSelect: (iso: string) => void;
}) {
  const firstDow = new Date(year, month - 1, 1).getDay(); // 0=日
  const daysInMonth = new Date(year, month, 0).getDate();

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDow; i += 1) cells.push(null);
  for (let d = 1; d <= daysInMonth; d += 1) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="grid grid-cols-7 border-b bg-muted/40 text-center text-xs text-muted-foreground">
        {WEEKDAYS.map((w) => (
          <div key={w} className="py-1.5">
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((day, i) => {
          if (day === null) {
            return (
              <div
                key={`blank-${i}`}
                className="min-h-20 border-b border-r bg-muted/10 last:border-r-0"
              />
            );
          }
          const iso = `${year}-${pad(month)}-${pad(day)}`;
          const r = byDate.get(iso);
          const isToday = iso === today;
          const isSelected = iso === selected;
          return (
            <button
              key={iso}
              type="button"
              onClick={() => onSelect(iso)}
              className={[
                "min-h-20 border-b border-r p-1.5 text-left align-top transition-colors last:border-r-0",
                "hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isSelected ? "bg-primary/10 ring-1 ring-primary" : "",
              ].join(" ")}
            >
              <div className="flex items-center justify-between">
                <span
                  className={[
                    "inline-flex size-5 items-center justify-center rounded-full text-xs tabular-nums",
                    isToday
                      ? "bg-primary font-semibold text-primary-foreground"
                      : "text-foreground",
                  ].join(" ")}
                >
                  {day}
                </span>
                {r ? (
                  <span
                    className="size-1.5 rounded-full bg-primary"
                    aria-hidden
                  />
                ) : null}
              </div>
              {r ? (
                <div className="mt-1 space-y-0.5">
                  {r.weather ? (
                    <div className="truncate text-[11px] text-muted-foreground">
                      {r.weather}
                    </div>
                  ) : null}
                  <Badge
                    variant={reportStatusMeta[r.status].variant}
                    className="px-1 py-0 text-[10px]"
                  >
                    {reportStatusMeta[r.status].label}
                  </Badge>
                </div>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DayDetail({
  dateISO,
  report,
  projectId,
  canEdit,
}: {
  dateISO: string;
  report: DayReport | null;
  projectId: string;
  canEdit: boolean;
}) {
  const label = formatDate(new Date(dateISO));

  if (!report) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed p-3">
        <span className="text-sm text-muted-foreground">
          {label}　尚無日報
        </span>
        {canEdit ? (
          <CreateRecordDialog
            title="填報日報"
            triggerLabel={`填報 ${dateISO.slice(5)} 日報`}
            triggerSize="sm"
            action={fileReportAction}
            submitLabel="送出"
          >
            <ReportDialogFields projectId={projectId} today={dateISO} />
          </CreateRecordDialog>
        ) : null}
      </div>
    );
  }

  return (
    <div className="rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium tabular-nums">{label}</span>
          {report.weather ? (
            <span className="text-muted-foreground">{report.weather}</span>
          ) : null}
          <Badge variant={reportStatusMeta[report.status].variant}>
            {reportStatusMeta[report.status].label}
          </Badge>
        </div>
        <span className="text-xs text-muted-foreground">
          {report.filedBy ?? "—"}
        </span>
      </div>
      {report.summary ? (
        <p className="mt-1 text-sm text-muted-foreground">{report.summary}</p>
      ) : null}
      {canEdit ? (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-primary hover:underline">
            編輯 / 刪除
          </summary>
          <ReportEditForm
            id={report.id}
            projectId={projectId}
            dateISO={report.dateISO}
            dateLabel={label}
            initial={{
              weather: report.weather,
              status: report.status,
              summary: report.summary,
              manpower: report.manpower,
              equipment: report.equipment,
              keyNotes: report.keyNotes,
            }}
          />
        </details>
      ) : null}
    </div>
  );
}

function ReportList({
  reports,
  projectId,
  canEdit,
}: {
  reports: DayReport[];
  projectId: string;
  canEdit: boolean;
}) {
  if (reports.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {canEdit ? "本月尚無日報，可切至月曆點選日期填報。" : "本月尚無日報。"}
      </p>
    );
  }
  return (
    <div className="space-y-2">
      {reports.map((r) => (
        <div key={r.id} className="rounded-lg border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm">
              <span className="font-medium tabular-nums">
                {formatDate(new Date(r.dateISO))}
              </span>
              {r.weather ? (
                <span className="text-muted-foreground">{r.weather}</span>
              ) : null}
              <Badge variant={reportStatusMeta[r.status].variant}>
                {reportStatusMeta[r.status].label}
              </Badge>
            </div>
            <span className="text-xs text-muted-foreground">
              {r.filedBy ?? "—"}
            </span>
          </div>
          {r.summary ? (
            <p className="mt-1 text-sm text-muted-foreground">{r.summary}</p>
          ) : null}
          {canEdit ? (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-primary hover:underline">
                編輯 / 刪除
              </summary>
              <ReportEditForm
                id={r.id}
                projectId={projectId}
                dateISO={r.dateISO}
                dateLabel={formatDate(new Date(r.dateISO))}
                initial={{
                  weather: r.weather,
                  status: r.status,
                  summary: r.summary,
                  manpower: r.manpower,
                  equipment: r.equipment,
                  keyNotes: r.keyNotes,
                }}
              />
            </details>
          ) : null}
        </div>
      ))}
    </div>
  );
}
