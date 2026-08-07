"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { reportStatusMeta, workStopReasonOptions } from "@/constant/pmis";
import { suggestReportAction } from "@/app/logs/actions";
import { WEATHER_OPTIONS } from "@/constant/weather";
import { ReportQtyTable } from "@/app/logs/report-qty-table";
import { ReportProgressStrip } from "@/app/logs/report-progress-strip";

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
  const [stopReason, setStopReason] = useState("");
  const [excluded, setExcluded] = useState(false);
  const [exclusionBasis, setExclusionBasis] = useState("");
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
      <ReportProgressStrip projectId={projectId} reportDate={reportDate} />
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
