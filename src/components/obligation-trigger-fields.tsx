"use client";

import { useMemo, useState } from "react";
import { CalendarClock, Info, Link2, ListChecks } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { obligationTriggerOptions, type ObligationTrigger } from "@/constant/obligation";
import {
  RELATIVE_ANCHORS,
  anchorMeta,
  conditionKindMeta,
  conditionKindOptions,
} from "@/constant/trigger";
import {
  computeDueDate,
  describeTrigger,
  patternsFor,
  type TriggerContext,
} from "@/service/obligation-trigger";

/**
 * 觸發方式與其對應的輸入。
 *
 * 四種觸發方式需要的資訊完全不同，先前四種都只給一個日期欄位，
 * 於是「開工後 30 日」只能被硬填成一個日期，依據留在承辦人腦裡，
 * 工期一改就沒人知道哪些期限該跟著動。
 *
 * 這個元件同時被新增對話框與細節頁使用 —— 兩處各寫一份必然漂移，
 * 而漂移的後果是同一份契約在兩個入口被記成不同的依據。
 */

export type TriggerDefaults = {
  triggerType: ObligationTrigger;
  dueDate: string | null;
  relativeAnchor: string | null;
  offsetDays: number | null;
  predecessorId: string | null;
  conditionKind: string | null;
  conditionDetail: string | null;
  dueDateOverridden: boolean;
};

export type PredecessorOption = { id: string; code: string; title: string };

export function ObligationTriggerFields({
  defaults,
  /** 可作為前置事項的清單（已排除自己與會成環者）。 */
  predecessors,
  /** 推算期限所需的專案日期與前置事項期限。 */
  context,
  disabled,
}: {
  defaults: TriggerDefaults;
  predecessors: PredecessorOption[];
  context: TriggerContext;
  disabled?: boolean;
}) {
  const [type, setType] = useState<ObligationTrigger>(defaults.triggerType);
  const [dueDate, setDueDate] = useState(defaults.dueDate ?? "");
  const [anchor, setAnchor] = useState(defaults.relativeAnchor ?? "PROJECT_START");
  const [offset, setOffset] = useState(
    defaults.offsetDays === null ? "" : String(defaults.offsetDays),
  );
  const [predecessorId, setPredecessorId] = useState(defaults.predecessorId ?? "");
  const [conditionKind, setConditionKind] = useState(
    defaults.conditionKind ?? "AGENCY_ACTION",
  );
  const [conditionDetail, setConditionDetail] = useState(
    defaults.conditionDetail ?? "",
  );
  const [overridden, setOverridden] = useState(defaults.dueDateOverridden);

  const titleOf = (id: string) =>
    predecessors.find((p) => p.id === id)?.title ?? null;

  /*
    即時預覽推算結果。
    「開工後 30 日」對使用者而言是抽象的，把算出來的日期當場顯示出來，
    才能在存檔前就發現基準點選錯或天數正負號填反。
  */
  const preview = useMemo(
    () =>
      computeDueDate(
        {
          triggerType: type,
          dueDate: dueDate || null,
          relativeAnchor: anchor,
          offsetDays: offset === "" ? null : Number(offset),
          predecessorId: predecessorId || null,
          conditionKind,
          conditionDetail: conditionDetail || null,
          dueDateOverridden: overridden,
        },
        context,
        titleOf,
      ),
    // titleOf 依 predecessors 而定，於本元件生命週期內穩定
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      type,
      dueDate,
      anchor,
      offset,
      predecessorId,
      conditionKind,
      conditionDetail,
      overridden,
      context,
    ],
  );

  const anchorInfo = anchorMeta(anchor);
  const cyclic = anchorInfo?.cyclic ?? false;
  const patterns = patternsFor(conditionKind);

  return (
    <div className="space-y-3 rounded-lg border bg-muted/30 p-3 sm:col-span-2">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground">觸發方式</span>
          <Select
            name="triggerType"
            value={type}
            onChange={(e) => setType(e.target.value as ObligationTrigger)}
            disabled={disabled}
          >
            {obligationTriggerOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </label>

        {/* 固定日期：直接填日期 */}
        {type === "FIXED_DATE" ? (
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">期限</span>
            <Input
              type="date"
              name="dueDate"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              disabled={disabled}
            />
          </label>
        ) : null}

        {/* 相對期限：基準點 + 天數 */}
        {type === "RELATIVE_DUE" ? (
          <>
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">基準時間點</span>
              <Select
                name="relativeAnchor"
                value={anchor}
                onChange={(e) => setAnchor(e.target.value)}
                disabled={disabled}
              >
                {RELATIVE_ANCHORS.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </Select>
            </label>
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">
                {cyclic ? "每期第幾日" : "天數（負數為基準點之前）"}
              </span>
              <Input
                type="number"
                name="offsetDays"
                value={offset}
                onChange={(e) => setOffset(e.target.value)}
                placeholder={cyclic ? "10" : "30"}
                disabled={disabled}
              />
            </label>
          </>
        ) : null}

        {/* 前置事項：選另一項履約事項 + 落後天數 */}
        {type === "PREDECESSOR" ? (
          <>
            <label className="space-y-1 text-xs sm:col-span-1">
              <span className="text-muted-foreground">前置事項</span>
              <Select
                name="predecessorId"
                value={predecessorId}
                onChange={(e) => setPredecessorId(e.target.value)}
                disabled={disabled}
              >
                <option value="">請選擇</option>
                {predecessors.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} {p.title}
                  </option>
                ))}
              </Select>
            </label>
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">
                前置完成後幾日（負數為之前）
              </span>
              <Input
                type="number"
                name="offsetDays"
                value={offset}
                onChange={(e) => setOffset(e.target.value)}
                placeholder="14"
                disabled={disabled}
              />
            </label>
            {predecessors.length === 0 ? (
              <p className="text-[11px] text-muted-foreground sm:col-span-2">
                本專案目前沒有可作為前置的其他履約事項（會造成循環相依者已排除）。
              </p>
            ) : null}
          </>
        ) : null}

        {/* 條件觸發：條件類型 + 條件模式 */}
        {type === "CONDITION" ? (
          <>
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">條件類型</span>
              <Select
                name="conditionKind"
                value={conditionKind}
                onChange={(e) => {
                  setConditionKind(e.target.value);
                  // 換類型後原本的模式已不屬於新類型，清空以免留下不相符的說明
                  setConditionDetail("");
                }}
                disabled={disabled}
              >
                {conditionKindOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </label>
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">觸發條件</span>
              <Select
                name="conditionDetail"
                value={conditionDetail}
                onChange={(e) => setConditionDetail(e.target.value)}
                disabled={disabled}
              >
                <option value="">請選擇</option>
                {patterns.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </Select>
            </label>
          </>
        ) : null}
      </div>

      {/* 說明與推算結果 */}
      <div className="space-y-1.5 border-t pt-2.5 text-[11px]">
        {type === "RELATIVE_DUE" && anchorInfo ? (
          <Hint icon="info">{anchorInfo.hint}</Hint>
        ) : null}
        {type === "CONDITION" && conditionKindMeta(conditionKind) ? (
          <Hint icon="info">{conditionKindMeta(conditionKind)!.hint}</Hint>
        ) : null}

        <Hint icon={type === "PREDECESSOR" ? "link" : type === "CONDITION" ? "list" : "calendar"}>
          <span className="font-medium text-foreground">
            {describeTrigger(
              {
                triggerType: type,
                dueDate: dueDate || null,
                relativeAnchor: anchor,
                offsetDays: offset === "" ? null : Number(offset),
                predecessorId: predecessorId || null,
                conditionKind,
                conditionDetail: conditionDetail || null,
                dueDateOverridden: overridden,
              },
              titleOf,
            )}
          </span>
          {preview.dueDate ? (
            <>
              　→　期限 <b className="tabular-nums">{preview.dueDate}</b>
              {preview.manual ? "（人工指定）" : "（系統推算）"}
            </>
          ) : preview.reason ? (
            <span className="text-warning">　→　{preview.reason}</span>
          ) : null}
        </Hint>

        {/*
          非固定日期時，期限仍以隱藏欄位送出推算值，並保留人工覆寫的選項。
          契約常有例外約定，完全鎖住會無法如實記錄。
        */}
        {type !== "FIXED_DATE" ? (
          <>
            <input type="hidden" name="dueDate" value={overridden ? dueDate : (preview.dueDate ?? "")} />
            <input type="hidden" name="dueDateOverridden" value={overridden ? "on" : ""} />
            <label className="flex flex-wrap items-center gap-2 pt-1">
              <input
                type="checkbox"
                checked={overridden}
                onChange={(e) => setOverridden(e.target.checked)}
                disabled={disabled}
                className="size-3.5 rounded border-input"
              />
              <span className="text-muted-foreground">
                期限另有約定，改為人工指定
              </span>
              {overridden ? (
                <Input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  disabled={disabled}
                  className="h-7 w-auto text-xs"
                />
              ) : null}
            </label>
          </>
        ) : null}
      </div>
    </div>
  );
}

function Hint({
  icon,
  children,
}: {
  icon: "info" | "calendar" | "link" | "list";
  children: React.ReactNode;
}) {
  const Icon =
    icon === "calendar"
      ? CalendarClock
      : icon === "link"
        ? Link2
        : icon === "list"
          ? ListChecks
          : Info;
  return (
    <p className={cn("flex items-start gap-1.5 text-muted-foreground")}>
      <Icon className="mt-0.5 size-3 shrink-0" />
      <span>{children}</span>
    </p>
  );
}
