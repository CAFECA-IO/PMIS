"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { loadQtyFormAction } from "@/app/logs/actions";
import { countsTowardQty } from "@/constant/pmis";
import type { ReportStatus } from "@/generated/prisma/enums";
import type { QtyFormRow } from "@/service/supervisionReport.service";

/**
 * 日報數量表（E1）。
 *
 * 設計取捨（見 docs/監造日報填報擴充規劃.md〈數量錄入的填寫設計〉）：
 *  - **預帶清單**：開啟即列出全部工程分項，只需填「本日完成」。逐格從頭
 *    輸入會讓每日填報變成填空地獄，實務上導致隨便填或不填。
 *  - **預設只展開有填的列**：專案工項可能數十列，全展開需長距離捲動。
 *  - **單位唯讀**：取自台帳，避免同一工項在不同日報用不同單位而無法加總。
 *  - **即時顯示填報後累計**：當下就能看出數字是否合理，而非等月報彙整才發現。
 *  - **超出契約數量只提示不阻擋**：契約變更或數量增減時本來就會超出，
 *    阻擋只會逼使用者亂填。
 *  - **備註必須顯示**：備註常是免計工期或數量異常的唯一書面理由。
 *    表單若讀不到它，整張表送出時會把它寫成 null ——
 *    使用者只是開啟日報存個檔，就刪掉了一句自己從沒看過的話。
 *
 * 以隱藏欄位送出 JSON 而非逐格具名欄位：數量表是動態列數（含契約外項目），
 * 具名索引欄位在新增／刪除列後容易錯位，且伺服器端仍須重新驗證，
 * 一次送出整張表較不易出錯。
 */

type ExtraRow = {
  /** 前端用的暫時識別，不送出。 */
  key: string;
  itemName: string;
  unit: string;
  dailyQty: string;
  note: string;
};

/** 送往伺服器的一列；伺服器會重新驗證並以台帳覆寫名稱與單位。 */
type QtyPayloadRow = {
  workItemId: string | null;
  itemName?: string;
  unit?: string | null;
  dailyQty: number;
  note?: string | null;
};

const fmt = (v: number | null): string =>
  v === null ? "—" : v.toLocaleString("zh-TW", { maximumFractionDigits: 3 });

/** 解析輸入格；空白為未填（null），非數字或負數為無效（undefined）。 */
function parseQty(raw: string): number | null | undefined {
  const s = raw.replace(/,/g, "").trim();
  if (s === "") return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return n;
}

export function ReportQtyTable({
  projectId,
  reportDate,
  status,
}: {
  projectId: string;
  /** 報表日期；變更時重新載入該日已填數量。 */
  reportDate: string;
  /** 目前選擇的報表狀態；草稿的數量不會計入累計（決策 G）。 */
  status: string;
}) {
  const [rows, setRows] = useState<QtyFormRow[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [extras, setExtras] = useState<ExtraRow[]>([]);
  const [showAll, setShowAll] = useState(false);
  /** 已成功載入的那一組（專案＋日期）。 */
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  /** 載入失敗的那一組；與 loadedKey 分開才能區分「還在載」與「載不到」。 */
  const [failedKey, setFailedKey] = useState<string | null>(null);

  const key = `${projectId}|${reportDate}`;
  /*
    狀態由「哪一個鍵已完成」推導，而非另存 loading 旗標：
    effect 內不需同步 setState（會造成連鎖渲染），
    切換日期時也自然回到載入中，不必記得重設。
  */
  const ready = loadedKey === key;
  const failed = failedKey === key;
  const loading = !ready && !failed;

  useEffect(() => {
    let stale = false;
    loadQtyFormAction(projectId, reportDate || undefined)
      .then((data) => {
        if (stale) return;
        /*
          data 為 null 代表取數失敗或無權限，**不可**視為載入完成 ——
          rows 為空會讓 payload 變成 []，而伺服器端把「有 items 欄位但為空」
          解讀為使用者清空數量表，等於靜默刪光既有明細。
        */
        if (!data) {
          setFailedKey(key);
          return;
        }
        setRows(data.rows);
        setValues(
          Object.fromEntries(
            data.rows
              .filter((r) => r.dailyQty !== null)
              .map((r) => [r.workItemId, String(r.dailyQty)]),
          ),
        );
        setNotes(
          Object.fromEntries(
            data.rows
              .filter((r) => r.note !== null)
              .map((r) => [r.workItemId, r.note as string]),
          ),
        );
        setExtras(
          data.extras.map((e, i) => ({
            key: `existing-${i}`,
            itemName: e.itemName,
            unit: e.unit ?? "",
            dailyQty: String(e.dailyQty),
            note: e.note ?? "",
          })),
        );
        setLoadedKey(key);
      })
      .catch(() => {
        // 網路瞬斷等例外同樣不能當作載入完成，理由同上
        if (!stale) setFailedKey(key);
      });
    return () => {
      stale = true;
    };
  }, [projectId, reportDate, key]);

  /** 送出用的 JSON：略過未填與無效值。 */
  const payload = useMemo<QtyPayloadRow[]>(() => {
    const out: QtyPayloadRow[] = [];
    for (const r of rows) {
      const qty = parseQty(values[r.workItemId] ?? "");
      if (qty === null || qty === undefined) continue;
      out.push({
        workItemId: r.workItemId,
        dailyQty: qty,
        note: (notes[r.workItemId] ?? "").trim() || null,
      });
    }
    for (const e of extras) {
      const qty = parseQty(e.dailyQty);
      if (qty === null || qty === undefined) continue;
      if (!e.itemName.trim()) continue;
      out.push({
        workItemId: null,
        itemName: e.itemName.trim(),
        unit: e.unit.trim() || null,
        dailyQty: qty,
        note: e.note.trim() || null,
      });
    }
    return out;
  }, [rows, values, notes, extras]);

  const filledCount = payload.length;

  // 預設只顯示已填的列；未填者收合於「顯示全部」之後
  const visibleRows = showAll
    ? rows
    : rows.filter(
        (r) =>
          (values[r.workItemId] ?? "").trim() !== "" ||
          (notes[r.workItemId] ?? "").trim() !== "",
      );

  return (
    <div className="space-y-2 text-xs sm:col-span-2">
      {/*
        僅在載入完成後才送出 items（伺服器端仍會重新驗證）。

        未載入時 payload 必為空陣列，而伺服器端的約定是
        「有 items 欄位＝這張表單管數量表」，空陣列代表使用者清空 →
        會 replaceItems([]) 刪光既有明細。不送這個欄位則視為
        「本表單沒有數量表區塊」，既有明細原封不動 —— 這才是載入中／
        載入失敗時該有的行為。
      */}
      {ready && (
        <input type="hidden" name="items" value={JSON.stringify(payload)} />
      )}

      <div className="flex items-center justify-between">
        <span className="text-muted-foreground">
          數量表（本日完成）
          {filledCount > 0 && `　已填 ${filledCount} 項`}
        </span>
        {rows.length > 0 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowAll((v) => !v)}
          >
            {showAll ? "只顯示已填" : `顯示全部 ${rows.length} 項`}
          </Button>
        )}
      </div>

      {/*
        在填報現場就講清楚草稿不計入，而非等使用者去台帳發現數字沒動。
        判定沿用 countsTowardQty，不在此另寫一份狀態清單。
      */}
      {filledCount > 0 && !countsTowardQty(status as ReportStatus) && (
        <p className="rounded border border-warning/40 bg-warning/10 px-2 py-1 text-[11px] text-muted-foreground">
          目前狀態為
          <span className="font-medium">草稿</span>
          ，填報的數量<span className="font-medium">尚不會計入</span>
          累計完成量與月報；改為「已提送」後才會併入。數量已保存，不會遺失。
        </p>
      )}

      {loading && <p className="text-muted-foreground">載入工程分項…</p>}

      {failed && (
        <p className="rounded border border-destructive/40 bg-destructive/10 px-2 py-1 text-[11px] text-destructive">
          數量表載入失敗，請重新整理頁面後再填。為避免誤刪，
          <span className="font-medium">本次儲存不會變更已存在的數量表</span>。
        </p>
      )}

      {ready && rows.length === 0 && (
        <p className="text-muted-foreground">
          本專案尚無工程分項，可於下方新增契約外項目，或先於估驗台帳建立分項。
        </p>
      )}

      {visibleRows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="text-muted-foreground">
                <th className="py-1 text-left font-normal">施工項目</th>
                <th className="py-1 text-right font-normal">契約數量</th>
                <th className="py-1 text-right font-normal">目前累計</th>
                <th className="py-1 text-left font-normal">本日完成</th>
                <th className="py-1 text-left font-normal">備註</th>
                <th className="py-1 text-right font-normal">填報後累計</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((r) => {
                const raw = values[r.workItemId] ?? "";
                const qty = parseQty(raw);
                const invalid = qty === undefined;
                const after =
                  qty === null || qty === undefined
                    ? r.cumulativeQty
                    : (r.cumulativeQty ?? 0) + qty;
                // 超出契約數量：提示而非阻擋（契約變更／數量增減時本來就會超出）
                const over =
                  after !== null &&
                  r.contractQty !== null &&
                  after > r.contractQty;
                return (
                  <tr key={r.workItemId} className="border-t align-middle">
                    <td className="py-1 pr-2">{r.name}</td>
                    <td className="py-1 pr-2 text-right tabular-nums text-muted-foreground">
                      {fmt(r.contractQty)}
                      {r.unit ? ` ${r.unit}` : ""}
                    </td>
                    <td className="py-1 pr-2 text-right tabular-nums text-muted-foreground">
                      {fmt(r.cumulativeQty)}
                    </td>
                    <td className="py-1 pr-2">
                      <div className="flex items-center gap-1">
                        <Input
                          value={raw}
                          inputMode="decimal"
                          aria-label={`${r.name} 本日完成數量`}
                          aria-invalid={invalid || undefined}
                          className="h-7 w-24"
                          onChange={(e) =>
                            setValues((v) => ({
                              ...v,
                              [r.workItemId]: e.target.value,
                            }))
                          }
                        />
                        {/* 單位唯讀：取自台帳，避免同工項跨日報單位不一致 */}
                        <span className="text-muted-foreground">
                          {r.unit ?? ""}
                        </span>
                      </div>
                    </td>
                    <td className="py-1 pr-2">
                      <Input
                        value={notes[r.workItemId] ?? ""}
                        aria-label={`${r.name} 備註`}
                        placeholder="數量異常或免計工期理由"
                        className="h-7 w-40"
                        onChange={(e) =>
                          setNotes((v) => ({
                            ...v,
                            [r.workItemId]: e.target.value,
                          }))
                        }
                      />
                      {/*
                        備註掛在數量列上，沒有數量就沒有列可掛。
                        靜默丟棄使用者打的字比不讓他打更糟，故明說。
                      */}
                      {qty === null && (notes[r.workItemId] ?? "").trim() !== "" && (
                        <span className="mt-0.5 block text-[10px] text-warning">
                          未填本日完成，此備註不會保存
                        </span>
                      )}
                    </td>
                    <td className="py-1 text-right tabular-nums">
                      {invalid ? (
                        <span className="text-destructive">數字無效</span>
                      ) : (
                        <>
                          {fmt(after)}
                          {over && (
                            <span className="ml-1 text-warning">超出契約</span>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!showAll && rows.length > visibleRows.length && (
        <p className="text-muted-foreground">
          其餘 {rows.length - visibleRows.length} 項未填報，已收合。
        </p>
      )}

      {/*
        契約外臨時項目：不進台帳，僅存於本日報。
        載入未完成時一併隱藏 —— 此時 items 不會送出，讓人填了卻存不進去
        比暫時看不到這個區塊更糟。
      */}
      <div className={ready ? "space-y-1" : "hidden"}>
        {extras.map((e, i) => (
          <div key={e.key} className="flex items-center gap-1">
            <Input
              value={e.itemName}
              placeholder="契約外項目名稱"
              aria-label="契約外項目名稱"
              className="h-7 flex-1"
              onChange={(ev) =>
                setExtras((list) =>
                  list.map((x, j) =>
                    j === i ? { ...x, itemName: ev.target.value } : x,
                  ),
                )
              }
            />
            <Input
              value={e.unit}
              placeholder="單位"
              aria-label="單位"
              className="h-7 w-16"
              onChange={(ev) =>
                setExtras((list) =>
                  list.map((x, j) =>
                    j === i ? { ...x, unit: ev.target.value } : x,
                  ),
                )
              }
            />
            <Input
              value={e.dailyQty}
              placeholder="數量"
              inputMode="decimal"
              aria-label="本日完成數量"
              className="h-7 w-20"
              onChange={(ev) =>
                setExtras((list) =>
                  list.map((x, j) =>
                    j === i ? { ...x, dailyQty: ev.target.value } : x,
                  ),
                )
              }
            />
            <Input
              value={e.note}
              placeholder="備註"
              aria-label="備註"
              className="h-7 w-40"
              onChange={(ev) =>
                setExtras((list) =>
                  list.map((x, j) =>
                    j === i ? { ...x, note: ev.target.value } : x,
                  ),
                )
              }
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label="移除此列"
              onClick={() =>
                setExtras((list) => list.filter((_, j) => j !== i))
              }
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            setExtras((list) => [
              ...list,
              {
                key: `new-${list.length}-${rows.length}`,
                itemName: "",
                unit: "",
                dailyQty: "",
                note: "",
              },
            ])
          }
        >
          <Plus className="size-4" />
          新增契約外項目
        </Button>
        <p className="text-[11px] text-muted-foreground">
          契約外項目僅記錄於本日報，不會進入估驗台帳；如需納入契約管制，請於台帳建立工程分項。
        </p>
      </div>
    </div>
  );
}
