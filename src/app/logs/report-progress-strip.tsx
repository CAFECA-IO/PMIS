"use client";

import { useEffect, useState } from "react";

import { loadDailyProgressAction } from "@/app/logs/actions";
import type { DailyProgress } from "@/service/supervisionReport.service";

/**
 * 當日預定 vs 實際累計進度（決策 C）。
 *
 * 預定取自工項預定起訖日的線性展開，與月報同基準（決策 I）；
 * 實際為「期初 + Σ 截至該日的日報數量」推得（決策 A）。
 *
 * 兩者皆為**即時推導的判讀輔助**，非日報上具法律效力的載明值，
 * 故不隨表單送出、也不存欄位。
 *
 * 顯示的實際進度反映**已計入**（已提送／已核備）的日報，
 * 不含正在編輯中尚未送出的數量 —— 畫面上明確標示，
 * 否則使用者會以為剛填的數字沒生效。
 */
export function ReportProgressStrip({
  projectId,
  reportDate,
}: {
  projectId: string;
  reportDate: string;
}) {
  const [data, setData] = useState<DailyProgress | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);

  const key = `${projectId}|${reportDate}`;
  const loading = loadedKey !== key;

  useEffect(() => {
    // 未選日期時不取數；元件本身於此情形不渲染，故無須清狀態
    if (!reportDate) return;
    let stale = false;
    loadDailyProgressAction(projectId, reportDate).then((d) => {
      if (stale) return;
      setData(d);
      setLoadedKey(key);
    });
    return () => {
      stale = true;
    };
  }, [projectId, reportDate, key]);

  if (!reportDate) return null;

  const fmt = (v: number | null) => (v == null ? "—" : `${v}%`);
  const gap =
    data && data.planned != null
      ? Math.round((data.actual - data.planned) * 100) / 100
      : null;

  return (
    <div className="rounded border bg-muted/30 px-2 py-1 text-[11px] sm:col-span-2">
      {loading ? (
        <span className="text-muted-foreground">計算當日進度…</span>
      ) : (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
          <span className="text-muted-foreground">
            當日預定 <span className="font-medium tabular-nums">{fmt(data?.planned ?? null)}</span>
          </span>
          <span className="text-muted-foreground">
            截至當日實際{" "}
            <span className="font-medium tabular-nums">
              {data ? `${data.actual}%` : "—"}
            </span>
          </span>
          {gap != null && (
            <span className={gap < 0 ? "text-warning" : "text-muted-foreground"}>
              {/* 一律用「個百分點」，不用達成率等自創指標（與月報範本一致） */}
              {gap >= 0 ? "超前" : "落後"} {Math.abs(gap)} 個百分點
            </span>
          )}
          <span className="text-muted-foreground">
            （實際僅含已提送／已核備之日報，不含本次尚未送出的數量）
          </span>
        </div>
      )}
    </div>
  );
}
