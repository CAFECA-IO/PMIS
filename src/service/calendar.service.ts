import * as reminderRepo from "@/repository/reminder.repository";
import type { CalendarEvent } from "@/constant/calendar";

/** Returns reminder events shaped for the calendar view. */
export async function listCalendarEvents(): Promise<CalendarEvent[]> {
  const rows = await reminderRepo.listWithProject();
  return rows.map((e) => ({
    id: e.id,
    title: e.title,
    category: e.category,
    dueDate: e.dueDate.toISOString(),
    projectName: e.project.name,
  }));
}
