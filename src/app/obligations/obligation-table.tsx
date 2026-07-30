"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ChevronRight, Download, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm-provider";
import { useNotification } from "@/components/ui/notification";
import { cn } from "@/lib/utils";
import {
  obligationRiskMeta,
  obligationStageMeta,
  obligationStatusMeta,
  obligationTriggerMeta,
} from "@/constant/obligation";
import { ownerLabel, toCsv, type ObligationRow } from "@/service/obligation-view";
import {
  blockReason,
  checkCompletion,
  completeConfirm,
  type CompletionCheck,
} from "@/service/obligation-completion";
import { withProject } from "@/lib/project-link";
import { completeObligationAction } from "./actions";

const fmt = (iso: string | null) => (iso ? iso.slice(0, 10) : "—");

export function ObligationTable({
  rows,
  total,
  canEdit,
  showProject,
  gates,
  projectId,
}: {
  rows: ObligationRow[];
  total: number;
  canEdit: boolean;
  showProject: boolean;
  /** 各事項的完成條件（以事項 id 為鍵）。 */
  gates: Record<string, CompletionCheck>;
  /** 目前鎖定的專案，供細節頁返回時保留篩選。 */
  projectId: string | null;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const { notify } = useNotification();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  /** 尚未載入完成條件時視為「沒有分項」，與伺服器的預設一致。 */
  const gateOf = (id: string): CompletionCheck => gates[id] ?? checkCompletion([]);

  /**
   * 完成某一事項。
   *
   * 一律先確認 —— 完成會寫入完成日並進到進度上捲與預警判定，
   * 誤按一下沒有「復原」可走。條件不足時按鈕已停用，
   * 但仍在伺服器端把關並把原因顯示出來。
   */
  async function complete(row: ObligationRow) {
    const check = gateOf(row.id);
    const copy = completeConfirm(row.title, check);
    if (!(await confirm({ ...copy, confirmLabel: "確認完成" }))) return;

    setBusyId(row.id);
    startTransition(async () => {
      const res = await completeObligationAction(row.id);
      setBusyId(null);
      if (!res.ok) {
        notify({ title: "無法完成", description: res.error, variant: "error" });
        return;
      }
      notify({ title: `已完成「${row.title}」`, variant: "success" });
      router.refresh();
    });
  }

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

  /*
    欄寬總和必須與下方的 min-w 相符。
    先前為了容納完成按鈕下方的「工程分項 0/1 已完成」而把操作欄加寬，
    總和超過 min-w，於是表格在費思展開後溢出，左側欄位被推出可視範圍。
    現在那個指標移到「狀態」欄成為小標記，操作欄回到原寬。
  */
  const cols = showProject
    ? "grid-cols-[24px_132px_104px_minmax(220px,1fr)_140px_136px_104px_112px_132px_minmax(140px,0.8fr)_92px]"
    : "grid-cols-[24px_132px_104px_minmax(220px,1fr)_136px_104px_112px_132px_minmax(140px,0.8fr)_92px]";

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
            {/*
              min-w 必須不小於欄寬總和（含專案欄時 1336px）。
              先前寫 1180px 比總和還小，容器一變窄（例如費思展開成右側分欄）
              表格就整體溢出，左側的風險、編號、階段被推出可視範圍。
            */}
            <div className="min-w-[1340px] space-y-1">
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
                const gate = gateOf(r.id);
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
                    <span className="min-w-0 truncate">
                      <Link
                        href={withProject(`/obligations/${r.id}`, projectId)}
                        className="font-medium underline-offset-4 hover:text-primary hover:underline"
                        title={r.title}
                      >
                        {r.title}
                      </Link>
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
                    <span className="flex min-w-0 items-center gap-1.5">
                      <Badge variant={obligationStatusMeta[r.status].variant}>
                        {obligationStatusMeta[r.status].label}
                      </Badge>
                      {/*
                        歸屬分項的完成度緊貼狀態顯示 —— 這是「能不能完成」的
                        前提條件，屬於狀態的一部分，而非一個操作。
                      */}
                      {gate.total > 0 && r.status !== "DONE" ? (
                        <span
                          className={cn(
                            "shrink-0 whitespace-nowrap rounded px-1 text-[10px] tabular-nums",
                            gate.ok
                              ? "text-muted-foreground"
                              : "bg-warning-soft text-warning",
                          )}
                          title={blockReason(gate) ?? "歸屬工程分項均已完成"}
                        >
                          {gate.done}/{gate.total}
                        </span>
                      ) : null}
                    </span>
                    <span
                      className="truncate text-xs text-muted-foreground"
                      title={r.contractBasis ?? ""}
                    >
                      {r.contractBasis ?? "—"}
                    </span>
                    <span className="flex items-center justify-end gap-1">
                      {canEdit && r.status !== "DONE" ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={(pending && busyId === r.id) || !gate.ok}
                          onClick={() => complete(r)}
                          title={blockReason(gate) ?? undefined}
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
                      <Link
                        href={withProject(`/obligations/${r.id}`, projectId)}
                        aria-label={`檢視「${r.title}」細節`}
                        title="檢視細節"
                        className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                      >
                        <ChevronRight className="size-4" />
                      </Link>
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
