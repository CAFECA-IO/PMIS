"use client";

import { useState } from "react";
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronRight,
  CircleDashed,
  Loader2,
  RotateCcw,
  Sparkles,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { FormActionBar } from "@/components/ui/form-action-bar";
import { cn } from "@/lib/utils";
import { WIZARD_STEPS, type StepProgress, type WizardStepId } from "@/service/wizard-steps";
import {
  countOverwrites,
  countSelected,
  sectionCheck,
  toggleItem,
  toggleSection,
  type ReviewSection,
} from "@/service/wizard-review";
import { progressPercent, runningStep } from "@/service/wizard-review";

/**
 * 解析中的覆蓋層與解析後的檢視清單。
 *
 * 兩者是同一件事的兩個階段，故放在同一個元件：
 *  - 解析中：蓋住表單，只顯示進度。蓋住是刻意的 —— 這時去改欄位，
 *    等一下匯入時會與模型的提議衝突，而使用者不會記得自己改了什麼。
 *  - 解析後：列出各段提議，勾選要匯入哪些，或對某一段重新解析。
 *
 * 先前的作法是解析中即時把結果寫進表單，並在左側欄顯示逐段進度。
 * 那讓使用者無從分辨哪個值是自己填的、也無從拒絕模型讀錯的項目。
 */

/** 解析中：蓋在表單上的進度層。 */
export function AnalysisOverlay({ progress }: { progress: StepProgress[] }) {
  const pct = progressPercent(progress);
  const current = runningStep(progress);
  const currentMeta = current
    ? WIZARD_STEPS.find((s) => s.id === current.id)
    : null;
  const settled = progress.filter((p) => p.state !== "pending" && p.state !== "running");

  return (
    <div
      className="absolute inset-0 z-20 flex items-center justify-center bg-background/80 backdrop-blur-sm"
      role="status"
      aria-live="polite"
    >
      <div className="w-full max-w-md space-y-4 rounded-xl border bg-card p-5 shadow-overlay">
        <div className="flex items-center gap-2">
          <Loader2 className="size-4 shrink-0 animate-spin text-primary" />
          <span className="text-sm font-medium">費思正在解析契約</span>
          <span className="ml-auto text-xs tabular-nums text-muted-foreground">
            {settled.length}/{progress.length}
          </span>
        </div>

        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>

        {/* 逐段狀態：進度條只說「多少」，這裡說「在做什麼」 */}
        <ul className="space-y-1.5">
          {progress.map((p) => {
            const meta = WIZARD_STEPS.find((s) => s.id === p.id);
            return (
              <li key={p.id} className="flex items-start gap-2 text-xs">
                <StepIcon state={p.state} />
                <span
                  className={cn(
                    "min-w-0 flex-1",
                    p.state === "running"
                      ? "font-medium text-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {meta?.label ?? p.id}
                  {p.state === "running" && meta ? (
                    <span className="mt-0.5 block text-[11px] text-muted-foreground">
                      {meta.running}
                    </span>
                  ) : null}
                </span>
                {p.state === "done" ? (
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {p.total != null ? `${p.count}/${p.total}` : `${p.count ?? 0} 項`}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>

        <p className="text-[11px] text-muted-foreground">
          {currentMeta
            ? "解析期間表單暫時鎖定，完成後會列出結果供您勾選匯入。"
            : "即將完成…"}
        </p>
      </div>
    </div>
  );
}

function StepIcon({ state }: { state: StepProgress["state"] }) {
  if (state === "running") {
    return <Loader2 className="mt-0.5 size-3.5 shrink-0 animate-spin text-primary" />;
  }
  if (state === "done") return <Check className="mt-0.5 size-3.5 shrink-0 text-success" />;
  if (state === "failed") {
    return <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-destructive" />;
  }
  if (state === "skipped") {
    return <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-warning" />;
  }
  return <CircleDashed className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/50" />;
}

/**
 * 解析後：檢視並勾選要匯入的內容。
 *
 * 預設全選，展開可逐項取消。會覆蓋既有值的項目一定標示 ——
 * 使用者明確勾選就尊重他的選擇，但不能讓他在不知情下失去自己填的內容。
 */
export function AnalysisReview({
  sections,
  selected,
  onSelectedChange,
  onRetry,
  onImport,
  onDiscard,
  busyStep,
}: {
  sections: ReviewSection[];
  selected: Set<string>;
  /** 帶回被動到的段落 —— 呼叫端據此區分「使用者的取捨」與「尚未動過」。 */
  onSelectedChange: (next: Set<string>, section: ReviewSection) => void;
  onRetry: (step: WizardStepId) => void;
  onImport: () => void;
  onDiscard: () => void;
  /** 正在重新解析的段落；該段顯示轉圈並停用互動。 */
  busyStep: WizardStepId | null;
}) {
  /*
    履約事項預設展開。
    這一段每一項都帶契約依據，而「這項管制出自哪一條」正是使用者唯一
    能據以判斷該不該勾的資訊 —— 藏在「逐項檢視」後面等於沒有列出。
    其餘段落（欄位、標的）的標題本身就是內容，收合即可。
  */
  const [expanded, setExpanded] = useState<Set<WizardStepId>>(
    () => new Set<WizardStepId>(["obligations"]),
  );
  const total = countSelected(selected, sections);
  const overwrites = countOverwrites(selected, sections);
  /*
    「沒有取得內容」要以實際成果判斷，不是以段落狀態。
    某段失敗但上游已帶回可用的內容時（如履約事項那段中斷，
    而契約履約標的已讀出），底下卻說它沒有內容，
    使用者會以為勾了也不會有東西進來。
  */
  const problem = sections.filter(
    (s) => (s.state === "failed" || s.state === "skipped") && s.items.length === 0,
  );

  return (
    /* h-full：中段要能自己滾動，footer 才會固定在底部（少了它整層會塌成內容高度） */
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <Sparkles className="size-4 shrink-0 text-primary" />
        <span className="text-sm font-medium">解析結果</span>
        <span className="text-xs text-muted-foreground">
          勾選要匯入表單的內容；不勾的部分不會寫入
        </span>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {sections.map((s) => {
          const check = sectionCheck(selected, s);
          const open = expanded.has(s.id);
          const busy = busyStep === s.id;
          return (
            <div
              key={s.id}
              className={cn(
                "rounded-lg border",
                check !== "none" && "border-primary/40 bg-primary/5",
              )}
            >
              <div className="flex items-start gap-2.5 p-3">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={check === "all" ? true : check === "some" ? "mixed" : false}
                  aria-label={`勾選${s.label}`}
                  disabled={!s.importable || busy}
                  onClick={() => onSelectedChange(toggleSection(selected, s), s)}
                  className={cn(
                    "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border transition-colors",
                    check === "all"
                      ? "border-primary bg-primary text-primary-foreground"
                      : check === "some"
                        ? "border-primary bg-primary/30"
                        : "border-input",
                    !s.importable && "opacity-40",
                  )}
                >
                  {check === "all" ? <Check className="size-3" /> : null}
                  {check === "some" ? <span className="size-1.5 rounded-sm bg-primary" /> : null}
                </button>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-sm font-medium">{s.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {s.items.length > 0 ? `${s.items.length} 項` : "未取得內容"}
                    </span>
                    {s.items.length > 0 ? (
                      <button
                        type="button"
                        onClick={() =>
                          setExpanded((prev) => {
                            const next = new Set(prev);
                            if (next.has(s.id)) next.delete(s.id);
                            else next.add(s.id);
                            return next;
                          })
                        }
                        className="inline-flex items-center gap-0.5 text-xs text-primary hover:underline"
                      >
                        {open ? (
                          <ChevronDown className="size-3.5" />
                        ) : (
                          <ChevronRight className="size-3.5" />
                        )}
                        {open ? "收合" : "逐項檢視"}
                      </button>
                    ) : null}
                    {s.retryable ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onRetry(s.id)}
                        className="ml-auto inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline disabled:opacity-50"
                      >
                        {busy ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <RotateCcw className="size-3.5" />
                        )}
                        重新解析此段
                      </button>
                    ) : null}
                  </div>

                  {/* 模型對這一段的說明；失敗或略過的原因優先 */}
                  {s.error ? (
                    <p className="mt-1 text-xs text-warning">{s.error}</p>
                  ) : s.note ? (
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {s.note}
                    </p>
                  ) : null}
                </div>
              </div>

              {open ? (
                <ul className="divide-y border-t">
                  {s.items.map((item) => {
                    const on = selected.has(item.key);
                    return (
                      <li key={item.key}>
                        <label className="flex cursor-pointer items-start gap-2.5 px-3 py-2 transition-colors hover:bg-muted/40">
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={() => onSelectedChange(toggleItem(selected, item.key), s)}
                            className="mt-0.5 size-3.5 shrink-0 rounded border-input"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-xs font-medium">
                              {item.label}
                            </span>
                            {item.detail ? (
                              /*
                                不 truncate：這一行帶的是契約條次，
                                截成「契約第十一條 履約期…」就無法回查，等於沒有列出。
                              */
                              <span className="block text-[11px] text-muted-foreground">
                                {item.detail}
                              </span>
                            ) : null}
                            {item.overwrites ? (
                              <span className="mt-0.5 block text-[11px] text-warning">
                                將覆蓋：{item.overwrites}
                              </span>
                            ) : null}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </div>
          );
        })}

        {problem.length > 0 ? (
          <p className="flex items-start gap-2 rounded-md border border-dashed border-warning/50 bg-warning-soft px-3 py-2 text-xs">
            <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-warning" />
            <span>
              以下段落沒有取得內容：
              {problem.map((s) => s.label).join("、")}
              。可補充說明後點該段的「重新解析此段」，或先匯入其他部分再手動補齊。
            </span>
          </p>
        ) : null}
      </div>

      {/*
        走共用動作列 —— 這一層蓋在表單欄之上，footer 落在右下角，
        正是費思浮動按鈕的位置。自己寫一條 border-t 的 flex 就會被蓋住。
      */}
      <FormActionBar
        hint={
          overwrites > 0
            ? `其中 ${overwrites} 項會覆蓋您已填的內容`
            : "不會覆蓋您已填的內容"
        }
      >
        <Button type="button" variant="ghost" onClick={onDiscard}>
          <X className="size-4" />
          捨棄解析結果
        </Button>
        <Button type="button" onClick={onImport} disabled={total === 0}>
          <Check className="size-4" />
          匯入勾選（{total}）
        </Button>
      </FormActionBar>
    </div>
  );
}
