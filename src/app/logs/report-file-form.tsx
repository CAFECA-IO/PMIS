"use client";

import { useState } from "react";
import { Plus, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { reportStatusMeta } from "@/constant/pmis";
import { fileReportAction, suggestReportAction } from "./actions";

export function ReportFileForm({
  projectId,
  today,
}: {
  projectId: string;
  today?: string;
}) {
  const [reportDate, setReportDate] = useState(today ?? "");
  const [weather, setWeather] = useState("");
  const [status, setStatus] = useState("DRAFT");
  const [summary, setSummary] = useState("");
  const [manpower, setManpower] = useState("");
  const [equipment, setEquipment] = useState("");
  const [keyNotes, setKeyNotes] = useState("");
  const [loading, setLoading] = useState(false);

  async function pull() {
    if (!reportDate) return;
    setLoading(true);
    const res = await suggestReportAction(projectId, reportDate);
    setLoading(false);
    if (res) {
      setSummary(res.summary);
      setKeyNotes(res.keyNotes);
    }
  }

  return (
    <form
      action={fileReportAction}
      className="grid grid-cols-1 gap-3 sm:grid-cols-2"
    >
      <input type="hidden" name="projectId" value={projectId} />
      <label className="space-y-1 text-xs">
        <span className="text-muted-foreground">報表日期</span>
        <Input
          name="reportDate"
          type="date"
          value={reportDate}
          onChange={(e) => setReportDate(e.target.value)}
          required
        />
      </label>
      <label className="space-y-1 text-xs">
        <span className="text-muted-foreground">天氣</span>
        <Input
          name="weather"
          value={weather}
          onChange={(e) => setWeather(e.target.value)}
          placeholder="晴／陰／雨"
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
      <div className="flex items-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={pull}
          disabled={loading || !reportDate}
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
          placeholder="當日施工概況…（可由上方按鈕帶入當日查驗）"
        />
      </label>
      <label className="space-y-1 text-xs">
        <span className="text-muted-foreground">工地人員及機具</span>
        <Input
          name="manpower"
          value={manpower}
          onChange={(e) => setManpower(e.target.value)}
          placeholder="現場 62 人"
        />
      </label>
      <label className="space-y-1 text-xs">
        <span className="text-muted-foreground">機具</span>
        <Input
          name="equipment"
          value={equipment}
          onChange={(e) => setEquipment(e.target.value)}
          placeholder="吊車 2、潛盾機 1"
        />
      </label>
      <label className="space-y-1 text-xs sm:col-span-2">
        <span className="text-muted-foreground">重要事項</span>
        <Textarea
          name="keyNotes"
          rows={2}
          value={keyNotes}
          onChange={(e) => setKeyNotes(e.target.value)}
          placeholder="待改善、待回報事項…（可由上方按鈕帶入當日缺失）"
        />
      </label>
      <div className="sm:col-span-2">
        <Button type="submit" variant="secondary">
          <Plus className="size-4" />
          送出日報
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground sm:col-span-2">
        同一專案同一日期再次送出會更新該日報表。
      </p>
    </form>
  );
}
