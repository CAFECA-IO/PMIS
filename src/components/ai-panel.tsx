"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, Send, PanelRightClose } from "lucide-react";

import { cn } from "@/lib/utils";
import { Markdown } from "@/components/markdown";

type Message = { role: "user" | "assistant"; text: string };
type Typing = { index: number; full: string; shown: number };

const GREETING =
  "您好，我是 **PMIS AI 助理**，可協助查詢預警、缺失、送審與進度等監造相關問題。";

const SUGGESTIONS = [
  "本週有哪些到期事項？",
  "施工查驗有哪些常見缺失？",
  "材料送審流程怎麼跑？",
];

const TYPE_SPEED_MS = 18; // interval per tick
const TYPE_STEP = 2; // characters revealed per tick

export function AiPanel() {
  const [open, setOpen] = useState(true);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [typing, setTyping] = useState<Typing | null>(null);
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", text: GREETING },
  ]);
  const listRef = useRef<HTMLDivElement>(null);

  const busy = loading || typing !== null;

  function scrollToEnd() {
    requestAnimationFrame(() => {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
    });
  }

  // Typewriter effect: reveal the assistant reply gradually.
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
    if (!content || busy) return;

    const history: Message[] = [...messages, { role: "user", text: content }];
    setMessages(history);
    setInput("");
    setLoading(true);
    scrollToEnd();

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });
      const data = (await res.json()) as { text?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "AI 服務錯誤");

      const full = data.text ?? "（無回應）";
      const index = history.length; // new assistant message position
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
        aria-label="開啟 AI 助理"
        className="fixed bottom-6 right-6 z-40 flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105"
      >
        <Bot className="size-5" />
      </button>
    );
  }

  return (
    <aside className="flex h-screen w-80 shrink-0 flex-col border-l bg-card xl:w-96">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Bot className="size-4" />
          </div>
          <span className="text-sm font-semibold">AI 助理</span>
          <span className="text-[10px] text-muted-foreground">Gemini</span>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="隱藏 AI 助理"
          className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <PanelRightClose className="size-4" />
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

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex items-center gap-2 border-t p-3"
      >
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
          disabled={busy || !input.trim()}
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
