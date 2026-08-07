"use client";

import { useEffect, useState } from "react";

import { listReportAuditAction } from "@/app/logs/actions";
import { reportStatusMeta } from "@/constant/pmis";

/**
 * 日報變更軌跡（決策 J-b）。
 *
 * 日報是施工紀錄本，本就允許更正 —— 規矩不是「不准改」而是「改了要看得出來」。
 * 且日報數量是月報金額的來源，事後修正會改變彙整結果，
 * 沒有軌跡就無從說明差異從何而來。
 */

type Row = {
  id: string;
  action: string;
  actorName: string | null;
  fromStatus: string | null;
  toStatus: string | null;
  detail: string | null;
  createdAt: Date | string;
};

const ACTION_LABEL: Record<string, string> = {
  CREATE: "建立",
  UPDATE: "欄位異動",
  STATUS: "狀態變更",
  ITEMS: "數量表異動",
  DELETE: "刪除",
};

const statusLabel = (v: string | null) =>
  v && v in reportStatusMeta
    ? reportStatusMeta[v as keyof typeof reportStatusMeta].label
    : (v ?? "—");

const stamp = (v: Date | string) => {
  const d = new Date(v);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

/**
 * 數量表軌跡的 detail 為「摘要\\nJSON」：
 * 摘要給人看，JSON 是變更前的完整明細供回溯重建，預設收合。
 */
function splitDetail(detail: string | null): { summary: string; raw: string | null } {
  if (!detail) return { summary: "", raw: null };
  const i = detail.indexOf("\n");
  if (i < 0) return { summary: detail, raw: null };
  return { summary: detail.slice(0, i), raw: detail.slice(i + 1) };
}

export function ReportAuditTrail({ reportId }: { reportId: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loadedId, setLoadedId] = useState<string | null>(null);

  useEffect(() => {
    let stale = false;
    listReportAuditAction(reportId).then((data) => {
      if (stale) return;
      setRows(data as Row[]);
      setLoadedId(reportId);
    });
    return () => {
      stale = true;
    };
  }, [reportId]);

  if (loadedId !== reportId) {
    return <p className="text-[11px] text-muted-foreground">載入變更軌跡…</p>;
  }
  if (rows.length === 0) {
    return (
      <p className="text-[11px] text-muted-foreground">
        尚無變更紀錄（建立後未再修改）。
      </p>
    );
  }

  return (
    <ul className="space-y-1 text-[11px]">
      {rows.map((r) => {
        const { summary, raw } = splitDetail(r.detail);
        return (
          <li key={r.id} className="border-l-2 pl-2">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-medium">{ACTION_LABEL[r.action] ?? r.action}</span>
              <span className="text-muted-foreground">{stamp(r.createdAt)}</span>
              {r.actorName && (
                <span className="text-muted-foreground">{r.actorName}</span>
              )}
            </div>
            {r.action === "STATUS" && (
              <div className="text-muted-foreground">
                {statusLabel(r.fromStatus)} → {statusLabel(r.toStatus)}
              </div>
            )}
            {/* 建立時的狀態即後續狀態轉換的起點，缺了它軌跡接不回起點 */}
            {r.action === "CREATE" && r.toStatus && (
              <div className="text-muted-foreground">
                建立時狀態：{statusLabel(r.toStatus)}
              </div>
            )}
            {summary && (
              <div className="whitespace-pre-wrap text-muted-foreground">
                {summary}
              </div>
            )}
            {raw && (
              <details className="mt-0.5">
                <summary className="cursor-pointer text-muted-foreground hover:underline">
                  變更前明細
                </summary>
                <pre className="mt-1 overflow-x-auto rounded bg-muted/50 p-1 text-[10px]">
                  {raw}
                </pre>
              </details>
            )}
          </li>
        );
      })}
    </ul>
  );
}
