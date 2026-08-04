"use client";

import { Check, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import type { FaithStep } from "@/components/ai-assistant-context";

/**
 * 費思對話的通用「多步驟進度卡」。
 *
 * 任何把耗時工作拆成小步驟的串流任務都可重用：任務以事件回報每步的
 * 開始／完成（見 AiEventOutcome 的 steps），本元件據以顯示目前進行到哪、
 * 各步驟花了多久。傳入 now（毫秒）以驅動進行中步驟的即時計時。
 *
 * @param steps  目前的步驟快照（含已完成與進行中）
 * @param now    現在時間（ms）；由呼叫端定時更新以顯示即時耗時
 * @param title  進度卡標題，預設「處理進度」
 */
export function FaithSteps({
  steps,
  now,
  title = "處理進度",
}: {
  steps: FaithStep[];
  now: number;
  title?: string;
}) {
  if (!steps.length) return null;

  const fmt = (ms: number) => `${(Math.max(0, ms) / 1000).toFixed(1)}s`;
  const total = steps.reduce(
    (sum, s) =>
      sum +
      (s.status === "done"
        ? s.elapsedMs ?? 0
        : s.startedAt
          ? now - s.startedAt
          : 0),
    0,
  );

  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-md border border-primary/30 bg-primary/[0.04] p-2.5"
    >
      <div className="mb-1.5 flex items-center justify-between px-0.5">
        <span className="text-[11px] font-medium text-muted-foreground">{title}</span>
        <span className="text-[11px] tabular-nums text-muted-foreground">{fmt(total)}</span>
      </div>
      <div className="space-y-1">
        {steps.map((s) => {
          const elapsed =
            s.status === "active" && s.startedAt ? now - s.startedAt : s.elapsedMs;
          return (
            <div key={s.key} className="flex items-center gap-2 text-xs">
              <span className="flex size-4 shrink-0 items-center justify-center">
                {s.status === "done" ? (
                  <Check className="size-3.5 text-success" />
                ) : (
                  <Loader2 className="size-3.5 animate-spin text-primary" />
                )}
              </span>
              <span className="min-w-0 flex-1 truncate">
                {s.label}
                {s.detail ? (
                  <span className="text-muted-foreground">（{s.detail}）</span>
                ) : null}
              </span>
              {elapsed != null ? (
                <span
                  className={cn(
                    "shrink-0 tabular-nums",
                    s.status === "active" ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  {fmt(elapsed)}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
