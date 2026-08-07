"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { reportStatusMeta } from "@/constant/pmis";
import { suggestReportAction } from "@/app/logs/actions";
import { WEATHER_OPTIONS } from "@/constant/weather";
import { ReportQtyTable } from "@/app/logs/report-qty-table";

/**
 * 日報欄位（供 CreateRecordDialog 作為 children 使用）。
 * 不含 <form>：由外層對話框提供 form 與送出；此處僅提供受控欄位與「帶入當日查驗/缺失」。
 */
export function ReportDialogFields({
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
    <>
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="weather" value={weather} />
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
      <div className="space-y-1 text-xs">
        <span className="text-muted-foreground">天氣</span>
        <div className="grid grid-cols-3 gap-1" role="group" aria-label="天氣">
          {WEATHER_OPTIONS.map(({ value, Icon }) => (
            <Button
              key={value}
              type="button"
              size="sm"
              variant={weather === value ? "default" : "outline"}
              aria-pressed={weather === value}
              onClick={() => setWeather(value)}
            >
              <Icon />
              <span>{value}</span>
            </Button>
          ))}
        </div>
      </div>
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
      <ReportQtyTable
        projectId={projectId}
        reportDate={reportDate}
        status={status}
      />
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
    </>
  );
}
