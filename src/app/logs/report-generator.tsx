"use client";

import { useCallback, useEffect, useState } from "react";
import { Archive, FileText, RefreshCw } from "lucide-react";

import { cn } from "@/lib/utils";
import { saveReportAction } from "@/app/logs/actions";
import { ReportArchive } from "@/app/logs/report-archive";
import { Input } from "@/components/ui/input";
import { Markdown } from "@/components/markdown";
import { Button } from "@/components/ui/button";

// Info: 日報改由人工填報（監造報表），不再由 AI 生成；AI 僅彙整週/月/季/年報。
const TYPES = [
  { value: "WEEKLY", label: "週報" },
  { value: "MONTHLY", label: "月報" },
  { value: "QUARTERLY", label: "季報" },
  { value: "ANNUAL", label: "年報" },
] as const;

type ReportType = (typeof TYPES)[number]["value"];

export function ReportGenerator({
  projectId,
  projectName,
  canEdit,
}: {
  projectId: string;
  projectName: string;
  canEdit: boolean;
}) {
  const [type, setType] = useState<ReportType>("MONTHLY");
  const [refDate, setRefDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [markdown, setMarkdown] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number>(0);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, type, refDate }),
      });
      const data = (await res.json()) as { markdown?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "報告生成失敗");
      setMarkdown(data.markdown ?? "");
    } catch (e) {
      setMarkdown("");
      setError(e instanceof Error ? e.message : "報告生成失敗");
    } finally {
      setLoading(false);
    }
  }, [projectId, type, refDate]);

  /*
    留存目前這一版（決策 J-a）。

    刻意由使用者明確按下，而非隨自動生成一併存檔 ——
    切換週期或日期都會重新生成，每次都存會堆出大量草稿，
    真正要送審的那一版反而被淹沒。
  */
  const save = useCallback(async () => {
    setSaving(true);
    setError(null);
    const r = await saveReportAction(projectId, type, refDate);
    setSaving(false);
    if (!r.ok) setError(r.error ?? "留存失敗");
    else setSavedAt((n) => n + 1);
  }, [projectId, type, refDate]);

  // Info: (20260721 - Luphia) 掛載與參數變更時自動生成（以 timeout 延遲，避免在 effect 內同步 setState）
  useEffect(() => {
    const id = setTimeout(() => {
      void run();
    }, 0);
    return () => clearTimeout(id);
  }, [run]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3">
        <div className="flex gap-1">
          {TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setType(t.value)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                type === t.value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex items-center flex-1 gap-2">
          <span className="text-xs text-muted-foreground">基準日</span>
          <Input
            type="date"
            value={refDate}
            onChange={(e) => setRefDate(e.target.value)}
            className="w-40"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            onClick={() => run()}
            disabled={loading}
            variant="outline"
          >
            <RefreshCw className={cn("size-4", loading && "animate-spin")} />
            重新生成
          </Button>
          {canEdit && (
            <Button
              type="button"
              onClick={() => void save()}
              disabled={loading || saving || !markdown}
              title="保存目前這一版作為送審依據；報表數字為即時推導，不留存則無從得知送出的是哪一版"
            >
              <Archive className="size-4" />
              {saving ? "留存中…" : "留存此報表"}
            </Button>
          )}
        </div>
      </div>

      <div className="rounded-lg border bg-card p-6">
        {loading ? (
          <div className="flex items-center gap-2 py-16 text-sm text-muted-foreground">
            <RefreshCw className="size-4 animate-spin" />
            費思正在依 {projectName} 的系統紀錄生成報告…
          </div>
        ) : error ? (
          <div className="py-10 text-center text-sm text-destructive">
            {error}
          </div>
        ) : markdown ? (
          <Markdown content={markdown} />
        ) : (
          <div className="flex items-center gap-2 py-16 text-sm text-muted-foreground">
            <FileText className="size-4" />
            尚無報告內容。
          </div>
        )}
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-medium">留存的報表</h3>
        <ReportArchive
          projectId={projectId}
          canEdit={canEdit}
          reloadToken={savedAt}
        />
      </div>
    </div>
  );
}
