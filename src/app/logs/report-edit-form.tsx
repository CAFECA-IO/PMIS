"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { reportStatusMeta } from "@/constant/pmis";
import { updateReportAction, suggestReportAction } from "./actions";
import { ReportDeleteButton } from "./report-delete-button";

export function ReportEditForm({
  id,
  projectId,
  dateISO,
  dateLabel,
  initial,
}: {
  id: string;
  projectId: string;
  dateISO: string;
  dateLabel: string;
  initial: {
    weather: string;
    status: string;
    summary: string;
    manpower: string;
    equipment: string;
    keyNotes: string;
  };
}) {
  const [weather, setWeather] = useState(initial.weather);
  const [status, setStatus] = useState(initial.status);
  const [summary, setSummary] = useState(initial.summary);
  const [manpower, setManpower] = useState(initial.manpower);
  const [equipment, setEquipment] = useState(initial.equipment);
  const [keyNotes, setKeyNotes] = useState(initial.keyNotes);
  const [loading, setLoading] = useState(false);

  async function pull() {
    setLoading(true);
    const res = await suggestReportAction(projectId, dateISO);
    setLoading(false);
    if (res) {
      setSummary(res.summary);
      setKeyNotes(res.keyNotes);
    }
  }

  return (
    <form
      action={updateReportAction}
      className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2"
    >
      <input type="hidden" name="id" value={id} />
      <label className="space-y-1 text-xs">
        <span className="text-muted-foreground">天氣</span>
        <Input
          name="weather"
          value={weather}
          onChange={(e) => setWeather(e.target.value)}
        />
      </label>
      <label className="space-y-1 text-xs">
        <span className="text-muted-foreground">狀態</span>
        <Select
          name="status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          {Object.entries(reportStatusMeta).map(([v, m]) => (
            <option key={v} value={v}>
              {m.label}
            </option>
          ))}
        </Select>
      </label>
      <div className="flex items-end sm:col-span-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={pull}
          disabled={loading}
        >
          <Sparkles className="size-4" />
          {loading ? "帶入中…" : "帶入當日查驗/缺失"}
        </Button>
      </div>
      <label className="space-y-1 text-xs sm:col-span-2">
        <span className="text-muted-foreground">按圖施工概況</span>
        <Textarea
          name="summary"
          rows={2}
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
        />
      </label>
      <label className="space-y-1 text-xs">
        <span className="text-muted-foreground">工地人員及機具</span>
        <Input
          name="manpower"
          value={manpower}
          onChange={(e) => setManpower(e.target.value)}
        />
      </label>
      <label className="space-y-1 text-xs">
        <span className="text-muted-foreground">機具</span>
        <Input
          name="equipment"
          value={equipment}
          onChange={(e) => setEquipment(e.target.value)}
        />
      </label>
      <label className="space-y-1 text-xs sm:col-span-2">
        <span className="text-muted-foreground">重要事項</span>
        <Textarea
          name="keyNotes"
          rows={2}
          value={keyNotes}
          onChange={(e) => setKeyNotes(e.target.value)}
        />
      </label>
      <div className="flex items-center gap-2 sm:col-span-2">
        <Button type="submit" size="sm" variant="secondary">
          儲存
        </Button>
        <ReportDeleteButton id={id} label={dateLabel} />
      </div>
    </form>
  );
}
