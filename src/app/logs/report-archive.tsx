"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
/** 版本識別用的時間戳（毫秒）。 */
const stampOf = (v: Date | string) => new Date(v).getTime();

/** 展開中的內容，連同讀取當下的版本。 */
type Opened = {
  id: string;
  markdown: string;
  /** 讀取當下該列的 generatedAt（毫秒）；用以偵測內容已被覆寫。 */
  generatedAt: number;
};

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
  periodConfirmedId = null,
  /** 確認／刪除後通知產生器重新取數（其留存狀態已改變）。 */
  onChanged,
}: {
  projectId: string;
  canEdit: boolean;
  reloadToken?: number;
  currentId?: string | null;
  /**
   * 目前期間的定稿 id。
   *
   * 上方橫幅會說「本期已有定稿報表（見下方留存清單）」——
   * 沒有這個標示，那句話就指向一個在清單裡認不出來的東西。
   */
  periodConfirmedId?: string | null;
  onChanged?: () => void;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /**
   * 展開中的那一份的全文；一次只開一份，避免長文互相干擾。
   *
   * 連同讀取當下的 `generatedAt` 一起記住：草稿是同一列原地覆寫，
   * 別處按下重新生成後，這個面板的內容就與該列的「產生於」對不上了。
   * 先前只在展開時設定一次，於是列上的時間跳到新版、面板卻仍渲染舊內容
   * —— 使用者讀舊的、對著新的按確認定稿。
   */
  const [opened, setOpened] = useState<Opened | null>(null);
  /** 因內容已被重新產生而被收起的那一份；提示使用者重新開啟。 */
  const [staleId, setStaleId] = useState<string | null>(null);

  /*
    以 ref 讀取當前展開狀態：load 不能把 opened 放進相依陣列
    （否則展開／收合都會重新載入清單），但又必須拿到最新值來比對版本。
  */
  const openedRef = useRef<Opened | null>(null);
  useEffect(() => {
    openedRef.current = opened;
  }, [opened]);

  const key = `${projectId}|${reloadToken}`;

  const load = useCallback(() => {
    listSavedReportsAction(projectId).then((data) => {
      const fresh = data as Row[];
      setRows(fresh);

      /*
        清單每次重載都要重新驗證展開中的內容是否仍是同一版。
        不驗證的話，畫面上會同時出現新版的「產生於」與舊版的內文。
      */
      const open = openedRef.current;
      if (open) {
        const row = fresh.find((r) => r.id === open.id);
        if (!row) {
          setOpened(null);
        } else if (stampOf(row.generatedAt) !== open.generatedAt) {
          // 不靜默換掉眼前的內容：收起並要求重新開啟，讓重讀是個明確動作
          setOpened(null);
          setStaleId(open.id);
        }
      }
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
    if (staleId === id) setStaleId(null);
    // 記下讀取當下的版本，供後續比對與定稿守門
    setOpened({
      id,
      markdown: row.markdown,
      generatedAt: stampOf(row.generatedAt),
    });
  }

  async function onConfirm(r: Row) {
    setBusy(r.id);
    setError(null);
    /*
      送出「使用者眼前這一份」的版本。展開讀過的以面板為準，
      否則以列上顯示的產出時間為準 —— 兩者都是畫面上看得到的值。
      伺服器比對不符即拒絕（見 confirmSavedReport）。
    */
    const expected =
      opened?.id === r.id ? opened.generatedAt : stampOf(r.generatedAt);
    const res = await confirmSavedReportAction(r.id, expected);
    setBusy(null);
    if (!res.ok) {
      setError(res.error);
      load(); // 讓畫面追上實際版本，使用者才知道自己看的是舊的
    } else {
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
                {r.id === currentId ? (
                  <Badge variant="outline">上方顯示的這一版</Badge>
                ) : r.id === periodConfirmedId ? (
                  <Badge variant="outline">本期定稿</Badge>
                ) : null}
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
                      onClick={() => onConfirm(r)}
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
              {staleId === r.id && (
                <div className="border-t bg-warning/10 px-4 py-2 text-[11px] text-muted-foreground">
                  此報表已被重新產生，先前展開的內容已非最新版；請重新開啟以讀取現在的內容。
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
