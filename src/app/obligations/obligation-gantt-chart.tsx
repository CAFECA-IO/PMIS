"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, ChevronRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { obligationStageMeta, obligationStatusMeta } from "@/constant/obligation";
import type { ObligationStage, ObligationStatus } from "@/constant/obligation";
import { withProject } from "@/lib/project-link";
import {
  buildBars,
  buildTimeline,
  dependencyLinks,
  geometryOf,
  positionOf,
  summarize,
  type GanttInput,
} from "@/service/obligation-gantt";

/**
 * 履約事項甘特圖。
 *
 * 設計取捨 ——
 * 橫條是「工作區間」（由歸屬工程分項聚合），菱形是「交付時點」（期限）。
 * 兩者刻意分開：契約管的是交付日，實際耗時由分項決定，把它們畫成同一個
 * 形狀會讓人以為期限就是完工日。實心菱形為實際完成日，與期限並列時
 * 提前或落後一眼可見。
 *
 * 依存線只在前置事項也在目前檢視範圍內時才畫；方向反了（前置比後續晚）
 * 以紅色標出 —— 那是排程錯誤，光看兩列日期不容易發現。
 */

/** 每列高度（px）。 */
const ROW_H = 30;
/** 左側標籤欄寬度。 */
const LABEL_W = 260;

export function ObligationGanttChart({
  items,
  today,
  projectId,
}: {
  items: GanttInput[];
  /** 由伺服器傳入，避免伺服器與瀏覽器算出不同的「今天」。 */
  today: string;
  projectId: string | null;
}) {
  const [hover, setHover] = useState<string | null>(null);

  const bars = buildBars(items, today);
  const timeline = buildTimeline(bars, today);

  if (bars.length === 0 || !timeline) {
    return (
      <Card>
        <CardContent className="p-10 text-center text-sm text-muted-foreground">
          尚無可繪製的履約事項。
        </CardContent>
      </Card>
    );
  }

  const links = dependencyLinks(bars, timeline);
  const stats = summarize(bars, links);
  const todayX = positionOf(timeline, today);
  const height = bars.length * ROW_H;
  const pct = (v: number) => `${(v * 100).toFixed(3)}%`;

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            共 <span className="font-medium text-foreground">{stats.rows}</span> 項，
            其中 {stats.withBars} 項有工程分項可推出工作區間
            {stats.overdue > 0 ? (
              <span className="ml-1 text-destructive">・逾期 {stats.overdue} 項</span>
            ) : null}
            {stats.conflicts > 0 ? (
              <span className="ml-1 text-destructive">
                ・前後順序矛盾 {stats.conflicts} 處
              </span>
            ) : null}
          </p>
          <Legend />
        </div>

        {stats.conflicts > 0 ? (
          <p className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-destructive" />
            <span>
              有 {stats.conflicts} 處前置事項的期限晚於其後續事項，
              代表排程順序矛盾。請檢查前置關係或期限設定。
            </span>
          </p>
        ) : null}

        <div className="overflow-x-auto">
          <div className="min-w-[880px]">
            {/* 月刻度 */}
            <div className="flex border-b pb-1" style={{ paddingLeft: LABEL_W }}>
              <div className="relative h-5 flex-1">
                {timeline.months.map((m) => (
                  <span
                    key={m.label}
                    className="absolute top-0 truncate border-l pl-1 text-[10px] text-muted-foreground"
                    style={{
                      left: pct(m.offsetDays / timeline.days),
                      width: pct(m.days / timeline.days),
                    }}
                  >
                    {m.label.replace(" 年 ", "/").replace(" 月", "")}
                  </span>
                ))}
              </div>
            </div>

            <div className="flex">
              {/* 左側：事項名稱 */}
              <div className="shrink-0" style={{ width: LABEL_W }}>
                {bars.map((b) => (
                  <div
                    key={b.id}
                    className={cn(
                      "flex items-center gap-1.5 pr-2 text-xs transition-colors",
                      hover === b.id && "bg-muted/60",
                    )}
                    style={{ height: ROW_H }}
                    onMouseEnter={() => setHover(b.id)}
                    onMouseLeave={() => setHover(null)}
                  >
                    <span className="w-16 shrink-0 truncate font-mono text-[10px] text-muted-foreground">
                      {b.code}
                    </span>
                    <Link
                      href={withProject(`/obligations/${b.id}`, projectId)}
                      className="min-w-0 flex-1 truncate underline-offset-4 hover:text-primary hover:underline"
                      title={`${b.title}（${obligationStageMeta[b.stage as ObligationStage]?.label ?? b.stage}）`}
                    >
                      {b.title}
                    </Link>
                    <ChevronRight className="size-3 shrink-0 text-muted-foreground/50" />
                  </div>
                ))}
              </div>

              {/* 右側：時間軸與圖形 */}
              <div className="relative flex-1" style={{ height }}>
                {/* 月分隔線 */}
                {timeline.months.map((m) => (
                  <span
                    key={m.label}
                    className="absolute top-0 border-l border-border/60"
                    style={{ left: pct(m.offsetDays / timeline.days), height }}
                  />
                ))}

                {/* 今日線 */}
                {todayX !== null ? (
                  <span
                    className="absolute top-0 z-10 border-l-2 border-primary/70"
                    style={{ left: pct(todayX), height }}
                    title={`今日 ${today}`}
                  />
                ) : null}

                {/* 依存線 */}
                <svg
                  className="pointer-events-none absolute inset-0 h-full w-full"
                  preserveAspectRatio="none"
                  viewBox={`0 0 1000 ${height}`}
                >
                  {links.map((l, i) => {
                    const x1 = l.fromX * 1000;
                    const x2 = l.toX * 1000;
                    const y1 = l.fromRow * ROW_H + ROW_H / 2;
                    const y2 = l.toRow * ROW_H + ROW_H / 2;
                    const midX = Math.max(x1 + 6, x2 - 6);
                    return (
                      <polyline
                        key={i}
                        points={`${x1},${y1} ${midX},${y1} ${midX},${y2} ${x2},${y2}`}
                        fill="none"
                        stroke={
                          l.conflicting
                            ? "var(--color-destructive)"
                            : "var(--color-muted-foreground)"
                        }
                        strokeWidth={l.conflicting ? 1.6 : 1}
                        strokeDasharray={l.conflicting ? undefined : "3 2"}
                        vectorEffect="non-scaling-stroke"
                      />
                    );
                  })}
                </svg>

                {bars.map((b) => {
                  const g = geometryOf(timeline, b);
                  return (
                    <div
                      key={b.id}
                      className={cn(
                        "absolute inset-x-0 transition-colors",
                        hover === b.id && "bg-muted/60",
                      )}
                      style={{ top: b.row * ROW_H, height: ROW_H }}
                      onMouseEnter={() => setHover(b.id)}
                      onMouseLeave={() => setHover(null)}
                    >
                      {/* 工作區間 */}
                      {g.bar ? (
                        <span
                          className={cn(
                            "absolute top-1/2 h-2.5 -translate-y-1/2 rounded-full",
                            b.done
                              ? "bg-muted-foreground/50"
                              : b.overdue
                                ? "bg-destructive/70"
                                : "bg-primary/60",
                          )}
                          style={{
                            left: pct(g.bar.left),
                            width: pct(g.bar.width),
                          }}
                          title={`工作區間 ${b.start} ～ ${b.end}`}
                        />
                      ) : null}

                      {/* 期限里程碑（空心菱形） */}
                      {g.milestone !== null ? (
                        <span
                          className={cn(
                            "absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 border-2 bg-card",
                            b.overdue ? "border-destructive" : "border-foreground/70",
                          )}
                          style={{ left: pct(g.milestone) }}
                          title={`期限 ${b.dueDate}`}
                        />
                      ) : null}

                      {/* 實際完成（實心菱形） */}
                      {g.actual !== null ? (
                        <span
                          className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 bg-success"
                          style={{ left: pct(g.actual) }}
                          title={`實際完成 ${b.actualDate}`}
                        />
                      ) : null}

                      {/* 沒有任何日期時明說，而非留一列空白 */}
                      {!g.bar && g.milestone === null && g.actual === null ? (
                        <span className="absolute left-1 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">
                          尚未設定期限
                        </span>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* 停留時顯示該列的狀態，省下在寬表上左右來回 */}
        {hover ? <HoverDetail bar={bars.find((b) => b.id === hover)!} /> : null}
      </CardContent>
    </Card>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
      <span className="flex items-center gap-1">
        <span className="h-2 w-5 rounded-full bg-primary/60" />
        工作區間
      </span>
      <span className="flex items-center gap-1">
        <span className="size-2 rotate-45 border-2 border-foreground/70" />
        期限
      </span>
      <span className="flex items-center gap-1">
        <span className="size-2 rotate-45 bg-success" />
        實際完成
      </span>
      <span className="flex items-center gap-1">
        <span className="h-2 w-5 rounded-full bg-destructive/70" />
        逾期
      </span>
      <span className="flex items-center gap-1">
        <span className="h-3 border-l-2 border-primary/70" />
        今日
      </span>
    </div>
  );
}

function HoverDetail({ bar }: { bar: ReturnType<typeof buildBars>[number] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border bg-muted/30 px-3 py-2 text-xs">
      <span className="font-mono text-[10px] text-muted-foreground">{bar.code}</span>
      <span className="font-medium">{bar.title}</span>
      <Badge variant={obligationStageMeta[bar.stage as ObligationStage]?.variant ?? "muted"}>
        {obligationStageMeta[bar.stage as ObligationStage]?.label ?? bar.stage}
      </Badge>
      <Badge variant={obligationStatusMeta[bar.status as ObligationStatus]?.variant ?? "muted"}>
        {obligationStatusMeta[bar.status as ObligationStatus]?.label ?? bar.status}
      </Badge>
      <span className="text-muted-foreground">
        工作區間 {bar.start ?? "—"} ～ {bar.end ?? "—"}
      </span>
      <span className={cn("tabular-nums", bar.overdue && "font-semibold text-destructive")}>
        期限 {bar.dueDate ?? "—"}
      </span>
      {bar.actualDate ? (
        <span className="tabular-nums text-muted-foreground">
          實際完成 {bar.actualDate}
        </span>
      ) : null}
    </div>
  );
}
