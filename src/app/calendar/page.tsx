import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { CalendarView } from "@/components/calendar-view";
import * as calendarService from "@/service/calendar.service";

export const dynamic = "force-dynamic";
export const metadata = { title: "行事曆預警 — PMIS" };

export default async function CalendarPage() {
  const events = await calendarService.listCalendarEvents();
  const todayISO = new Date().toISOString();

  return (
    <>
      <PageHeader
        title="行事曆提醒及預警"
        description="PMIS-01 · 以週/月/季/年檢視未來履約、送審、查核與改善期限"
      />
      <div className="p-8">
        <Card>
          <CardContent className="p-5">
            <CalendarView events={events} todayISO={todayISO} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
