"use client";

import { useEffect, useRef, useState } from "react";
import {
  Bot,
  Send,
  Minus,
  Paperclip,
  X,
  Upload,
  FileCheck2,
  Loader2,
  ThumbsUp,
  ThumbsDown,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { shouldSendOnEnter } from "@/lib/ime";
import { Markdown } from "@/components/markdown";
import { useAiAssistant } from "@/components/ai-assistant-context";

/** 歸檔後的附件資訊，隨使用者訊息一起顯示，讓上傳者立刻知道檔案已入庫。 */
type Archived = {
  id: string;
  fileName: string;
  size: number;
  url: string;
  downloadUrl: string;
};
type Message = {
  role: "user" | "assistant";
  text: string;
  archived?: Archived;
  archiveError?: string;
  /** 這則回答對應的送出識別，供評價與互動紀錄對應。 */
  turnId?: string;
  /** 已送出的評價（單選，可改）。 */
  rating?: "up" | "down";
};
type Typing = { index: number; full: string; shown: number };

const MAX_FILE_MB = 25;

/** 產生識別碼。用於把「對話」與「每次送出」串起紀錄。 */
function newId(prefix: string): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `${prefix}_${rand}`;
}

/**
 * 目前鎖定的專案（側邊欄寫入的 ?project=）。
 * 刻意在送出當下讀取 window.location，而非 useSearchParams ——
 * 本元件掛在 layout，改用 hook 會要求整個外殼加上 Suspense 邊界。
 */
function currentProjectId(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("project");
}

/** 檔案大小的可讀格式。 */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const s = String(reader.result);
      resolve(s.slice(s.indexOf(",") + 1)); // Info: (20260721 - Luphia) strip "data:...;base64,"
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const GREETING =
  "您好，我是 **費思**，PMIS 智慧監造 AI 助理，可協助查詢預警、缺失、送審與進度等監造相關問題。";

const SUGGESTIONS = [
  "本週有哪些到期事項？",
  "施工查驗有哪些常見缺失？",
  "材料送審流程怎麼跑？",
];

const TYPE_SPEED_MS = 18; // Info: (20260721 - Luphia) interval per tick
const TYPE_STEP = 2; // Info: (20260721 - Luphia) characters revealed per tick

export function AiPanel() {
  const {
    expanded: open,
    setExpanded: setOpen,
    task,
    endTask,
  } = useAiAssistant();
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [typing, setTyping] = useState<Typing | null>(null);
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", text: GREETING },
  ]);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  // 工作指示：暫時性狀態，不進入 messages，結束後清除
  const [working, setWorking] = useState(false);
  const [activity, setActivity] = useState<string | null>(null);
  // 負評時可補充原因（除錯價值最高的部分）；key 為訊息索引
  const [reasonFor, setReasonFor] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Info: IME 選字中的 Enter 屬於選字確認，不可送出
  const composingRef = useRef(false);
  // Info: 任務切換時重置對話，taskId 用於偵測切換
  const taskIdRef = useRef<string | null>(null);
  // 一次對話的識別；任務切換時重新產生，讓紀錄能區分不同工作階段
  const conversationRef = useRef<string>(newId("conv"));
  // 目前這次送出的識別，供串流事件與評價共用
  const turnRef = useRef<string | null>(null);

  const busy = loading || typing !== null || working;
  const suggestions = task?.suggestions ?? SUGGESTIONS;

  // 進入／離開任務時重置對話並換上任務開場白
  useEffect(() => {
    const id = task?.id ?? null;
    if (taskIdRef.current === id) return;
    taskIdRef.current = id;
    conversationRef.current = newId("conv");
    setMessages([{ role: "assistant", text: task ? task.greeting : GREETING }]);
    setInput("");
    setFile(null);
    setFileError(null);
    setTyping(null);
    setLoading(false);
    setWorking(false);
    setActivity(null);
  }, [task]);

  function acceptFile(f: File | null | undefined) {
    if (!f) return;
    if (f.size > MAX_FILE_MB * 1024 * 1024) {
      setFileError(`檔案不可超過 ${MAX_FILE_MB} MB。`);
      return;
    }
    setFileError(null);
    setFile(f);
  }

  function scrollToEnd() {
    requestAnimationFrame(() => {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
    });
  } // Info: (20260721 - Luphia) Typewriter effect: reveal the assistant reply gradually.
  useEffect(() => {
    if (!typing) return;
    if (typing.shown >= typing.full.length) {
      setTyping(null);
      return;
    }
    const id = setTimeout(() => {
      const next = Math.min(typing.full.length, typing.shown + TYPE_STEP);
      setMessages((prev) => {
        const copy = [...prev];
        if (copy[typing.index]) {
          copy[typing.index] = {
            ...copy[typing.index],
            text: typing.full.slice(0, next),
          };
        }
        return copy;
      });
      setTyping((t) => (t ? { ...t, shown: next } : t));
      scrollToEnd();
    }, TYPE_SPEED_MS);
    return () => clearTimeout(id);
  }, [typing]);

  /**
   * 消費 NDJSON 串流。
   *
   * 進度回報與對話內容刻意分離：
   *  - 進度走「工作指示區」（activity），只顯示當下狀態，後續狀態覆蓋前一則，
   *    串流結束即清除，不會在對話中留下大量流水訊息；
   *  - 只有任務回傳 message 的事件（如最後的執行結果總結）才寫入對話。
   * data 事件即時交還任務端填入表單，不必等到串流結束。
   */
  async function consumeStream(
    body: ReadableStream<Uint8Array>,
    activeTask: NonNullable<typeof task>,
    userIndex: number,
    hadAttachment: boolean,
  ) {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let posted = false;

    // 收到第一則狀態前就先顯示工作中，避免出現「什麼都沒發生」的空窗
    setLoading(false);
    setWorking(true);
    setActivity("正在讀取文件…");

    const handle = (raw: string) => {
      let event: { type: string } & Record<string, unknown>;
      try {
        event = JSON.parse(raw);
      } catch {
        return; // 忽略不完整或非 JSON 的行
      }

      // 歸檔資訊掛回使用者那則訊息（與非串流路徑一致）。
      // 不在此 return —— 任務端也需要知道檔案 id（例如專案建置完成後，
      // 要把這些檔案從「未指派」改歸新建立的專案）。
      if (event.type === "archived" && hadAttachment) {
        setMessages((prev) =>
          prev.map((m, i) =>
            i === userIndex
              ? {
                  ...m,
                  archived: event.archived as Archived | undefined,
                  archiveError: event.archiveError as string | undefined,
                }
              : m,
          ),
        );
      }

      // 串流模式一律走 onEvent：由任務決定事件的去向。
      // 不呼叫 onResult，避免與非串流的「一次交付完整結果」語意混淆。
      const outcome = activeTask.onEvent?.(event);
      if (!outcome) return;

      if (outcome.kind === "activity") {
        setActivity(outcome.text);
        return;
      }
      if (outcome.kind === "message" && outcome.text.trim()) {
        posted = true;
        setMessages((prev) => [
          ...prev,
          { role: "assistant", text: outcome.text, turnId: turnRef.current ?? undefined },
        ]);
        scrollToEnd();
      }
    };

    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          if (part.trim()) handle(part);
        }
      }
      if (buffer.trim()) handle(buffer);
    } finally {
      reader.releaseLock();
      // 工作指示區為暫時性，結束一律清除
      setWorking(false);
      setActivity(null);
      if (!posted) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", text: "解析結束，但沒有取得可回報的結果。" },
        ]);
      }
      scrollToEnd();
    }
  }

  /**
   * 送出對某則回答的評價。
   *
   * 立即更新畫面（樂觀更新）再送出；紀錄與該次模型往返以
   * conversationId／turnId 對應，除錯時可看到當時模型收到什麼、回了什麼。
   */
  async function rate(index: number, rating: "up" | "down") {
    const target = messages[index];
    if (!target || target.role !== "assistant") return;

    setMessages((prev) =>
      prev.map((m, i) =>
        i === index ? { ...m, rating: m.rating === rating ? undefined : rating } : m,
      ),
    );

    const next = target.rating === rating ? null : rating;
    if (!next) {
      setReasonFor(null);
      return; // 取消評價：不再送出
    }
    // 負評才追問原因；正評不打擾使用者
    setReasonFor(next === "down" ? index : null);
    setReason("");

    try {
      await fetch("/api/faith/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: conversationRef.current,
          turnId: target.turnId,
          rating: next,
          answerText: target.text,
          path: typeof window !== "undefined" ? window.location.pathname : undefined,
        }),
      });
    } catch {
      // 評價送出失敗不影響對話，保留畫面上的選擇
    }
  }

  /** 補送負評的原因說明。 */
  async function sendReason(index: number) {
    const target = messages[index];
    const comment = reason.trim();
    setReasonFor(null);
    setReason("");
    if (!target || !comment) return;
    try {
      await fetch("/api/faith/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: conversationRef.current,
          turnId: target.turnId,
          rating: "down",
          comment,
          answerText: target.text,
          path: typeof window !== "undefined" ? window.location.pathname : undefined,
        }),
      });
    } catch {
      // 補充說明送出失敗不影響已記錄的評價
    }
  }

  async function send(text: string) {
    const content = text.trim();
    const attached = file;
    if ((!content && !attached) || busy) return;

    const shownText = attached
      ? `${content ? `${content}\n\n` : ""}📎 ${attached.name}`
      : content;
    const history: Message[] = [...messages, { role: "user", text: shownText }];
    setMessages(history);
    setInput("");
    setFile(null);
    setFileError(null);
    setLoading(true);
    scrollToEnd();

    try {
      let attachment: { mimeType: string; data: string; name: string } | undefined;
      if (attached) {
        attachment = {
          mimeType: attached.type,
          data: await fileToBase64(attached),
          name: attached.name,
        };
      }
      // 任務模式：改打任務專用 API，並把結構化結果交還功能端填表
      const endpoint = task ? task.endpoint : "/api/chat";
      const projectId = currentProjectId();
      // 每次送出一個 turnId：一次送出可能觸發多次模型呼叫（如四段解析），
      // 全部歸屬到同一個 turnId，評價才能對應到「這一次的回答」
      const turnId = newId("turn");
      turnRef.current = turnId;
      const ids = {
        projectId,
        conversationId: conversationRef.current,
        turnId,
      };
      const body = task
        ? { ...task.buildBody({ messages: history, attachment }), ...ids }
        : { messages: history, attachment, ...ids };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      // 串流模式：逐行讀取 NDJSON，邊解析邊把狀態寫進對話
      if (task?.stream && res.ok && res.body) {
        await consumeStream(
          res.body,
          task,
          history.length - 1,
          attached != null,
        );
        return;
      }

      const data = (await res.json()) as {
        text?: string;
        reply?: string;
        error?: string;
        archived?: Archived;
        archiveError?: string;
      };
      // 附件已歸檔：即使後續判讀失敗，也要讓使用者看到檔案已入庫
      if (attached && (data.archived || data.archiveError)) {
        const at = history.length - 1;
        setMessages((prev) =>
          prev.map((m, i) =>
            i === at
              ? { ...m, archived: data.archived, archiveError: data.archiveError }
              : m,
          ),
        );
      }
      if (!res.ok) throw new Error(data.error ?? "AI 服務錯誤");

      let full: string;
      if (task) {
        task.onResult(data);
        full = data.reply ?? "（無回應）";
      } else {
        full = data.text ?? "（無回應）";
      }
      const index = history.length; // Info: (20260721 - Luphia) new assistant message position
      setLoading(false);
      setMessages([
        ...history,
        { role: "assistant", text: "", turnId },
      ]);
      setTyping({ index, full, shown: 0 });
    } catch (e) {
      setLoading(false);
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          text: `⚠️ ${e instanceof Error ? e.message : "AI 服務發生錯誤"}`,
        },
      ]);
    } finally {
      scrollToEnd();
    }
  }

  return (
    <>
      {/* 收合時的浮動按鈕，錨定視窗右下 */}
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="開啟費思 AI 助理"
          className="animate-fab-in fixed bottom-6 right-6 z-40 flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-overlay transition-transform hover:scale-105"
        >
          <Bot className="size-5" />
        </button>
      ) : null}

      {/*
        分欄外殼一律掛載，才能讓寬度轉場「雙向」播放——
        展開時工作區平順讓位、收合時平順收回，而不是瞬間跳動。
        收合狀態以 inert 移出 tab 順序與輔助技術。
      */}
      <div
        inert={!open}
        aria-hidden={!open}
        className={cn(
          "ai-pane-shell overflow-hidden transition-[width] duration-300 ease-out",
          // justify-end 讓分欄貼齊右緣：寬度變化時內容原地被揭開，
          // 而不是隨著外殼左移造成文字晃動
          "lg:relative lg:z-[130] lg:flex lg:h-full lg:shrink-0 lg:justify-end",
          open ? "lg:w-[400px] xl:w-[440px]" : "lg:w-0",
          // 窄視窗改為全螢幕覆蓋，收合時整塊不渲染於畫面上
          !open && "max-lg:hidden",
        )}
      >
        <aside
      className={cn(
        "flex h-full flex-col overflow-hidden bg-card",
        // 視窗寬度不足（< lg）：覆蓋全螢幕，由下方滑入
        "max-lg:fixed max-lg:inset-0 max-lg:z-[130] max-lg:animate-pane-slide-up",
        // 桌機：固定欄寬，避免寬度轉場期間內容被壓縮變形；內容淡入
        "lg:w-[400px] lg:border-l xl:w-[440px] lg:animate-pane-fade-in",
        task && "lg:ring-2 lg:ring-inset lg:ring-primary/40",
      )}
      onDragOver={(e) => {
        e.preventDefault();
        if (!busy) setDragOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setDragOver(false);
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (!busy) acceptFile(e.dataTransfer.files?.[0]);
      }}
    >
      {dragOver ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-primary bg-card/90 text-primary">
          <Upload className="size-7" />
          <span className="text-sm font-medium">放開以上傳檔案</span>
          <span className="text-xs text-muted-foreground">不限格式</span>
        </div>
      ) : null}

      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Bot className="size-4" />
          </div>
          <span className="shrink-0 text-sm font-semibold">費思</span>
          {/* 標題列的工作中指示：捲動到對話上方時仍看得到 AI 還在跑 */}
          {working ? (
            <span className="flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
              <Loader2 className="size-2.5 animate-spin" />
              工作中
            </span>
          ) : null}
          {task ? (
            <span className="truncate rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
              {task.title}
            </span>
          ) : (
            <span className="text-[10px] text-muted-foreground">AI 助理</span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {task ? (
            <button
              type="button"
              onClick={endTask}
              title="結束任務，回到一般問答"
              className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              結束任務
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="縮小費思 AI 助理"
            className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <Minus className="size-4" />
          </button>
        </div>
      </div>

      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.map((m, i) => (
          <div
            key={i}
            className={cn(
              "flex",
              m.role === "user" ? "justify-end" : "justify-start",
            )}
          >
            <div
              className={cn(
                "max-w-[85%] rounded-lg px-3 py-2 text-sm",
                m.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-foreground",
              )}
            >
              <Markdown content={m.text} />
              {typing && typing.index === i ? (
                <span className="ml-0.5 inline-block h-3.5 w-1.5 translate-y-0.5 animate-pulse bg-current align-middle" />
              ) : null}
              {m.archived ? (
                <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-current/20 pt-2 text-xs opacity-90">
                  <FileCheck2 className="size-3.5 shrink-0" />
                  <span>已歸檔至檔案管理</span>
                  <span className="opacity-70">
                    ({formatSize(m.archived.size)})
                  </span>
                  <a
                    href={m.archived.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-2 hover:opacity-80"
                  >
                    檢視
                  </a>
                  <a
                    href={m.archived.downloadUrl}
                    className="underline underline-offset-2 hover:opacity-80"
                  >
                    下載
                  </a>
                </div>
              ) : m.archiveError ? (
                <div className="mt-2 border-t border-current/20 pt-2 text-xs opacity-90">
                  檔案未能歸檔：{m.archiveError}
                </div>
              ) : null}

              {/*
                回答評價。只出現在助理訊息、且該訊息確實來自一次模型往返
                （有 turnId）；開場白與錯誤訊息不需評價。
                評價與當次互動一起寫入費思紀錄資料夾，供追蹤與除錯。
              */}
              {m.role === "assistant" &&
              m.turnId &&
              !(typing && typing.index === i) ? (
                <div className="mt-2 flex items-center gap-1 border-t border-current/20 pt-1.5">
                  <span className="mr-1 text-[11px] text-muted-foreground">
                    這個回答有幫助嗎？
                  </span>
                  <button
                    type="button"
                    aria-label="這個回答很好"
                    aria-pressed={m.rating === "up"}
                    onClick={() => void rate(i, "up")}
                    className={cn(
                      "flex size-6 items-center justify-center rounded transition-colors",
                      m.rating === "up"
                        ? "bg-success-soft text-success"
                        : "text-muted-foreground hover:bg-muted-foreground/10 hover:text-foreground",
                    )}
                  >
                    <ThumbsUp className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label="這個回答很差"
                    aria-pressed={m.rating === "down"}
                    onClick={() => void rate(i, "down")}
                    className={cn(
                      "flex size-6 items-center justify-center rounded transition-colors",
                      m.rating === "down"
                        ? "bg-warning-soft text-warning"
                        : "text-muted-foreground hover:bg-muted-foreground/10 hover:text-foreground",
                    )}
                  >
                    <ThumbsDown className="size-3.5" />
                  </button>
                  {m.rating ? (
                    <span className="ml-1 text-[11px] text-muted-foreground">
                      已記錄，感謝回饋
                    </span>
                  ) : null}
                </div>
              ) : null}

              {reasonFor === i ? (
                <div className="mt-1.5 flex items-center gap-1.5">
                  <input
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void sendReason(i);
                      if (e.key === "Escape") setReasonFor(null);
                    }}
                    placeholder="哪裡不對？（選填，有助改善）"
                    className="h-7 min-w-0 flex-1 rounded border border-input bg-background px-2 text-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                  <button
                    type="button"
                    onClick={() => void sendReason(i)}
                    className="shrink-0 rounded px-2 py-1 text-[11px] font-medium text-primary hover:bg-primary/10"
                  >
                    送出
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        ))}

        {loading ? (
          <div className="flex justify-start">
            <div className="flex items-center gap-1 rounded-lg bg-muted px-3 py-2.5">
              <Dot delay="0ms" />
              <Dot delay="150ms" />
              <Dot delay="300ms" />
            </div>
          </div>
        ) : null}
      </div>

      {/*
        工作指示區：與對話內容分離的暫時性區域。
        只顯示「當下」在做什麼，後續狀態覆蓋前一則，結束即消失，
        不會在對話中累積成一長串流水訊息。
      */}
      {working ? (
        <div
          role="status"
          aria-live="polite"
          className="mx-4 mb-2 flex items-center gap-2 rounded-md border border-dashed border-primary/40 bg-primary/5 px-3 py-2"
        >
          <Loader2 className="size-3.5 shrink-0 animate-spin text-primary" />
          <span className="min-w-0 flex-1 truncate text-xs text-foreground/80">
            {activity ?? "費思正在處理…"}
          </span>
          <span className="shrink-0 text-[11px] font-medium text-primary">
            工作中
          </span>
        </div>
      ) : null}

      {messages.length <= 1 ? (
        <div className="flex flex-wrap gap-2 px-4 pb-2">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => send(s)}
              disabled={busy}
              className="rounded-full border px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
            >
              {s}
            </button>
          ))}
        </div>
      ) : null}

      {file || fileError ? (
        <div className="px-3 pt-2">
          {file ? (
            <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-2.5 py-1.5 text-xs">
              <Paperclip className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{file.name}</span>
              <span className="shrink-0 text-muted-foreground">
                {(file.size / 1024 / 1024).toFixed(1)} MB
              </span>
              <button
                type="button"
                aria-label="移除附件"
                onClick={() => setFile(null)}
                className="shrink-0 text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ) : null}
          {fileError ? (
            <p className="mt-1 text-xs text-destructive">{fileError}</p>
          ) : null}
        </div>
      ) : null}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex items-center gap-2 border-t p-3"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={task?.accept}
          className="hidden"
          onChange={(e) => {
            acceptFile(e.target.files?.[0]);
            e.target.value = ""; // Info: (20260721 - Luphia) allow re-selecting the same file
          }}
        />
        <button
          type="button"
          aria-label="上傳檔案"
          title="上傳檔案（不限格式，可拖曳）"
          onClick={() => fileInputRef.current?.click()}
          disabled={busy}
          className="flex size-9 shrink-0 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
        >
          <Paperclip className="size-4" />
        </button>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onCompositionStart={() => {
            composingRef.current = true;
          }}
          onCompositionEnd={() => {
            composingRef.current = false;
          }}
          onKeyDown={(e) => {
            // IME 選字中的 Enter 交還輸入法，避免誤送並吃掉選字
            if (e.key !== "Enter") return;
            if (!shouldSendOnEnter(e.nativeEvent, composingRef.current)) {
              e.preventDefault();
            }
          }}
          placeholder={task ? "描述您的需求…" : "輸入訊息…"}
          disabled={busy}
          className="flex h-9 flex-1 rounded-md border border-input bg-transparent px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        />
        <button
          type="submit"
          aria-label="送出"
          className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          disabled={busy || (!input.trim() && !file)}
        >
          <Send className="size-4" />
        </button>
      </form>
        </aside>
      </div>
    </>
  );
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="size-2 animate-bounce rounded-full bg-muted-foreground/60"
      style={{ animationDelay: delay }}
    />
  );
}
