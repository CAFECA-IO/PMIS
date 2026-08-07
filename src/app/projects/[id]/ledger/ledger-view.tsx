"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Download, Loader2, Pencil, Save, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useConfirm } from "@/components/ui/confirm-provider";
import { useNotification } from "@/components/ui/notification";
import { cn } from "@/lib/utils";
import {
  WORK_UNITS,
  valuationStatusMeta,
  wbsCategoryOptions,
} from "@/constant/ledger";
import type { ProjectLedger } from "@/service/ledger.service";
import type { LedgerRowWithPending } from "@/service/ledger.service";
import { updateLedgerQtyAction } from "./actions";

/**
 * 估驗台帳的三種看法。
 *
 * 價目表逐列對帳、WBS 彙整看各工種的進度佔比、差異異常只留下數字互相矛盾的列。
 * 三者讀的是同一份資料，切換只換呈現方式 —— 對帳時要能立刻在同一批數字上
 * 換個角度看，而不是跳到別的頁面重新查一次。
 */

type Tab = "items" | "wbs" | "anomaly";

const TABS: { id: Tab; label: string }[] = [
  { id: "items", label: "價目表" },
  { id: "wbs", label: "WBS彙整" },
  { id: "anomaly", label: "差異異常" },
];

/** 金額：千分位、無小數。台帳上的金額都是整數元。 */
const money = (v: number | null) =>
  v === null ? "—" : `$${Math.round(v).toLocaleString("zh-TW")}`;

/** 數量：保留必要的小數（0.08 式不可被四捨成 0）。 */
const qty = (v: number | null) =>
  v === null ? "—" : v.toLocaleString("zh-TW", { maximumFractionDigits: 3 });

const rate = (v: number | null) => (v === null ? "—" : `${v.toFixed(1)}%`);

export function LedgerView({
  ledger,
  canEdit,
}: {
  ledger: ProjectLedger;
  canEdit: boolean;
}) {
  const [tab, setTab] = useState<Tab>("items");

  /** 匯出目前的價目表；在瀏覽器端組 CSV，不需往返伺服器。 */
  function exportCsv() {
    const header = [
      "工項代碼",
      "WBS",
      "類別",
      "工項名稱",
      "單位",
      "契約數量",
      "單價",
      "契約複價",
      "累計完成",
      "查驗合格",
      "累計估驗",
      "完成率",
      "估驗狀態",
    ];
    const lines = ledger.rows.map((r) =>
      [
        r.code ?? "",
        r.wbsCode ?? "",
        r.categoryLabel,
        r.name,
        r.unit ?? "",
        r.contractQty ?? "",
        r.unitPrice ?? "",
        r.contractAmount ?? "",
        r.completedQty ?? "",
        r.inspectedQty ?? "",
        r.valuatedQty ?? "",
        r.completionRate ?? "",
        valuationStatusMeta[r.status].label,
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(","),
    );
    // BOM 讓 Excel 正確辨識 UTF-8 中文
    const blob = new Blob([`﻿${[header.join(","), ...lines].join("\n")}`], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `估驗台帳_${ledger.projectCode}_${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <Figure label="契約總價" value={money(ledger.totals.contractAmount)} />
              <Figure label="完成金額" value={money(ledger.totals.completedAmount)} />
              <Figure label="累計估驗" value={money(ledger.totals.valuatedAmount)} />
              <Figure
                label="完成率（金額加權）"
                value={rate(ledger.totals.completionRate)}
              />
            </div>
            <div className="flex items-center gap-2">
              {/* 分頁鈕沿用台帳畫面的膠囊樣式 */}
              <div className="flex items-center gap-1.5">
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTab(t.id)}
                    className={cn(
                      "rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors",
                      tab === t.id
                        ? "border-primary bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:border-primary hover:text-primary",
                    )}
                  >
                    {t.label}
                    {t.id === "anomaly" && ledger.anomalies.length > 0 ? (
                      <span className="ml-1.5 tabular-nums">
                        {ledger.anomalies.length}
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={exportCsv}
                disabled={ledger.rows.length === 0}
              >
                <Download className="size-4" />
                匯出 CSV
              </Button>
            </div>
          </div>

          {ledger.unpriced > 0 ? (
            <p className="flex items-start gap-2 rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" />
              <span>
                有 {ledger.unpriced} 項尚未填入契約數量，未計入金額合計。
                台帳的數量與單價須依契約詳細價目表逐項補齊，才能與承商對帳。
              </span>
            </p>
          ) : null}
        </CardContent>
      </Card>

      {tab === "items" ? (
        <ItemTable ledger={ledger} canEdit={canEdit} rows={ledger.rows} />
      ) : tab === "wbs" ? (
        <WbsTable ledger={ledger} />
      ) : (
        <AnomalyTable ledger={ledger} canEdit={canEdit} />
      )}
    </div>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex flex-col">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </span>
  );
}

const COLS =
  "grid-cols-[104px_120px_minmax(200px,1fr)_56px_96px_104px_128px_96px_96px_96px_80px_96px_72px]";

function ItemTable({
  ledger,
  canEdit,
  rows,
}: {
  ledger: ProjectLedger;
  canEdit: boolean;
  rows: LedgerRowWithPending[];
}) {
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <p className="text-sm text-muted-foreground">
          共 <span className="font-medium text-foreground">{rows.length}</span> 項工項
        </p>

        {rows.length === 0 ? (
          <p className="rounded-md border border-dashed px-3 py-10 text-center text-sm text-muted-foreground">
            此專案尚無工程分項。可於專案建置解讀契約，或在專案頁新增工程分項。
          </p>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[1420px] space-y-1">
              <div
                className={cn(
                  "grid gap-2 whitespace-nowrap border-b px-2 pb-2 text-[11px] font-medium text-muted-foreground",
                  COLS,
                )}
              >
                <span>工項代碼</span>
                <span>WBS / 類別</span>
                <span>工項名稱</span>
                <span>單位</span>
                <span className="text-right">契約數量</span>
                <span className="text-right">單價</span>
                <span className="text-right">契約複價</span>
                <span
                  className="text-right"
                  title="期初 + 已提送／已核備日報之本日完成量（決策 A：日報為單一真實來源）"
                >
                  累計完成
                </span>
                <span className="text-right">查驗合格</span>
                <span className="text-right">累計估驗</span>
                <span className="text-right">完成率</span>
                <span>估驗狀態</span>
                <span className="text-right">操作</span>
              </div>

              {rows.map((r) =>
                editing === r.id ? (
                  <EditRow
                    key={r.id}
                    row={r}
                    projectId={ledger.projectId}
                    onDone={() => setEditing(null)}
                  />
                ) : (
                  <ViewRow
                    key={r.id}
                    row={r}
                    canEdit={canEdit}
                    onEdit={() => setEditing(r.id)}
                  />
                ),
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ViewRow({
  row,
  canEdit,
  onEdit,
}: {
  row: LedgerRowWithPending;
  canEdit: boolean;
  onEdit: () => void;
}) {
  const meta = valuationStatusMeta[row.status];
  return (
    <div
      className={cn(
        "grid items-center gap-2 rounded-md px-2 py-2 text-sm transition-colors hover:bg-muted/50",
        COLS,
        row.anomalies.length > 0 && "bg-destructive/5",
      )}
    >
      <span className="truncate font-mono text-xs">{row.code ?? "—"}</span>
      <span className="min-w-0">
        {row.wbsCode ? (
          <Badge variant="outline">{row.wbsCode}</Badge>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
        <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
          {row.categoryLabel}
        </span>
      </span>
      <span className="truncate font-medium" title={row.name}>
        {row.name}
      </span>
      <span className="text-xs text-muted-foreground">{row.unit ?? "—"}</span>
      <span className="text-right tabular-nums">{qty(row.contractQty)}</span>
      <span className="text-right tabular-nums">{money(row.unitPrice)}</span>
      <span className="text-right tabular-nums">{money(row.contractAmount)}</span>
      <span className="text-right tabular-nums">
        {qty(row.completedQty)}
        {/*
          期初與有效累計不同時標出期初，讓「這個數字是推導來的」在畫面上看得見。
          相同（尚無日報計入）時不顯示，避免每一列都掛一行雜訊。
        */}
        {row.openingQty !== null && row.openingQty !== row.completedQty ? (
          <span
            className="block text-[11px] font-normal text-muted-foreground"
            title="有效累計 = 期初 + 已提送／已核備日報之本日完成量；期初為台帳上可編輯的基準值。"
          >
            期初 {qty(row.openingQty)}
          </span>
        ) : null}
        {/* 草稿日報已填但尚未計入的量：不顯示會被誤認為資料遺失（決策 G） */}
        {row.pendingQty != null && row.pendingQty !== 0 ? (
          <span
            className="block text-[11px] font-normal text-muted-foreground"
            title="草稿日報已填報但尚未計入累計；日報提送後才會併入。"
          >
            草稿 +{qty(row.pendingQty)}
          </span>
        ) : null}
      </span>
      <span className="text-right tabular-nums">{qty(row.inspectedQty)}</span>
      <span className="text-right tabular-nums">{qty(row.valuatedQty)}</span>
      <span className="text-right tabular-nums">{rate(row.completionRate)}</span>
      <span>
        <Badge variant={meta.variant} title={meta.hint}>
          {meta.label}
        </Badge>
      </span>
      <span className="text-right">
        {canEdit ? (
          <Button type="button" variant="ghost" size="sm" onClick={onEdit}>
            <Pencil className="size-3.5" />
          </Button>
        ) : null}
      </span>
    </div>
  );
}

/**
 * 就地編輯一列。
 *
 * 數量由監造人員按實際計量逐期更新，故編輯入口就在該列上；
 * 若要跳到別的表單填寫，對帳時每改一個數字都得離開現場。
 */
function EditRow({
  row,
  projectId,
  onDone,
}: {
  row: LedgerRowWithPending;
  projectId: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const { notify } = useNotification();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState({
    wbsCode: row.wbsCode ?? "",
    wbsCategory: row.wbsCategory ?? "",
    unit: row.unit ?? "",
    contractQty: row.contractQty === null ? "" : String(row.contractQty),
    unitPrice: row.unitPrice === null ? "" : String(row.unitPrice),
    /*
      這裡刻意取 openingQty 而非 completedQty。
      row.completedQty 已是有效累計（期初 + 日報加總）的推導值；
      拿它當初值再存回去，期初就會把日報加總吃進來，下次讀取又再加一輪，
      累計每存一次檔翻一倍（決策 A：本欄語意為「期初」）。
    */
    completedQty: row.openingQty === null ? "" : String(row.openingQty),
    inspectedQty: row.inspectedQty === null ? "" : String(row.inspectedQty),
    valuatedQty: row.valuatedQty === null ? "" : String(row.valuatedQty),
  });

  const set = (key: keyof typeof form, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  async function save() {
    /*
      改動累計估驗量會影響請款金額，因此一律確認。
      這不是「怕誤按」，而是這個數字一旦送出就是對外的請領依據。
    */
    const changesValuation = form.valuatedQty !== (row.valuatedQty === null ? "" : String(row.valuatedQty));
    if (changesValuation) {
      const ok = await confirm({
        title: `更新「${row.name}」的估驗量？`,
        description:
          "累計估驗量是對外請領的依據，確認後將一併更新完成率與專案進度。",
        confirmLabel: "確認更新",
      });
      if (!ok) return;
    }

    startTransition(async () => {
      const res = await updateLedgerQtyAction(row.id, projectId, form);
      if (!res.ok) {
        notify({ title: "無法更新", description: res.error, variant: "error" });
        return;
      }
      notify({ title: `已更新「${row.name}」`, variant: "success" });
      onDone();
      router.refresh();
    });
  }

  return (
    <div className={cn("grid items-start gap-2 rounded-md border border-primary/40 bg-primary/5 px-2 py-2", COLS)}>
      <span className="truncate pt-2 font-mono text-xs">{row.code ?? "—"}</span>
      <span className="space-y-1">
        <Input
          value={form.wbsCode}
          onChange={(e) => set("wbsCode", e.target.value)}
          placeholder="WBS-1.1"
          className="h-8 text-xs"
        />
        <Select
          value={form.wbsCategory}
          onChange={(e) => set("wbsCategory", e.target.value)}
          className="h-8 text-xs"
        >
          <option value="">未分類</option>
          {wbsCategoryOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </span>
      <span className="truncate pt-2 font-medium" title={row.name}>
        {row.name}
      </span>
      <Select
        value={form.unit}
        onChange={(e) => set("unit", e.target.value)}
        className="h-8 px-1 text-xs"
      >
        <option value="">—</option>
        {WORK_UNITS.map((u) => (
          <option key={u} value={u}>
            {u}
          </option>
        ))}
      </Select>
      <NumberCell value={form.contractQty} onChange={(v) => set("contractQty", v)} />
      <NumberCell value={form.unitPrice} onChange={(v) => set("unitPrice", v)} />
      <span className="pt-2 text-right text-xs text-muted-foreground">自動計算</span>
      {/*
        可編輯的是「期初」，不是畫面上那個累計 ——
        欄位下方同時顯示目前有效累計，讓填的人知道自己動的不是同一個數字。
      */}
      <span className="space-y-0.5">
        <NumberCell value={form.completedQty} onChange={(v) => set("completedQty", v)} />
        <span
          className="block text-right text-[10px] leading-tight text-muted-foreground"
          title="期初為此欄；有效累計 = 期初 + 已提送／已核備日報之本日完成量，由系統推導、不可直接編輯。"
        >
          期初｜有效累計 {qty(row.completedQty)}
        </span>
      </span>
      <NumberCell value={form.inspectedQty} onChange={(v) => set("inspectedQty", v)} />
      <NumberCell value={form.valuatedQty} onChange={(v) => set("valuatedQty", v)} />
      <span className="pt-2 text-right text-xs text-muted-foreground">自動</span>
      <span className="pt-2 text-xs text-muted-foreground">自動</span>
      <span className="flex items-start justify-end gap-1">
        <Button type="button" size="sm" onClick={save} disabled={pending}>
          {pending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Save className="size-3.5" />
          )}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          <X className="size-3.5" />
        </Button>
      </span>
    </div>
  );
}

function NumberCell({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Input
      type="number"
      step="any"
      min={0}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-8 text-right text-xs tabular-nums"
    />
  );
}

const WBS_COLS = "grid-cols-[minmax(140px,1fr)_72px_148px_148px_148px_96px_96px]";

function WbsTable({ ledger }: { ledger: ProjectLedger }) {
  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <p className="text-sm text-muted-foreground">
          依 WBS 類別彙整，完成率與估驗率均以金額加權
        </p>
        {ledger.groups.length === 0 ? (
          <p className="rounded-md border border-dashed px-3 py-10 text-center text-sm text-muted-foreground">
            尚無可彙整的工項。
          </p>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[900px] space-y-1">
              <div
                className={cn(
                  "grid gap-2 border-b px-2 pb-2 text-[11px] font-medium text-muted-foreground",
                  WBS_COLS,
                )}
              >
                <span>WBS 類別</span>
                <span className="text-right">項數</span>
                <span className="text-right">契約複價</span>
                <span className="text-right">完成金額</span>
                <span className="text-right">累計估驗</span>
                <span className="text-right">完成率</span>
                <span className="text-right">估驗率</span>
              </div>
              {ledger.groups.map((g) => (
                <div
                  key={g.category}
                  className={cn("grid items-center gap-2 rounded-md px-2 py-2 text-sm", WBS_COLS)}
                >
                  <span className="truncate font-medium">{g.label}</span>
                  <span className="text-right tabular-nums">{g.rows}</span>
                  <span className="text-right tabular-nums">{money(g.contractAmount)}</span>
                  <span className="text-right tabular-nums">{money(g.completedAmount)}</span>
                  <span className="text-right tabular-nums">{money(g.valuatedAmount)}</span>
                  <span className="text-right tabular-nums">{rate(g.completionRate)}</span>
                  <span className="text-right tabular-nums">{rate(g.valuationRate)}</span>
                </div>
              ))}
              <div
                className={cn(
                  "grid items-center gap-2 rounded-md border-t bg-muted/40 px-2 py-2 text-sm font-medium",
                  WBS_COLS,
                )}
              >
                <span>合計</span>
                <span className="text-right tabular-nums">{ledger.totals.rows}</span>
                <span className="text-right tabular-nums">
                  {money(ledger.totals.contractAmount)}
                </span>
                <span className="text-right tabular-nums">
                  {money(ledger.totals.completedAmount)}
                </span>
                <span className="text-right tabular-nums">
                  {money(ledger.totals.valuatedAmount)}
                </span>
                <span className="text-right tabular-nums">
                  {rate(ledger.totals.completionRate)}
                </span>
                <span className="text-right tabular-nums">
                  {rate(ledger.totals.valuationRate)}
                </span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * 差異異常。
 *
 * 只列出數字互相矛盾的列，並寫出矛盾在哪 ——
 * 這一頁的用途是對帳前先把「估驗了沒驗過的量」這類問題找出來，
 * 而不是讓使用者自己在上百列裡兩兩相比。
 */
function AnomalyTable({
  ledger,
  canEdit,
}: {
  ledger: ProjectLedger;
  canEdit: boolean;
}) {
  if (ledger.anomalies.length === 0) {
    return (
      <Card>
        <CardContent className="p-10 text-center text-sm text-muted-foreground">
          目前沒有數量互相矛盾的工項。
          <span className="mt-1 block text-xs">
            檢核項目：查驗合格量不得大於累計完成量、累計估驗量不得大於查驗合格量、
            累計完成量不得超出契約數量。
          </span>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <p className="text-sm text-muted-foreground">
          共 <span className="font-medium text-destructive">{ledger.anomalies.length}</span>{" "}
          項數量互相矛盾，請於對帳前查明
        </p>
        <ul className="space-y-2">
          {ledger.anomalies.map((r) => (
            <li key={r.id} className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2.5">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-mono text-xs text-muted-foreground">
                  {r.code ?? "—"}
                </span>
                <span className="font-medium">{r.name}</span>
                <Badge variant="outline">{r.categoryLabel}</Badge>
                <span className="text-xs text-muted-foreground">
                  契約 {qty(r.contractQty)} {r.unit ?? ""}｜完成 {qty(r.completedQty)}｜
                  查驗 {qty(r.inspectedQty)}｜估驗 {qty(r.valuatedQty)}
                </span>
              </div>
              <ul className="mt-1.5 space-y-0.5">
                {r.anomalies.map((a) => (
                  <li key={a} className="flex items-start gap-1.5 text-xs text-destructive">
                    <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                    {a}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
        {canEdit ? (
          <p className="text-xs text-muted-foreground">
            更正方式：回「價目表」找到該工項，以列上的編輯鈕修正數量。
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
