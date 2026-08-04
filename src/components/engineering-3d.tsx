"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  CalendarClock,
  Info,
  Box,
  Plus,
  Loader2,
  MessageSquarePlus,
  Download,
  RefreshCw,
  History,
  Wand2,
} from "lucide-react";

import {
  useAiAssistant,
  type AiTask,
  type AiEventOutcome,
  type FaithStep,
} from "@/components/ai-assistant-context";
import { useConfirm } from "@/components/ui/confirm-provider";
import { useNotification } from "@/components/ui/notification";
import {
  addDesignedWorkItemsAction,
  getDesignVersionAction,
} from "@/app/overview-3d/actions";
import type { DesignVersionSummary } from "@/service/designVersion.service";

// ── 對外資料型別 ─────────────────────────────────────────────

/** 目前鎖定的專案（僅顯示與傳遞用；施工設計由費思生成）。 */
export type ProjectMeta = {
  id: string;
  code: string;
  name: string;
  location: string | null;
  contractor: string | null;
  budget: number | null;
  status: string;
  startDate: string | null;
  endDate: string | null;
  existingWorkItemCount: number;
};

type StreamKind = "wall" | "dredge" | "pipe" | "generic";

type DesignItem = {
  name: string;
  category?: string;
  kind?: StreamKind;
  unit?: string;
  quantity?: string;
  start?: string;
  end?: string;
  note?: string;
};
type DesignMilestone = {
  title: string;
  phase?: string;
  dueDate?: string;
  weight?: number;
  note?: string;
};
type Design = { reply?: string; workItems: DesignItem[]; milestones: DesignMilestone[] };

// ── 工具 ─────────────────────────────────────────────────────

function classify(name: string, category?: string): StreamKind {
  const s = `${category ?? ""}${name}`;
  if (/護岸|擋土|結構|混凝土|牆|revet|wall|pier|橋墩/i.test(s)) return "wall";
  if (/疏濬|清淤|土方|開挖|填方|dredge|earth|excavat/i.test(s)) return "dredge";
  if (/管|涵|排水路|pipe|culvert|drain/i.test(s)) return "pipe";
  return "generic";
}
function ts(d: string | null | undefined): number | null {
  if (!d) return null;
  const norm = /^\d{4}-\d{2}$/.test(d) ? `${d}-01` : d;
  const t = new Date(norm).getTime();
  return Number.isFinite(t) ? t : null;
}
/** 轉為 YYYY-MM-DD（服務層以字串解析日期）。 */
function isoDay(d: string | null | undefined): string | undefined {
  const t = ts(d);
  return t != null ? new Date(t).toISOString().slice(0, 10) : undefined;
}
function parseQty(q?: string): number | undefined {
  if (!q) return undefined;
  const m = q.replace(/,/g, "").match(/[\d.]+/);
  return m ? Number(m[0]) : undefined;
}

const KIND_LABEL: Record<StreamKind, string> = {
  wall: "護岸／結構",
  dredge: "疏濬／土方",
  pipe: "管線／排水",
  generic: "其他工項",
};
const KIND_HEX: Record<StreamKind, string> = {
  wall: "#c9cdd4",
  dredge: "#6b563f",
  pipe: "#4a90d9",
  generic: "#7c9cbf",
};

export function Engineering3D({
  project,
  versions: initialVersions,
}: {
  project: ProjectMeta;
  /** 已保存的設計版本（新版在前），由伺服器載入。 */
  versions: DesignVersionSummary[];
}) {
  const router = useRouter();
  const { startTask, task, endTask } = useAiAssistant();
  const confirm = useConfirm();
  const { notify } = useNotification();

  const [versions, setVersions] = useState<DesignVersionSummary[]>(initialVersions);
  /** 目前檢視中的版本 id；null 表示尚無任何版本。 */
  const [activeId, setActiveId] = useState<string | null>(initialVersions[0]?.id ?? null);
  const [design, setDesign] = useState<Design | null>(null);
  /** 目前版本的 3D 動畫網頁（HTML 原始碼），以 sandbox iframe 嵌入。 */
  const [html, setHtml] = useState<string | null>(null);
  /** 目前 html／design 對應的版本 id；與 activeId 不同即代表正在載入。 */
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  /** 重新掛載 iframe 用：srcDoc 內容相同時也能強制重播動畫。 */
  const [frameKey, setFrameKey] = useState(0);

  const active = versions.find((v) => v.id === activeId) ?? null;
  const loadingVersion = activeId != null && loadedId !== activeId;

  /*
    切換專案後，若費思還停在別案的 3D 設計任務就結束它。
    任務的 buildBody 綁著當初的 projectId，留著會讓使用者以為正在對眼前這件
    專案下指令，實際上改的是上一件。
  */
  const taskPrefix = `design-3d:${project.id}:`;
  useEffect(() => {
    const id = task?.id;
    if (id && id.startsWith("design-3d:") && !id.startsWith(taskPrefix)) {
      endTask();
    }
  }, [task, endTask, taskPrefix]);

  /*
    生成／修訂的基礎版本。
    以 ref 保存是因為 buildBody 是 startTask 當下建立的閉包，直接讀 state
    會拿到過期值；而使用者在同一個任務裡連續送出數則要求時，第二則應該
    接在剛產生的那一版之上，故每次收到結果都會更新它。
  */
  const baseRef = useRef<{ mode: "new" | "revise"; baseVersion: number | null }>({
    mode: "new",
    baseVersion: null,
  });

  /*
    切換版本（或初次載入既有版本）時取回該版內容。
    版本清單刻意不含 html（數十 KB／版），改在切換到該版時按需取回。

    「正在載入」由 loadedId 與 activeId 的差異推導，而非另存一個旗標 ——
    在 effect 內同步 setState 會觸發連鎖重繪（React 的 lint 規則亦會擋），
    推導出來的值不必在 effect 開頭寫入狀態，也不會有兩者不同步的問題。
  */
  useEffect(() => {
    // 尚無版本，或該版內容已在手上（如剛生成完）則不需再取
    if (!activeId || loadedId === activeId) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await getDesignVersionAction(activeId);
        if (cancelled) return;
        if (!res.ok) {
          notify({ variant: "error", title: "版本載入失敗", description: res.error });
          setLoadedId(activeId); // 標記為已處理，避免載入遮罩停不掉
          return;
        }
        setHtml(res.html);
        setDesign({
          reply: res.design.reply,
          workItems: (res.design.workItems ?? []) as DesignItem[],
          milestones: (res.design.milestones ?? []) as DesignMilestone[],
        });
        setLoadedId(activeId);
        setFrameKey((k) => k + 1);
      } catch {
        if (cancelled) return;
        notify({ variant: "error", title: "版本載入失敗" });
        setLoadedId(activeId);
      }
    })();
    return () => {
      cancelled = true;
    };
    // notify 來自 context 且參考穩定，不列入依賴以免每次重繪都重跑
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, loadedId]);

  // ── 費思串流任務：讀取專案 → 分步驟生成設計與動畫網頁 ──────────
  /**
   * @param mode revise 為基於某版繼續更新；new 為完全重做（不參考既有版本）
   * @param baseVersion 修訂基礎的版號
   */
  function openDesignTask(mode: "new" | "revise", baseVersion: number | null = null) {
    baseRef.current = { mode, baseVersion };

    const stepMap = new Map<string, FaithStep>();
    const snapshot = () => Array.from(stepMap.values());

    const reviseGreeting =
      `我會以 **v${baseVersion}** 為基礎修改這份施工設計與 3D 動畫，保留原有風格與結構。\n\n` +
      `請說明您想調整的地方（例如「護岸改成分三段施工」「加上夜間照明」「動畫放慢一點」）。` +
      `完成後會存成新的一版，原版仍保留。`;
    const newGreeting =
      `我會讀取目前鎖定的專案「${project.name}」，**完全重新**規劃施工設計，並產生一份新的 3D 動畫網頁。${
        project.existingWorkItemCount > 0
          ? `（此專案已有 ${project.existingWorkItemCount} 項分項，我會作為參考。）`
          : ""
      }\n\n直接送出「開始生成」即可，或先說明特別考量（如汛期停工、分段施工、假設工程範圍）。完成後會存成新的一版。`;

    const aiTask: AiTask = {
      // 版本納入 id：切換基礎版本時視為新任務，費思會重置對話與開場白
      id: `design-3d:${project.id}:${mode}:${baseVersion ?? 0}`,
      title: mode === "revise" ? `3D 設計修訂（v${baseVersion}）` : "3D 施工設計",
      greeting: mode === "revise" ? reviseGreeting : newGreeting,
      endpoint: "/api/faith/plan",
      stream: true,
      suggestions:
        mode === "revise"
          ? ["護岸改為分三段施工", "動畫放慢並加大字級", "補上假設工程與交通維持"]
          : ["開始生成", "考慮汛期（5–11 月）停工", "護岸分上下游兩段施工"],
      buildBody: ({ messages }) => ({
        messages,
        projectId: project.id,
        mode: baseRef.current.mode,
        baseVersion: baseRef.current.baseVersion,
      }),
      // 串流任務的結果一律走 onEvent；onResult 為型別必填，此處不使用
      onResult: () => undefined,
      onEvent: (event): AiEventOutcome => {
        if (event.type === "step") {
          const key = String(event.key);
          // 每輪生成由 load 起頭；見到 load 開始即清空，不殘留上一輪步驟
          if (key === "load" && event.status === "start") stepMap.clear();
          if (event.status === "start") {
            stepMap.set(key, {
              key,
              label: String(event.label ?? key),
              status: "active",
              startedAt: Date.now(),
            });
          } else if (event.status === "done") {
            const prev = stepMap.get(key);
            const startedAt = prev?.startedAt;
            stepMap.set(key, {
              key,
              label: String(event.label ?? prev?.label ?? key),
              status: "done",
              startedAt,
              elapsedMs: startedAt ? Date.now() - startedAt : undefined,
              detail:
                typeof event.detail === "string"
                  ? event.detail
                  : typeof event.count === "number"
                    ? `${event.count} 項`
                    : undefined,
            });
          }
          return { kind: "steps", steps: snapshot() };
        }

        if (event.type === "result") {
          const d = event.design as Design | undefined;
          const items = Array.isArray(d?.workItems) ? d!.workItems : [];
          const ms = Array.isArray(d?.milestones) ? d!.milestones : [];
          if (items.length) setDesign({ reply: d?.reply, workItems: items, milestones: ms });

          const nextHtml = typeof event.html === "string" ? event.html : null;
          if (nextHtml) {
            setHtml(nextHtml);
            setFrameKey((k) => k + 1);
          }

          const saved = event.saved as { id: string; version: number } | null | undefined;
          if (saved) {
            // 新版本插到清單最前並切換過去；後續要求接在這一版之上
            setVersions((prev) => [
              {
                id: saved.id,
                version: saved.version,
                summary: d?.reply ?? null,
                instruction: null,
                baseVersion: baseRef.current.baseVersion,
                createdAt: new Date().toISOString(),
                createdByName: null,
                workItemCount: items.length,
                milestoneCount: ms.length,
              },
              ...prev,
            ]);
            setActiveId(saved.id);
            // 內容已在手上，標記為已載入，省去切換後又抓一次同一份 HTML
            if (nextHtml) setLoadedId(saved.id);
            baseRef.current = { mode: "revise", baseVersion: saved.version };
            // 讓伺服器端的版本清單（含產生者姓名）同步
            router.refresh();
          }

          return {
            kind: "message",
            text: nextHtml
              ? `已完成${saved ? `並存為 **v${saved.version}**` : ""}：工程分項 ${items.length} 項、時程里程碑 ${ms.length} 個，3D 動畫已更新。可繼續在此對話提出調整（會再存一版），或於頁面右側「定案」把分項加入專案。`
              : `已完成設計：工程分項 ${items.length} 項、時程里程碑 ${ms.length} 個。`,
          };
        }

        if (event.type === "error") {
          return { kind: "message", text: `⚠️ ${String(event.message ?? "生成失敗")}` };
        }
        return { kind: "ignore" };
      },
    };
    startTask(aiTask);
  }

  /** 另存費思產生的動畫網頁，供離線檢視或歸檔。 */
  function downloadHtml() {
    if (!html) return;
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${project.name}-3D施工動畫.html`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /**
   * 定案：把設計的工程分項直接加入目前的專案。
   *
   * 寫入資料庫屬不可逆的變更，故先問過再送；同名分項由服務層跳過，
   * 重複定案不會把台帳灌成兩倍。
   */
  async function finalize() {
    if (!design || adding) return;
    const items = design.workItems.map((w) => ({
      name: w.name,
      category: w.category,
      unit: w.unit,
      contractQty: parseQty(w.quantity),
      plannedStart: isoDay(w.start),
      plannedEnd: isoDay(w.end),
    }));

    const okToAdd = await confirm({
      title: `將 ${items.length} 項工程分項加入專案？`,
      description: `這些分項會寫入「${project.name}」，可於時程進度與估驗台帳繼續維護數量與單價。名稱已存在的分項會自動略過。`,
      confirmLabel: "加入專案",
    });
    if (!okToAdd) return;

    setAdding(true);
    try {
      const result = await addDesignedWorkItemsAction(project.id, items);
      if (!result.ok) {
        notify({ variant: "error", title: "加入失敗", description: result.error });
        return;
      }
      notify({
        variant: "success",
        title: `已加入 ${result.added} 項工程分項`,
        description:
          result.skipped > 0
            ? `${result.skipped} 項因名稱已存在而略過。`
            : "可前往「時程進度」或專案頁檢視。",
      });
      router.refresh();
    } catch (e) {
      notify({
        variant: "error",
        title: "加入失敗",
        description: e instanceof Error ? e.message : "請稍後再試。",
      });
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="grid grid-cols-1 items-start gap-4 p-4 sm:p-6 xl:grid-cols-[1fr_360px]">
      {/* 3D 動畫：費思產生的 HTML，以 sandbox iframe 嵌入 */}
      <div className="relative h-[420px] overflow-hidden rounded-xl border bg-[#0b1220] shadow-sm sm:h-[560px]">
        {html ? (
          <>
            <iframe
              key={frameKey}
              /*
                srcDoc + sandbox：費思產生的程式碼視為不可信任內容。
                只給 allow-scripts，刻意不給 allow-same-origin ——
                兩者並存等於解除沙箱，動畫就能讀取本站的 cookie 與 localStorage。
                目前設定下 iframe 取得獨立的不透明來源，無法觸及父頁面或站內資料。
              */
              srcDoc={html}
              sandbox="allow-scripts"
              title={`${project.name} 3D 施工動畫`}
              className="size-full border-0"
            />
            {/* 動畫的播放控制由費思產生的網頁自行提供；此處僅放頁面層級操作 */}
            <div className="absolute right-3 top-3 flex gap-1.5">
              <button
                type="button"
                onClick={() => setFrameKey((k) => k + 1)}
                title="重新播放動畫"
                aria-label="重新播放動畫"
                className="flex size-8 items-center justify-center rounded-md border border-white/20 bg-black/45 text-white backdrop-blur transition-colors hover:bg-black/65"
              >
                <RefreshCw className="size-4" />
              </button>
              <button
                type="button"
                onClick={downloadHtml}
                title="另存 HTML"
                aria-label="另存 HTML"
                className="flex size-8 items-center justify-center rounded-md border border-white/20 bg-black/45 text-white backdrop-blur transition-colors hover:bg-black/65"
              >
                <Download className="size-4" />
              </button>
            </div>
          </>
        ) : (
          <div className="flex size-full flex-col items-center justify-center gap-3 p-6 text-center">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-white/10 text-white">
              <Box className="size-7" />
            </div>
            <div className="text-white">
              <div className="text-sm font-semibold">尚未生成施工動畫</div>
              <div className="mt-1 max-w-xs text-xs text-white/70">
                由費思讀取「{project.name}」的專案資訊規劃施工設計，並產生 3D 動畫網頁嵌入此處
              </div>
            </div>
            <button
              type="button"
              onClick={() => openDesignTask("new")}
              className="mt-1 flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-lg transition-transform hover:scale-105"
            >
              <Sparkles className="size-4" />
              讓費思讀取專案並生成動畫
            </button>
            <div className="text-[11px] text-white/50">分步驟進度與耗時會顯示在右側費思對話中</div>
          </div>
        )}

        {/* 專案資訊卡（動畫網頁自身也會標示，此處確保頁面層級可辨識） */}
        {html ? (
          <div className="pointer-events-none absolute left-3 top-3 max-w-[240px] rounded-lg border border-white/15 bg-black/45 p-3 text-white backdrop-blur">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-medium text-cyan-300">{project.code}</span>
              {active ? (
                <span className="rounded bg-white/15 px-1.5 py-0.5 text-[10px] font-semibold">
                  v{active.version}
                </span>
              ) : null}
            </div>
            <div className="mt-0.5 text-sm font-semibold leading-snug">{project.name}</div>
          </div>
        ) : null}

        {/* 切換版本時的載入遮罩 */}
        {loadingVersion ? (
          <div className="absolute inset-0 flex items-center justify-center bg-[#0b1220]/70 backdrop-blur-sm">
            <div className="flex items-center gap-2 text-sm text-white">
              <Loader2 className="size-4 animate-spin" />
              載入版本…
            </div>
          </div>
        ) : null}
      </div>

      {/* 側欄：有版本時顯示；生成／修訂一律在費思對話中進行 */}
      {versions.length > 0 ? (
        <div className="flex flex-col gap-4">
          {/* 版本歷程 */}
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <History className="size-4 text-muted-foreground" />
                版本歷程
              </div>
              <span className="text-xs text-muted-foreground">共 {versions.length} 版</span>
            </div>

            <div className="mt-2 max-h-56 space-y-1.5 overflow-y-auto">
              {versions.map((v) => {
                const isActive = v.id === activeId;
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setActiveId(v.id)}
                    aria-current={isActive}
                    className={
                      "w-full rounded-md border px-2.5 py-2 text-left text-xs transition-colors " +
                      (isActive
                        ? "border-primary bg-primary/10"
                        : "hover:border-primary/40 hover:bg-accent")
                    }
                  >
                    <div className="flex items-center gap-2">
                      <span className={"font-semibold " + (isActive ? "text-primary" : "")}>
                        v{v.version}
                      </span>
                      {v.baseVersion ? (
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          基於 v{v.baseVersion}
                        </span>
                      ) : (
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          重新生成
                        </span>
                      )}
                      <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                        {new Date(v.createdAt).toLocaleString("zh-TW", {
                          month: "2-digit",
                          day: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    {v.instruction ? (
                      <div className="mt-1 line-clamp-2 text-[11px] text-foreground/80">
                        「{v.instruction}」
                      </div>
                    ) : v.summary ? (
                      <div className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">
                        {v.summary}
                      </div>
                    ) : null}
                    <div className="mt-1 text-[10px] text-muted-foreground">
                      分項 {v.workItemCount} · 里程碑 {v.milestoneCount}
                      {v.createdByName ? ` · ${v.createdByName}` : ""}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-3 flex flex-col gap-1.5">
              <button
                type="button"
                disabled={!active}
                onClick={() => active && openDesignTask("revise", active.version)}
                className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                <MessageSquarePlus className="size-4" />
                基於 v{active?.version ?? "—"} 繼續更新
              </button>
              <button
                type="button"
                onClick={() => openDesignTask("new")}
                className="flex w-full items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors hover:bg-accent"
              >
                <Wand2 className="size-4" />
                完全重做一版
              </button>
            </div>
          </div>

          {design ? (
          <div className="rounded-xl border border-primary/30 bg-primary/[0.03] p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-primary">
              <Box className="size-4" />
              目前設計{active ? `（v${active.version}）` : ""}
            </div>
            {design.reply ? <p className="mt-1.5 text-xs text-muted-foreground">{design.reply}</p> : null}

            <div className="mt-3 text-xs font-medium text-muted-foreground">工程分項</div>
            <div className="mt-1 space-y-1.5">
              {design.workItems.map((w, i) => {
                const kind = w.kind ?? classify(w.name, w.category);
                return (
                  <div key={i} className="rounded-md border bg-card px-2.5 py-1.5 text-xs">
                    <div className="flex items-center gap-2">
                      <span
                        className="size-2.5 shrink-0 rounded-sm"
                        style={{ background: KIND_HEX[kind] }}
                      />
                      <span className="min-w-0 flex-1 truncate font-medium">{w.name}</span>
                      <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        {KIND_LABEL[kind]}
                      </span>
                    </div>
                    <div className="mt-0.5 flex flex-wrap gap-x-3 pl-4 text-[11px] text-muted-foreground">
                      {w.quantity ? (
                        <span>
                          數量：{w.quantity}
                          {w.unit ?? ""}
                        </span>
                      ) : null}
                      {w.start || w.end ? (
                        <span>
                          {w.start ?? "—"} ~ {w.end ?? "—"}
                        </span>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>

            {design.milestones.length ? (
              <>
                <div className="mt-3 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <CalendarClock className="size-3.5" />
                  時程里程碑
                </div>
                <div className="mt-1 space-y-1.5">
                  {design.milestones.map((mm, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between gap-2 rounded-md border bg-card px-2.5 py-1.5 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-medium">{mm.title}</div>
                        {mm.phase ? <div className="text-[11px] text-muted-foreground">{mm.phase}</div> : null}
                      </div>
                      <div className="shrink-0 text-right text-[11px] text-muted-foreground">
                        {mm.dueDate ? <div>{mm.dueDate}</div> : null}
                        {typeof mm.weight === "number" ? <div>權重 {mm.weight}</div> : null}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : null}

            <button
              type="button"
              onClick={finalize}
              disabled={adding}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {adding ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              {adding ? "加入中…" : "定案：加入工程分項"}
            </button>
            <div className="mt-2 flex items-start gap-1.5 rounded-md bg-muted/60 px-2.5 py-2 text-[11px] text-muted-foreground">
              <Info className="mt-0.5 size-3.5 shrink-0" />
              定案會把上列 {design.workItems.length} 項工程分項寫入「{project.name}」，數量與單價可於估驗台帳續填；同名分項會自動略過。
            </div>
          </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
