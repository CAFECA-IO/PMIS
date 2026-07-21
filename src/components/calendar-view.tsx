"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { reminderCategoryMeta } from "@/constant/pmis";
import type { ReminderCategory } from "@/generated/prisma/enums";
import {
  CALENDAR_MODES as MODES,
  CATEGORY_COLOR,
  WEEKDAYS,
  type CalendarMode as Mode,
  type CalendarEvent,
} from "@/constant/calendar";

export type { CalendarEvent };

// ── date helpers (calendar-date semantics, local) ──────────────
function parseDate(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}
function dateOnly(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function addDays(d: Date, n: number) {
  const x = dateOnly(d);
  x.setDate(x.getDate() + n);
  return x;
}
function addMonths(d: Date, n: number) {
  const x = dateOnly(d);
  x.setMonth(x.getMonth() + n);
  return x;
}
function startOfWeek(d: Date) {
  return addDays(d, -dateOnly(d).getDay());
}
function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
function md(d: Date) {
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

type ParsedEvent = CalendarEvent & { date: Date };

export function CalendarView({
  events,
  todayISO,
}: {
  events: CalendarEvent[];
  todayISO: string;
}) {
  const today = parseDate(todayISO);
  const [mode, setMode] = useState<Mode>("month");
  const [anchor, setAnchor] = useState<Date>(today);

  const parsed = useMemo<ParsedEvent[]>(
    () =>
      events
        .map((e) => ({ ...e, date: parseDate(e.dueDate) }))
        .sort((a, b) => a.date.getTime() - b.date.getTime()),
    [events],
  );

  const step = (dir: 1 | -1) => {
    if (mode === "week") setAnchor((a) => addDays(a, dir * 7));
    else if (mode === "month") setAnchor((a) => addMonths(a, dir));
    else if (mode === "quarter") setAnchor((a) => addMonths(a, dir * 3));
    else setAnchor((a) => addMonths(a, dir * 12));
  };

  const eventsOnDay = (day: Date) => parsed.filter((e) => sameDay(e.date, day));
  const eventsInMonth = (y: number, m: number) =>
    parsed.filter((e) => e.date.getFullYear() === y && e.date.getMonth() === m);
  const eventsInRange = (start: Date, end: Date) =>
    parsed.filter((e) => e.date >= start && e.date < end);

  // period label + count
  const y = anchor.getFullYear();
  let label = "";
  let periodCount = 0;
  if (mode === "week") {
    const ws = startOfWeek(anchor);
    label = `${ws.getFullYear()}/${md(ws)} – ${md(addDays(ws, 6))}`;
    periodCount = eventsInRange(ws, addDays(ws, 7)).length;
  } else if (mode === "month") {
    label = `${y} 年 ${anchor.getMonth() + 1} 月`;
    periodCount = eventsInMonth(y, anchor.getMonth()).length;
  } else if (mode === "quarter") {
    const q = Math.floor(anchor.getMonth() / 3);
    label = `${y} 年 第 ${q + 1} 季`;
    periodCount = eventsInRange(
      new Date(y, q * 3, 1),
      new Date(y, q * 3 + 3, 1),
    ).length;
  } else {
    label = `${y} 年`;
    periodCount = eventsInRange(
      new Date(y, 0, 1),
      new Date(y + 1, 0, 1),
    ).length;
  }

  return (
    <div className="space-y-4">
      {/* Info: (20260721 - Luphia) 工具列：窄螢幕拆兩列避免破版 */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={() => step(-1)}
            className="flex size-8 shrink-0 items-center justify-center rounded-md border hover:bg-accent"
            aria-label="上一期"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => setAnchor(today)}
            className="h-8 shrink-0 rounded-md border px-3 text-sm font-medium hover:bg-accent"
          >
            今天
          </button>
          <button
            type="button"
            onClick={() => step(1)}
            className="flex size-8 shrink-0 items-center justify-center rounded-md border hover:bg-accent"
            aria-label="下一期"
          >
            <ChevronRight className="size-4" />
          </button>
          <div className="ml-1 truncate text-base font-semibold sm:ml-2">
            {label}
          </div>
          <span className="hidden shrink-0 whitespace-nowrap text-xs text-muted-foreground sm:inline">
            本期 {periodCount} 件
          </span>
        </div>

        <div className="flex items-center justify-between gap-2 sm:justify-end">
          <span className="whitespace-nowrap text-xs text-muted-foreground sm:hidden">
            本期 {periodCount} 件
          </span>
          <div className="inline-flex shrink-0 rounded-md border p-0.5">
            {MODES.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => setMode(m.key)}
                className={cn(
                  "h-7 w-9 rounded text-sm font-medium transition-colors",
                  mode === m.key
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {(Object.keys(CATEGORY_COLOR) as ReminderCategory[]).map((c) => (
          <span key={c} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className={cn("size-2.5 rounded-full", CATEGORY_COLOR[c])} />
            {reminderCategoryMeta[c].label}
          </span>
        ))}
      </div>

      {/* body */}
      {mode === "week" && (
        <WeekView
          anchor={anchor}
          today={today}
          eventsOnDay={eventsOnDay}
        />
      )}
      {mode === "month" && (
        <MonthView
          anchor={anchor}
          today={today}
          eventsOnDay={eventsOnDay}
          monthEvents={eventsInMonth(y, anchor.getMonth())}
        />
      )}
      {mode === "quarter" && (
        <QuarterView anchor={anchor} eventsInMonth={eventsInMonth} />
      )}
      {mode === "year" && (
        <YearView anchor={anchor} eventsInMonth={eventsInMonth} />
      )}
    </div>
  );
}

function EventChip({ ev }: { ev: ParsedEvent }) {
  return (
    <div
      className={cn(
        "truncate rounded px-1.5 py-0.5 text-[11px] leading-tight text-white",
        CATEGORY_COLOR[ev.category],
      )}
      title={`${md(ev.date)} ${ev.title}（${ev.projectName}）`}
    >
      {ev.title}
    </div>
  );
}

function AgendaRow({ ev }: { ev: ParsedEvent }) {
  return (
    <div className="flex items-center gap-2 py-1 text-sm">
      <span className="w-12 shrink-0 tabular-nums text-muted-foreground">
        {md(ev.date)}
      </span>
      <span className={cn("size-2 shrink-0 rounded-full", CATEGORY_COLOR[ev.category])} />
      <span className="truncate">{ev.title}</span>
      <span className="ml-auto shrink-0 truncate text-xs text-muted-foreground">
        {ev.projectName}
      </span>
    </div>
  );
}

function WeekView({
  anchor,
  today,
  eventsOnDay,
}: {
  anchor: Date;
  today: Date;
  eventsOnDay: (d: Date) => ParsedEvent[];
}) {
  const ws = startOfWeek(anchor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-7">
      {days.map((day) => {
        const list = eventsOnDay(day);
        const isToday = sameDay(day, today);
        return (
          <div
            key={day.toISOString()}
            className={cn(
              "min-h-40 rounded-lg border p-2",
              isToday && "border-primary bg-primary/5",
            )}
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {WEEKDAYS[day.getDay()]}
              </span>
              <span
                className={cn(
                  "text-sm font-semibold tabular-nums",
                  isToday && "text-primary",
                )}
              >
                {md(day)}
              </span>
            </div>
            <div className="space-y-1">
              {list.map((ev) => (
                <EventChip key={ev.id} ev={ev} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MonthView({
  anchor,
  today,
  eventsOnDay,
  monthEvents,
}: {
  anchor: Date;
  today: Date;
  eventsOnDay: (d: Date) => ParsedEvent[];
  monthEvents: ParsedEvent[];
}) {
  const y = anchor.getFullYear();
  const m = anchor.getMonth();
  const gridStart = startOfWeek(new Date(y, m, 1));
  const monthEnd = new Date(y, m + 1, 0);
  const gridEnd = addDays(startOfWeek(monthEnd), 6);
  const totalDays =
    Math.round((gridEnd.getTime() - gridStart.getTime()) / 86_400_000) + 1;
  const cells = Array.from({ length: totalDays }, (_, i) =>
    addDays(gridStart, i),
  );

  return (
    <>
      {/* Info: (20260721 - Luphia) 手機以議程列表呈現，避免月曆格過小難讀 */}
      <div className="divide-y rounded-lg border sm:hidden">
        {monthEvents.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">本月無事件</p>
        ) : (
          monthEvents.map((ev) => (
            <div key={ev.id} className="px-3">
              <AgendaRow ev={ev} />
            </div>
          ))
        )}
      </div>

      {/* Info: (20260721 - Luphia) 桌機月曆格 */}
      <div className="hidden overflow-hidden rounded-lg border sm:block">
      <div className="grid grid-cols-7 border-b bg-muted/50 text-center">
        {WEEKDAYS.map((w) => (
          <div key={w} className="py-2 text-xs font-medium text-muted-foreground">
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((day) => {
          const inMonth = day.getMonth() === m;
          const isToday = sameDay(day, today);
          const list = eventsOnDay(day);
          return (
            <div
              key={day.toISOString()}
              className={cn(
                "min-h-24 border-b border-r p-1.5 last:border-r-0 [&:nth-child(7n)]:border-r-0",
                !inMonth && "bg-muted/30",
              )}
            >
              <div
                className={cn(
                  "mb-1 flex h-5 w-5 items-center justify-center rounded-full text-xs tabular-nums",
                  isToday
                    ? "bg-primary font-semibold text-primary-foreground"
                    : inMonth
                      ? "text-foreground"
                      : "text-muted-foreground/50",
                )}
              >
                {day.getDate()}
              </div>
              <div className="space-y-0.5">
                {list.slice(0, 3).map((ev) => (
                  <EventChip key={ev.id} ev={ev} />
                ))}
                {list.length > 3 ? (
                  <div className="px-1 text-[10px] text-muted-foreground">
                    +{list.length - 3} 更多
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
      </div>
    </>
  );
}

function QuarterView({
  anchor,
  eventsInMonth,
}: {
  anchor: Date;
  eventsInMonth: (y: number, m: number) => ParsedEvent[];
}) {
  const y = anchor.getFullYear();
  const q = Math.floor(anchor.getMonth() / 3);
  const months = [q * 3, q * 3 + 1, q * 3 + 2];
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {months.map((m) => {
        const list = eventsInMonth(y, m);
        return (
          <div key={m} className="rounded-lg border p-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold">{m + 1} 月</h3>
              <span className="text-xs text-muted-foreground">
                {list.length} 件
              </span>
            </div>
            <div className="divide-y">
              {list.length === 0 ? (
                <p className="py-2 text-sm text-muted-foreground">無事件</p>
              ) : (
                list.map((ev) => <AgendaRow key={ev.id} ev={ev} />)
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function YearView({
  anchor,
  eventsInMonth,
}: {
  anchor: Date;
  eventsInMonth: (y: number, m: number) => ParsedEvent[];
}) {
  const y = anchor.getFullYear();
  const months = Array.from({ length: 12 }, (_, i) => i);
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {months.map((m) => {
        const list = eventsInMonth(y, m);
        return (
          <div key={m} className="rounded-lg border p-3">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold">{m + 1} 月</h3>
              <span
                className={cn(
                  "rounded-full px-2 text-xs tabular-nums",
                  list.length > 0
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground",
                )}
              >
                {list.length}
              </span>
            </div>
            <div className="space-y-1">
              {list.slice(0, 4).map((ev) => (
                <div key={ev.id} className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      "size-2 shrink-0 rounded-full",
                      CATEGORY_COLOR[ev.category],
                    )}
                  />
                  <span className="w-10 shrink-0 text-[11px] tabular-nums text-muted-foreground">
                    {md(ev.date)}
                  </span>
                  <span className="truncate text-xs">{ev.title}</span>
                </div>
              ))}
              {list.length > 4 ? (
                <div className="text-[11px] text-muted-foreground">
                  +{list.length - 4} 更多
                </div>
              ) : null}
              {list.length === 0 ? (
                <p className="text-xs text-muted-foreground/60">—</p>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
