"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, Send, Minus, Paperclip, X, Upload } from "lucide-react";

import { cn } from "@/lib/utils";
import { Markdown } from "@/components/markdown";
import { useAiAssistant } from "@/components/ai-assistant-context";

type Message = { role: "user" | "assistant"; text: string };
type Typing = { index: number; full: string; shown: number };

const MAX_FILE_MB = 25;

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
  const { expanded: open, setExpanded: setOpen } = useAiAssistant();
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [typing, setTyping] = useState<Typing | null>(null);
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", text: GREETING },
  ]);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const busy = loading || typing !== null;

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
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history, attachment }),
      });
      const data = (await res.json()) as { text?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "AI 服務錯誤");

      const full = data.text ?? "（無回應）";
      const index = history.length; // Info: (20260721 - Luphia) new assistant message position
      setLoading(false);
      setMessages([...history, { role: "assistant", text: "" }]);
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

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="開啟費思 AI 助理"
        className="fixed bottom-6 right-6 z-40 flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105"
      >
        <Bot className="size-5" />
      </button>
    );
  }

  return (
    <aside
      className="fixed bottom-6 right-6 z-40 flex h-[600px] max-h-[calc(100vh-3rem)] w-[22rem] max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl xl:w-96"
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
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Bot className="size-4" />
          </div>
          <span className="text-sm font-semibold">費思</span>
          <span className="text-[10px] text-muted-foreground">AI 助理</span>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="縮小費思 AI 助理"
          className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Minus className="size-4" />
        </button>
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

      {messages.length <= 1 ? (
        <div className="flex flex-wrap gap-2 px-4 pb-2">
          {SUGGESTIONS.map((s) => (
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
          placeholder="輸入訊息…"
          disabled={busy}
          className="flex h-9 flex-1 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
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
