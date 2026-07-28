"use client";

import { useState, useTransition } from "react";
import { Check, Download, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  obligationRiskMeta,
  obligationStageMeta,
  obligationStatusMeta,
  obligationTriggerMeta,
} from "@/constant/obligation";
import { ownerLabel, toCsv, type ObligationRow } from "@/service/obligation-view";
import { completeObligationAction } from "./actions";

const fmt = (iso: string | null) => (iso ? iso.slice(0, 10) : "—");

export function ObligationTable({
  rows,
  total,
  canEdit,
  showProject,
}: {
  rows: ObligationRow[];
  total: number;
  canEdit: boolean;
  showProject: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  /** 匯出目前篩選後的清單；在瀏覽器端組 CSV，不需往返伺服器。 */
  function exportCsv() {
    const csv = toCsv(rows, {
      stage: (v) => obligationStageMeta[v].label,
      risk: (v) => obligationRiskMeta[v].label,
      trigger: (v) => obligationTriggerMeta[v].label,
      status: (v) => obligationStatusMeta[v].label,
    });
    // BOM 讓 Excel 正確辨識 UTF-8 中文
    const blob = new Blob([`﻿${csv}`], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `履約事項_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const cols = showProject
    ? "grid-cols-[24px_132px_104px_minmax(220px,1fr)_140px_136px_104px_112px_100px_minmax(140px,0.8fr)_92px]"
    : "grid-cols-[24px_132px_104px_minmax(220px,1fr)_136px_104px_112px_100px_minmax(140px,0.8fr)_92px]";

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            共 <span className="font-medium text-foreground">{rows.length}</span>{" "}
            項
            {rows.length !== total ? `（全部 ${total} 項）` : ""}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={exportCsv}
            disabled={rows.length === 0}
          >
            <Download className="size-4" />
            匯出 CSV
          </Button>
        </div>

        {rows.length === 0 ? (
          <p className="rounded-md border border-dashed px-3 py-10 text-center text-sm text-muted-foreground">
            沒有符合條件的履約事項。
          </p>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[1180px] space-y-1">
              <div
                className={cn(
                  "grid gap-2 whitespace-nowrap border-b px-2 pb-2 text-[11px] font-medium text-muted-foreground",
                  cols,
                )}
              >
                <span>風險</span>
                <span>管制編號</span>
                <span>階段</span>
                <span>履約事項</span>
                {showProject ? <span>專案</span> : null}
                <span>責任單位／人</span>
                <span>觸發方式</span>
                <span>期限</span>
                <span>狀態</span>
                <span>契約依據</span>
                <span className="text-right">操作</span>
              </div>

              {rows.map((r) => {
                const risk = obligationRiskMeta[r.risk];
                const overdue = r.status === "OVERDUE";
                return (
                  <div
                    key={r.id}
                    className={cn(
                      "grid items-center gap-2 rounded-md px-2 py-2 text-sm transition-colors hover:bg-muted/50",
                      cols,
                    )}
                  >
                    <span className="flex items-center">
                      <span
                        className={cn("size-2.5 rounded-full", risk.dot)}
                        title={risk.label}
                        aria-label={risk.label}
                      />
                    </span>
                    <span className="truncate font-mono text-xs text-muted-foreground">
                      {r.code}
                    </span>
                    <span>
                      <Badge variant={obligationStageMeta[r.stage].variant}>
                        {obligationStageMeta[r.stage].label}
                      </Badge>
                    </span>
                    <span className="truncate font-medium" title={r.title}>
                      {r.title}
                    </span>
                    {showProject ? (
                      <span
                        className="truncate text-xs text-muted-foreground"
                        title={r.projectName ?? ""}
                      >
                        {r.projectName ?? "—"}
                      </span>
                    ) : null}
                    <span className="truncate text-xs text-muted-foreground">
                      {ownerLabel(r) || "—"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {obligationTriggerMeta[r.triggerType].label}
                    </span>
                    <span
                      className={cn(
                        "whitespace-nowrap text-xs tabular-nums text-muted-foreground",
                        overdue && "font-semibold text-foreground",
                      )}
                    >
                      {fmt(r.dueDate)}
                    </span>
                    <span>
                      <Badge variant={obligationStatusMeta[r.status].variant}>
                        {obligationStatusMeta[r.status].label}
                      </Badge>
                    </span>
                    <span
                      className="truncate text-xs text-muted-foreground"
                      title={r.contractBasis ?? ""}
                    >
                      {r.contractBasis ?? "—"}
                    </span>
                    <span className="text-right">
                      {canEdit && r.status !== "DONE" ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={pending && busyId === r.id}
                          onClick={() => {
                            setBusyId(r.id);
                            startTransition(async () => {
                              await completeObligationAction(r.id);
                              setBusyId(null);
                            });
                          }}
                        >
                          {pending && busyId === r.id ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <Check className="size-3.5" />
                          )}
                          完成
                        </Button>
                      ) : r.actualDate ? (
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {fmt(r.actualDate)}
                        </span>
                      ) : null}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
