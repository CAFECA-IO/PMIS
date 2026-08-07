"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, FileText, Lock, RefreshCw, Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";
import { loadPeriodReportAction } from "@/app/logs/actions";
import { ReportArchive } from "@/app/logs/report-archive";
import { Input } from "@/components/ui/input";
import { Markdown } from "@/components/markdown";
import { Button } from "@/components/ui/button";

/**
 * 彙整報表（週／月／季／年）的產生與檢視。
 *
 * **產製是明示動作，不會自動發生。**
 * 產一份報表要呼叫 LLM 並寫一列留存，兩者都是有代價的副作用；
 * 先前掛載與每次改參數都自動產製，於是光是打開本頁就跑一次付費產製並留一列草稿，
 * 而在日期欄逐鍵輸入年份（0002→0020→0202→2026）會連續產生四份。
 *
 * 現行行為：
 *  - 掛載與切換期間 → **唯讀**載入該期間已留存的報表（不呼叫 LLM、不寫入）。
 *  - 按「產生／重新生成」→ 產製一份並同時留存（見 report.service.generateReportView）。
 */

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

/** 畫面上這一份的來源：剛產出的，或是先前留存的。 */
type Shown = {
  markdown: string;
  /**
   * 這一份是否已留存。
   *
   * 本期已有定稿時，「重新生成」產出的是**未留存**的即時預覽 ——
   * 定稿是凍結內容，不覆寫；但使用者仍需能看到現況與定稿有何不同。
   * 這種情況必須明講，否則畫面上的數字會被當成送審依據。
   */
  persisted: boolean;
  savedId: string | null;
  confirmedId: string | null;
  /** 先前留存者的產出時間；剛產出者為 null（就是現在）。 */
  generatedAt: Date | string | null;
  generatedBy: string | null;
};

/*
  與伺服器端 parseRefDate 相同的範圍。用戶端檢查只為了即時停用按鈕與
  少送幾次請求；真正的守門在伺服器端 —— 用戶端擋不住的請求一定會出現。
*/
const MIN_YEAR = 2000;
const MAX_YEAR = 2100;

function isValidRefDate(v: string): boolean {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return false;
  const y = d.getFullYear();
  return y >= MIN_YEAR && y <= MAX_YEAR;
}

const stamp = (v: Date | string) => {
  const d = new Date(v);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
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
  const [shown, setShown] = useState<Shown | null>(null);
  const [periodLabel, setPeriodLabel] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** 遞增以重載留存清單。 */
  const [archiveToken, setArchiveToken] = useState(0);
  /**
   * 遞增以重新唯讀載入畫面上這一份。
   *
   * 與 archiveToken 分開：產製後不可重載 —— 本期已有定稿時產出的預覽
   * 並未留存，重載會把它換成定稿而讓剛產出的內容消失。
   * 確認定稿或刪除後則必須重載，因為留存狀態已改變。
   */
  const [loadToken, setLoadToken] = useState(0);

  const dateOk = isValidRefDate(refDate);
  const key = `${projectId}|${type}|${refDate}|${loadToken}`;
  /*
    載入狀態由「已載入的鍵是否等於當前鍵」推導，而非另存一個 loading state：
    如此 effect 內不需同步 setState，切換期間時也自然回到載入中。
  */
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const loading = dateOk && loadedKey !== key;

  /*
    切換期間時唯讀載入既有留存。

    延遲 400ms 才送出：日期欄在年份輸入過程中會逐鍵觸發 change，
    不防抖會為每個中間值各送一次請求。這裡只是讀取，但沒有理由多打。
  */
  useEffect(() => {
    // 日期無效時不送請求；錯誤訊息與內容隱藏皆由 render 端推導，不寫進 state
    if (!dateOk) return;
    let stale = false;
    const timer = setTimeout(() => {
      loadPeriodReportAction(projectId, type, refDate).then((data) => {
        if (stale) return;
        setError(null);
        setPeriodLabel(data?.periodLabel ?? null);
        setShown(
          data?.saved
            ? {
                markdown: data.saved.markdown,
                persisted: true,
                savedId: data.saved.status === "DRAFT" ? data.saved.id : null,
                confirmedId:
                  data.saved.status === "CONFIRMED" ? data.saved.id : null,
                generatedAt: data.saved.generatedAt,
                generatedBy: data.saved.generatedBy,
              }
            : null,
        );
        setLoadedKey(key);
      });
    }, 400);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [projectId, type, refDate, key, dateOk]);

  /** 產製一份並同時留存（唯一會呼叫 LLM 與寫入的路徑）。 */
  const generate = useCallback(async () => {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, type, refDate }),
      });
      const data = (await res.json()) as ReportResponse;
      if (!res.ok) throw new Error(data.error ?? "報告生成失敗");
      setShown({
        markdown: data.markdown ?? "",
        // 本期已有定稿時伺服器不留存，回傳的 savedId 為 null
        persisted: Boolean(data.savedId),
        savedId: data.savedId ?? null,
        confirmedId: data.confirmedId ?? null,
        generatedAt: null,
        generatedBy: null,
      });
      setLoadedKey(key);
      setArchiveToken((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "報告生成失敗");
    } finally {
      setGenerating(false);
    }
  }, [projectId, type, refDate, key]);

  /*
    日期無效時的錯誤與內容隱藏一律用推導，不在 effect 內同步 setState ——
    那會造成連鎖渲染，且要記得在日期改回有效時把 state 清乾淨（很容易漏）。
  */
  const shownError = dateOk ? error : "基準日不正確，請確認年份。";
  const visible = dateOk ? shown : null;
  const busy = loading || generating;

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
            min={`${MIN_YEAR}-01-01`}
            max={`${MAX_YEAR}-12-31`}
            aria-invalid={!dateOk || undefined}
            onChange={(e) => setRefDate(e.target.value)}
            className="w-40"
          />
        </div>
        {canEdit && (
          <Button
            type="button"
            onClick={() => void generate()}
            disabled={busy || !dateOk}
            title="依現況產生一份報表並留存；會呼叫 AI 撰寫期間評述"
          >
            {visible ? (
              <RefreshCw className={cn("size-4", generating && "animate-spin")} />
            ) : (
              <Sparkles className="size-4" />
            )}
            {generating ? "產生中…" : visible ? "重新生成" : "產生報表"}
          </Button>
        )}
      </div>

      {/* 這一版從哪來、能不能作為送審依據，必須在報表旁邊講清楚 */}
      {!busy && !shownError && visible && (
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          {visible.confirmedId && !visible.persisted ? (
            <>
              <Lock className="mt-0.5 size-3.5 shrink-0" />
              <span>
                本期已有定稿報表（見下方留存清單）。
                以下是依現況即時產生的預覽，未留存、不會覆寫定稿，
                也不作為送審依據；提供它是為了讓現況與定稿的差異看得出來。
              </span>
            </>
          ) : visible.confirmedId ? (
            <>
              <Lock className="mt-0.5 size-3.5 shrink-0" />
              <span>
                以下為本期已定稿的報表，內容已凍結，即送審依據
                {visible.generatedAt ? `（產生於 ${stamp(visible.generatedAt)}）` : ""}。
              </span>
            </>
          ) : (
            <>
              <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" />
              <span>
                以下內容已留存為本期草稿，即留存清單最上方那一列
                {visible.generatedAt
                  ? `（產生於 ${stamp(visible.generatedAt)}${
                      visible.generatedBy ? `・${visible.generatedBy}` : ""
                    }，非即時數字；按「重新生成」取得最新的一份）`
                  : "（剛剛產生）"}
                。經「確認定稿」後內容凍結，作為送審依據。
              </span>
            </>
          )}
        </p>
      )}

      <div className="rounded-lg border bg-card p-6">
        {generating ? (
          <div className="flex items-center gap-2 py-16 text-sm text-muted-foreground">
            <RefreshCw className="size-4 animate-spin" />
            費思正在依 {projectName} 的系統紀錄生成報告…
          </div>
        ) : loading ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            載入已留存的報表…
          </div>
        ) : shownError ? (
          <div className="py-10 text-center text-sm text-destructive">
            {shownError}
          </div>
        ) : visible ? (
          <Markdown content={visible.markdown} />
        ) : (
          /*
            空狀態明說「不會自動產生」：使用者若以為系統壞了而反覆重整，
            那正是我們要避免的重複產製。
          */
          <div className="flex flex-col items-center gap-2 py-16 text-sm text-muted-foreground">
            <FileText className="size-5" />
            <span>
              {periodLabel ?? "本期"}尚無已留存的報表。
            </span>
            <span className="text-xs">
              {canEdit
                ? "報表不會自動產生 —— 按上方「產生報表」依現況產製一份並留存。"
                : "報表需由具編輯權限者產生。"}
            </span>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-medium">留存的報表</h3>
        {/*
          currentId 只在「上方顯示的就是那一列的內容」時給定。
          本期已有定稿而使用者按了重新生成時，上方是未留存的即時預覽，
          此時把定稿標成「上方顯示的這一版」就是錯的；改以 periodConfirmedId
          標出定稿在哪一列，讓橫幅的「見下方留存清單」有東西可指。
        */}
        <ReportArchive
          projectId={projectId}
          canEdit={canEdit}
          reloadToken={archiveToken}
          currentId={
            visible?.persisted
              ? (visible.savedId ?? visible.confirmedId ?? null)
              : null
          }
          periodConfirmedId={visible?.confirmedId ?? null}
          onChanged={() => {
            // 留存狀態已變（定稿／刪除），畫面上這一份的標示必須跟著更新
            setArchiveToken((n) => n + 1);
            setLoadToken((n) => n + 1);
          }}
        />
      </div>
    </div>
  );
}
