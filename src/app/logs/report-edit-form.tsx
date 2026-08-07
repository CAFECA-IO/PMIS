"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { reportStatusMeta, workStopReasonOptions } from "@/constant/pmis";
import { updateReportAction, suggestReportAction } from "@/app/logs/actions";
import { ReportDeleteButton } from "@/app/logs/report-delete-button";
import { WEATHER_OPTIONS } from "@/constant/weather";
import { ReportQtyTable } from "@/app/logs/report-qty-table";
import { ReportProgressStrip } from "@/app/logs/report-progress-strip";

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
    /** 停工原因；空字串代表當日有施工。 */
    stopReason: string;
    excludedFromDuration: boolean;
    exclusionBasis: string;
    status: string;
    summary: string;
    manpower: string;
    equipment: string;
    keyNotes: string;
  };
}) {
  const [weather, setWeather] = useState(initial.weather);
  const [status, setStatus] = useState(initial.status);
  const [stopReason, setStopReason] = useState((initial.stopReason ?? ""));
  const [excluded, setExcluded] = useState(initial.excludedFromDuration);
  const [exclusionBasis, setExclusionBasis] = useState(initial.exclusionBasis);
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
      <input type="hidden" name="weather" value={weather} />
      <div className="space-y-1 text-xs">
        <span className="text-muted-foreground">天氣</span>
        <div className="grid grid-cols-5 gap-1" role="group" aria-label="天氣">
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
        <span className="text-muted-foreground">停工原因</span>
        <Select
          name="stopReason"
          value={stopReason}
          onChange={(e) => setStopReason(e.target.value)}
        >
          {/* 留空＝當日有施工；此欄是工作日統計的權威來源（決策 H） */}
          <option value="">當日有施工</option>
          {workStopReasonOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </label>
      {/*
        免計工期具法律效果（結算與工期展延爭議），故與停工原因分開：
        停工不必然免計（例假日在日曆天契約下仍計工期），
        免計與否是監造依契約條款的宣告，系統不推測。
      */}
      <label className="flex items-center gap-2 text-xs sm:col-span-2">
        <input
          type="checkbox"
          name="excludedFromDuration"
          value="1"
          checked={excluded}
          onChange={(e) => setExcluded(e.target.checked)}
        />
        <span className="text-muted-foreground">本日免計工期</span>
      </label>
      {excluded && (
        <label className="space-y-1 text-xs sm:col-span-2">
          <span className="text-muted-foreground">免計工期之契約依據</span>
          <Input
            name="exclusionBasis"
            value={exclusionBasis}
            onChange={(e) => setExclusionBasis(e.target.value)}
            placeholder="如 工程契約書第 7 條"
          />
        </label>
      )}
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
        <Button type="button" size="sm" onClick={pull} disabled={loading}>
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
      <ReportProgressStrip projectId={projectId} reportDate={dateISO} />
      <ReportQtyTable
        projectId={projectId}
        reportDate={dateISO}
        status={status}
      />
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
