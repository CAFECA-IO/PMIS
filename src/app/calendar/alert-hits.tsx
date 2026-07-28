import { BellRing, CheckCircle2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { alertModuleMeta, alertSeverityMeta } from "@/constant/alert";
import type { AlertHit } from "@/service/alert-rule";

/** 目前命中的預警（進站即時評估結果）。 */
export function AlertHits({ hits }: { hits: AlertHit[] }) {
  if (hits.length === 0) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 p-5 text-sm text-muted-foreground">
          <CheckCircle2 className="size-5" />
          目前沒有任何已啟用規則被觸發。
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {hits.map((h, i) => (
        <Card
          key={`${h.ruleId}-${h.subject}-${i}`}
          className={
            h.severity === "CRITICAL"
              ? "border-destructive/50 bg-destructive/5"
              : h.severity === "WARNING"
                ? "border-warning/40"
                : undefined
          }
        >
          <CardContent className="flex flex-wrap items-start gap-3 p-4">
            <BellRing
              className={
                h.severity === "CRITICAL"
                  ? "mt-0.5 size-4 shrink-0 text-destructive"
                  : "mt-0.5 size-4 shrink-0 text-warning"
              }
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{h.subject}</span>
                <Badge variant={alertSeverityMeta[h.severity].variant}>
                  {alertSeverityMeta[h.severity].label}
                </Badge>
                <Badge variant="muted">
                  {alertModuleMeta[h.module] ?? h.module}
                </Badge>
                {h.overdue ? <Badge variant="destructive">已逾期</Badge> : null}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {h.detail}
                {h.projectName ? ` · ${h.projectName}` : ""}
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground/80">
                來源規則：{h.ruleName}
                {h.action ? ` · 建議行動：${h.action}` : ""}
                {h.notify ? ` · 通知：${h.notify}` : ""}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
