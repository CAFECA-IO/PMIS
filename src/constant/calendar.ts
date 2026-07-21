import type { ReminderCategory } from "@/generated/prisma/enums";

export type CalendarEvent = {
  id: string;
  title: string;
  category: ReminderCategory;
  dueDate: string; // ISO string
  projectName: string;
};

export type CalendarMode = "week" | "month" | "quarter" | "year";

export const CALENDAR_MODES: { key: CalendarMode; label: string }[] = [
  { key: "week", label: "週" },
  { key: "month", label: "月" },
  { key: "quarter", label: "季" },
  { key: "year", label: "年" },
];

export const CATEGORY_COLOR: Record<ReminderCategory, string> = {
  DEADLINE: "bg-red-500",
  MEETING: "bg-sky-500",
  SUBMITTAL: "bg-violet-500",
  AUDIT: "bg-amber-500",
  IMPROVEMENT: "bg-orange-500",
  OTHER: "bg-zinc-400",
};

export const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];
