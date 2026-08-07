"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, ChevronDown, ChevronRight, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Markdown } from "@/components/markdown";
import {
  confirmSavedReportAction,
  deleteSavedReportAction,
  listSavedReportsAction,
  openSavedReportAction,
} from "@/app/logs/actions";
import { formatDate } from "@/lib/utils";
import {
  isPeriodReportFrozen,
  periodReportStatusMeta,
} from "@/constant/pmis";
import type { PeriodReportStatus } from "@/generated/prisma/enums";

/*
  顯示到分鐘。清單依產出時間排序，而同一天內反覆重新生成是常態；
  只顯示日期會讓相鄰兩列看起來同時產生，排序失去可驗證性。
*/
const stamp = (v: Date | string) => {
  const d = new Date(v);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${formatDate(d)} ${hh}:${mm}`;
};

/**
 * 已留存的彙整報表（決策 J-a）。
 *
 * 報表的每個數字都是即時推導，同一期間在不同時間產生會得到不同結果；
 * 留存下來的那一份才是「送審出去的版本」。已確認者內容凍結、不可刪除。
 *
 * 每一列都可展開讀全文 —— 只列 metadata 的留存等於存進去再也打不開，
 * 而「事後能把當時送出的那份調出來看」正是留存唯一的用途。
 */

type Row = {
  id: string;
  title: string;
  periodLabel: string;
  status: PeriodReportStatus;
  /** 本份內容的產出時間；草稿覆寫時會更新，故不用 createdAt。 */
  generatedAt: Date | string;
  generatedBy: string | null;
  confirmedAt: Date | string | null;
  confirmedBy: string | null;
};

export function ReportArchive({
  projectId,
  canEdit,
  /** 由產生器在每次產出後遞增，用以觸發重新載入。 */
  reloadToken = 0,
  /** 產生器畫面上那一版的留存 id，用以標示「就是這一份」。 */
  currentId = null,
  /** 確認／刪除後通知產生器重新取數（其留存狀態已改變）。 */
  onChanged,
}: {
  projectId: string;
  canEdit: boolean;
  reloadToken?: number;
  currentId?: string | null;
  onChanged?: () => void;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** 展開中的那一份的全文；一次只開一份，避免長文互相干擾。 */
  const [opened, setOpened] = useState<{ id: string; markdown: string } | null>(
    null,
  );

  const key = `${projectId}|${reloadToken}`;

  const load = useCallback(() => {
    listSavedReportsAction(projectId).then((data) => {
      setRows(data as Row[]);
      setLoadedKey(key);
    });
  }, [projectId, key]);

  useEffect(() => {
    load();
  }, [load]);

  async function onToggleOpen(id: string) {
    if (opened?.id === id) {
      setOpened(null);
      return;
    }
    setBusy(id);
    setError(null);
    const row = await openSavedReportAction(id);
    setBusy(null);
    if (!row) {
      setError("無法開啟此報表。");
      return;
    }
    setOpened({ id, markdown: row.markdown });
  }

  async function onConfirm(id: string) {
    setBusy(id);
    setError(null);
    const r = await confirmSavedReportAction(id);
    setBusy(null);
    if (!r.ok) setError(r.error);
    else {
      load();
      onChanged?.();
    }
  }

  async function onDelete(id: string) {
    setBusy(id);
    setError(null);
    const r = await deleteSavedReportAction(id);
    setBusy(null);
    if (!r.ok) setError(r.error);
    else {
      if (opened?.id === id) setOpened(null);
      /*
        刻意不通知產生器重新產製：那會立刻為當前期間再存一份草稿，
        看起來像「刪不掉」。刪除只針對其他期間的舊草稿。
      */
      load();
    }
  }

  if (loadedKey !== key && rows.length === 0) {
    return <p className="text-xs text-muted-foreground">載入留存報表…</p>;
  }

  if (rows.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        尚無留存的報表。報表產出時即會留存為該期間的草稿，
        經「確認定稿」後內容凍結，作為送審依據。
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="divide-y rounded-lg border">
        {rows.map((r) => {
          const meta = periodReportStatusMeta[r.status];
          const confirmed = isPeriodReportFrozen(r.status);
          const isOpen = opened?.id === r.id;
          return (
            <div key={r.id}>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 p-2 text-xs">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-6 px-1"
                  aria-label={isOpen ? "收起內容" : "開啟內容"}
                  aria-expanded={isOpen}
                  disabled={busy === r.id}
                  onClick={() => void onToggleOpen(r.id)}
                >
                  {isOpen ? (
                    <ChevronDown className="size-3.5" />
                  ) : (
                    <ChevronRight className="size-3.5" />
                  )}
                </Button>
                <Badge variant={meta.variant}>{meta.label}</Badge>
                <span className="font-medium">{r.periodLabel}</span>
                {/* 讓「上面那一版」與清單裡的哪一列對應得起來 */}
                {r.id === currentId && (
                  <Badge variant="outline">上方顯示的這一版</Badge>
                )}
                <span className="text-muted-foreground">
                  產生於 {stamp(r.generatedAt)}
                  {r.generatedBy ? `・${r.generatedBy}` : ""}
                </span>
                {confirmed && r.confirmedAt && (
                  <span className="text-muted-foreground">
                    確認於 {formatDate(new Date(r.confirmedAt))}
                    {r.confirmedBy ? `・${r.confirmedBy}` : ""}
                  </span>
                )}
                {canEdit && !confirmed && (
                  <span className="ml-auto flex gap-1">
                    {r.id === currentId && (
                      <span className="self-center mr-2 text-[11px] text-muted-foreground">
                        重新生成即覆寫，無需刪除
                      </span>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busy === r.id}
                      onClick={() => onConfirm(r.id)}
                    >
                      <Check className="size-3.5" />
                      確認定稿
                    </Button>
                    {r.id !== currentId && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        aria-label="刪除草稿"
                        disabled={busy === r.id}
                        onClick={() => onDelete(r.id)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    )}
                  </span>
                )}
                {confirmed && (
                  <span className="ml-auto text-muted-foreground">
                    {/* 已確認者為送審依據之留存，內容凍結 */}
                    內容已凍結，不可修改或刪除
                  </span>
                )}
              </div>
              {isOpen && (
                <div className="border-t bg-muted/30 p-4">
                  <Markdown content={opened.markdown} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
