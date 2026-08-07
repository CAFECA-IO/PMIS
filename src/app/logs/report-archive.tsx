"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  confirmSavedReportAction,
  deleteSavedReportAction,
  listSavedReportsAction,
} from "@/app/logs/actions";
import { formatDate } from "@/lib/utils";

/**
 * 已留存的彙整報表（決策 J-a）。
 *
 * 報表的每個數字都是即時推導，同一期間在不同時間產生會得到不同結果；
 * 留存下來的那一份才是「送審出去的版本」。已確認者內容凍結、不可刪除。
 */

type Row = {
  id: string;
  title: string;
  periodLabel: string;
  status: string;
  createdAt: Date | string;
  generatedBy: string | null;
  confirmedAt: Date | string | null;
  confirmedBy: string | null;
};

export function ReportArchive({
  projectId,
  canEdit,
  /** 由產生器在留存成功後遞增，用以觸發重新載入。 */
  reloadToken = 0,
}: {
  projectId: string;
  canEdit: boolean;
  reloadToken?: number;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  async function onConfirm(id: string) {
    setBusy(id);
    setError(null);
    const r = await confirmSavedReportAction(id);
    setBusy(null);
    if (!r.ok) setError(r.error);
    else load();
  }

  async function onDelete(id: string) {
    setBusy(id);
    setError(null);
    const r = await deleteSavedReportAction(id);
    setBusy(null);
    if (!r.ok) setError(r.error);
    else load();
  }

  if (loadedKey !== key && rows.length === 0) {
    return <p className="text-xs text-muted-foreground">載入留存報表…</p>;
  }

  if (rows.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        尚無留存的報表。報表內容為即時推導，按「留存此報表」可保存目前這一版，
        作為送審依據。
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="divide-y rounded-lg border">
        {rows.map((r) => {
          const confirmed = r.status === "CONFIRMED";
          return (
            <div
              key={r.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 p-2 text-xs"
            >
              <Badge variant={confirmed ? "success" : "muted"}>
                {confirmed ? "已確認" : "草稿"}
              </Badge>
              <span className="font-medium">{r.periodLabel}</span>
              <span className="text-muted-foreground">
                產生於 {formatDate(new Date(r.createdAt))}
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
                </span>
              )}
              {confirmed && (
                <span className="ml-auto text-muted-foreground">
                  {/* 已確認者為送審依據之留存，內容凍結 */}
                  內容已凍結，不可修改或刪除
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
