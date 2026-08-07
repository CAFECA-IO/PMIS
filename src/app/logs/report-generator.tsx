"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, FileText, Lock, RefreshCw } from "lucide-react";

import { cn } from "@/lib/utils";
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

/** /api/report 的回應形狀（見 route.ts）。 */
type ReportResponse = {
  markdown?: string;
  savedId?: string | null;
  confirmedId?: string | null;
  error?: string;
};

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
  /** 這一版的留存 id；null 代表未留存（無編輯權限或本期已有定稿）。 */
  const [savedId, setSavedId] = useState<string | null>(null);
  /** 本期已有定稿時的該份 id。 */
  const [confirmedId, setConfirmedId] = useState<string | null>(null);
  /** 遞增以觸發留存清單重新載入。 */
  const [reloadToken, setReloadToken] = useState(0);

  /*
    產出即留存（決策 J-a）。

    刻意**不設**獨立的「留存此報表」按鈕：報表數字與期間評述都是即時產生，
    按鈕若另跑一次產製，存下來的就不是使用者剛讀過的那一份。
    因此改為由伺服器在同一次產製中寫入，回傳其留存 id；
    同期間的草稿以覆寫處理，切換日期不會堆出大量草稿。
  */
  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, type, refDate }),
      });
      const data = (await res.json()) as ReportResponse;
      if (!res.ok) throw new Error(data.error ?? "報告生成失敗");
      setMarkdown(data.markdown ?? "");
      setSavedId(data.savedId ?? null);
      setConfirmedId(data.confirmedId ?? null);
      setReloadToken((n) => n + 1);
    } catch (e) {
      setMarkdown("");
      setSavedId(null);
      setConfirmedId(null);
      setError(e instanceof Error ? e.message : "報告生成失敗");
    } finally {
      setLoading(false);
    }
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
        <Button
          type="button"
          onClick={() => run()}
          disabled={loading}
          variant="outline"
        >
          <RefreshCw className={cn("size-4", loading && "animate-spin")} />
          重新生成
        </Button>
      </div>

      {/* 這一版有沒有被留存、能不能作為送審依據，必須在報表旁邊講清楚 */}
      {!loading && !error && markdown && (
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          {confirmedId ? (
            <>
              <Lock className="mt-0.5 size-3.5 shrink-0" />
              <span>
                本期已有定稿報表（見下方留存清單），內容已凍結。
                此處顯示的是依現況即時產生的預覽，不會覆寫定稿，也不作為送審依據。
              </span>
            </>
          ) : savedId ? (
            <>
              <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" />
              <span>
                以下內容已留存為本期草稿，即留存清單最上方那一列。
                報表數字為即時推導，重新生成會覆寫同期草稿；
                經「確認定稿」後內容凍結，作為送審依據。
              </span>
            </>
          ) : !canEdit ? (
            <span>此為即時預覽；留存與定稿需編輯權限。</span>
          ) : null}
        </p>
      )}

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
          reloadToken={reloadToken}
          currentId={savedId}
          onChanged={() => void run()}
        />
      </div>
    </div>
  );
}
