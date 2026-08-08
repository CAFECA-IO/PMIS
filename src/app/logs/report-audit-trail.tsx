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
 * 舊格式相容：`snapshot` 欄位加入之前，ITEMS／DELETE 是把摘要與 JSON
 * 用換行接在 `detail` 裡的。那些列的 `snapshot` 為 null，若原樣輸出，
 * 一份 60 個品項的數量表異動會把整段 JSON 陣列當成摘要印在軌跡上，
 * 把同一畫面的其他紀錄整個淹掉。
 *
 * **不回填、只在呈現時相容。** 稽核軌跡是既成紀錄，
 * 為了換個欄位擺放就去改寫歷史列，本身就與它存在的理由相衝突。
 *
 * 判斷條件刻意收得很緊：只有在 `snapshot` 為空、且換行後的內容確實能
 * 解析成 JSON 陣列或物件時才切分。使用者原文含換行的情形（新格式的
 * CREATE／UPDATE）不會誤中，因為那些列的 JSON 解析必然失敗。
 */
export function splitLegacyDetail(
  detail: string | null,
  snapshot: string | null,
): { summary: string; snapshot: string | null } {
  if (snapshot || !detail) return { summary: detail ?? "", snapshot };
  const nl = detail.indexOf("\n");
  if (nl < 0) return { summary: detail, snapshot: null };
  const tail = detail.slice(nl + 1).trim();
  if (!tail.startsWith("[") && !tail.startsWith("{")) {
    return { summary: detail, snapshot: null };
  }
  try {
    JSON.parse(tail);
  } catch {
    return { summary: detail, snapshot: null };
  }
  return { summary: detail.slice(0, nl), snapshot: tail };
}

/**
 * 專案層的日報變更軌跡（含已刪除的日報）。
 *
 * 逐份查看只能看到還存在的日報；而刪除正是最需要被看見的事件
 * —— 它會把某一天的數量從所有月報的累計中移除。
 */
export function ProjectAuditTrail({ projectId }: { projectId: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    let stale = false;
    /*
      不在 effect 本體同步 setState（會造成連鎖渲染，且 eslint 的
      react-hooks/set-state-in-effect 會擋）。舊的錯誤不會被誤顯示：
      切換專案後 `loadedId !== projectId`，render 端先走載入中那一支。
    */
    listProjectAuditAction(projectId)
      .then((data) => {
        if (stale) return;
        if (data.denied) {
          setRows([]);
          setHasMore(false);
          setError("你沒有檢視本專案變更軌跡的權限。");
        } else {
          setRows(data.rows as Row[]);
          setHasMore(data.hasMore);
          setError(null);
        }
        setLoadedId(projectId);
      })
      .catch(() => {
        // 不吞例外：沒有 catch 時畫面會永遠停在「載入中」而不說原因
        if (stale) return;
        setError("無法載入變更軌跡，請重新整理後再試。");
        setLoadedId(projectId);
      });
    return () => {
      stale = true;
    };
  }, [projectId]);

  /** 以最後一筆的時間為游標往下讀；用 offset 會在期間有新紀錄時錯位。 */
  async function loadMore() {
    const last = rows[rows.length - 1];
    if (!last) return;
    setLoadingMore(true);
    try {
      const data = await listProjectAuditAction(
        projectId,
        new Date(last.createdAt).toISOString(),
      );
      if (data.denied) return;
      setRows((prev) => [...prev, ...(data.rows as Row[])]);
      setHasMore(data.hasMore);
    } catch {
      setError("無法載入更早的紀錄。");
    } finally {
      setLoadingMore(false);
    }
  }

  if (loadedId !== projectId) {
    return <p className="text-[11px] text-muted-foreground">載入變更軌跡…</p>;
  }
  if (error) {
    return <p className="text-[11px] text-destructive">{error}</p>;
  }
  if (rows.length === 0) {
    return (
      <p className="text-[11px] text-muted-foreground">本專案尚無日報變更紀錄。</p>
    );
  }
  return (
    <div className="space-y-1">
      <AuditList rows={rows} showDate />
      {/*
        清單被截斷時必須說出來。這個區塊的標題宣稱「含已刪除」，
        靜默截斷會讓稽核者看到一份看起來完整、卻剛好少了那筆刪除紀錄的清單。
      */}
      {hasMore && (
        <div className="flex items-center gap-2 pt-1">
          <span className="text-[11px] text-muted-foreground">
            僅顯示最近 {rows.length} 筆，尚有更早的紀錄。
          </span>
          <button
            type="button"
            onClick={loadMore}
            disabled={loadingMore}
            className="text-[11px] text-primary hover:underline disabled:opacity-50"
          >
            {loadingMore ? "載入中…" : "載入更早的"}
          </button>
        </div>
      )}
    </div>
  );
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
        const { summary, snapshot: raw } = splitLegacyDetail(r.detail, r.snapshot);
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
