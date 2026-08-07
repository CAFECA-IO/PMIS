"use client";

import { useEffect, useState } from "react";

import {
  listProjectAuditAction,
  listReportAuditAction,
} from "@/app/logs/actions";
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
  /** 該日報的報表日期；專案層清單靠它辨識是哪一天（尤其是已刪除者）。 */
  reportDate?: Date | string | null;
  actorName: string | null;
  fromStatus: string | null;
  toStatus: string | null;
  /** 供人閱讀的摘要；可能含換行（使用者原文）。 */
  detail: string | null;
  /** 變更前／建立時的完整內容 JSON。 */
  snapshot: string | null;
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

/*
  摘要與完整快照是兩個欄位，不再從單一字串切分。

  先前以「第一個換行之後即為 JSON」判斷，但摘要含使用者原文，
  原文可以有換行：`施工概況：上午澆置\n下午養護` 會讓「下午養護…」
  被摺進標示為「變更前明細」的區塊 —— 而且是在一列 CREATE 上，
  CREATE 根本沒有變更前。兩種東西放兩個欄位，就不需要嗅探。
*/

/**
 * 專案層的日報變更軌跡（含已刪除的日報）。
 *
 * 逐份查看只能看到還存在的日報；而刪除正是最需要被看見的事件
 * —— 它會把某一天的數量從所有月報的累計中移除。
 */
export function ProjectAuditTrail({ projectId }: { projectId: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loadedId, setLoadedId] = useState<string | null>(null);

  useEffect(() => {
    let stale = false;
    listProjectAuditAction(projectId).then((data) => {
      if (stale) return;
      setRows(data as Row[]);
      setLoadedId(projectId);
    });
    return () => {
      stale = true;
    };
  }, [projectId]);

  if (loadedId !== projectId) {
    return <p className="text-[11px] text-muted-foreground">載入變更軌跡…</p>;
  }
  if (rows.length === 0) {
    return (
      <p className="text-[11px] text-muted-foreground">本專案尚無日報變更紀錄。</p>
    );
  }
  return <AuditList rows={rows} showDate />;
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

  return <AuditList rows={rows} />;
}

/**
 * 軌跡列表的呈現。
 *
 * 逐份與專案層共用同一份呈現：兩處若各寫一份，日後只改其中一處
 * 會讓同一筆紀錄在兩個畫面上說法不同 —— 那正是稽核軌跡最不該發生的事。
 */
function AuditList({ rows, showDate = false }: { rows: Row[]; showDate?: boolean }) {
  return (
    <ul className="space-y-1 text-[11px]">
      {rows.map((r) => {
        const summary = r.detail ?? "";
        const raw = r.snapshot;
        return (
          <li key={r.id} className="border-l-2 pl-2">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-medium">{ACTION_LABEL[r.action] ?? r.action}</span>
              {/* 專案層需標明是哪一天的日報；已刪除者更是只剩這個線索 */}
              {showDate && (
                <span className="font-medium">
                  {r.reportDate
                    ? `${new Date(r.reportDate).getFullYear()}/${String(
                        new Date(r.reportDate).getMonth() + 1,
                      ).padStart(2, "0")}/${String(
                        new Date(r.reportDate).getDate(),
                      ).padStart(2, "0")}`
                    : "日期未紀錄"}
                </span>
              )}
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
                  {/* 同一個 JSON 區塊在不同動作下語意不同，標題須跟著改 */}
                  {r.action === "CREATE"
                    ? "建立時的完整內容"
                    : r.action === "DELETE"
                      ? "刪除前的完整內容"
                      : "變更前的完整內容"}
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
