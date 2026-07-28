"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bell,
  ChevronRight,
  ExternalLink,
  Inbox,
  Pin,
  PinOff,
  X,
} from "lucide-react";

import { cn, formatDate } from "@/lib/utils";
import {
  HEADER_PANEL_OVERLAY,
  HEADER_PANEL_POSITION,
} from "@/lib/overlay";
import {
  formatBadge,
  groupNotifications,
  type NotificationItem,
} from "@/service/notification-order";

/**
 * 系統通知鈴鐺。
 *
 * 注意：面板以 portal 掛載到 document.body。側邊欄 <aside> 帶有 transform，
 * 會成為 position:fixed 子元素的定位基準，直接內嵌會導致面板錯位。
 */
export function NotificationBell({
  items,
  onMarkRead,
  onTogglePin,
}: {
  items: NotificationItem[];
  /** 展開訊息時標記已讀 */
  onMarkRead: (id: string) => Promise<void>;
  /** 切換釘選 */
  onTogglePin: (id: string, pinned: boolean) => Promise<void>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // 樂觀已讀：伺服器回來前先在畫面上反映，避免展開後未讀數還掛著
  const [readLocal, setReadLocal] = useState<Set<string>>(new Set());
  const canPortal = typeof document !== "undefined";

  const merged = items.map((n) =>
    readLocal.has(n.id) && n.readAt === null
      ? { ...n, readAt: new Date().toISOString() }
      : n,
  );
  const { pinned, inbox, unreadCount } = groupNotifications(merged);
  const badge = formatBadge(unreadCount);

  // Esc 關閉、點外部關閉
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  /** 展開訊息：同時自動標記已讀 */
  async function expand(item: NotificationItem) {
    const next = expandedId === item.id ? null : item.id;
    setExpandedId(next);
    if (next && item.readAt === null && !readLocal.has(item.id)) {
      setReadLocal((s) => new Set(s).add(item.id));
      setBusy(item.id);
      try {
        await onMarkRead(item.id);
        router.refresh();
      } finally {
        setBusy(null);
      }
    }
  }

  async function togglePin(item: NotificationItem) {
    setBusy(item.id);
    try {
      await onTogglePin(item.id, item.pinnedAt === null);
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={
          unreadCount > 0 ? `系統通知，${unreadCount} 則未讀` : "系統通知"
        }
        title={unreadCount > 0 ? `${unreadCount} 則未讀通知` : "系統通知"}
        className={cn(
          "relative flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
          open && "bg-accent text-foreground",
        )}
      >
        <Bell className="size-[18px]" />
        {badge ? (
          <span
            className="animate-fab-in absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-white"
            aria-hidden
          >
            {badge}
          </span>
        ) : null}
      </button>

      {open && canPortal
        ? createPortal(
            <>
              {/* 點擊外部關閉 */}
              <div
                className={HEADER_PANEL_OVERLAY}
                onClick={() => setOpen(false)}
              />
              <div
                role="dialog"
                aria-label="系統通知"
                // 定位與用戶帳號共用同一份定義，確保兩者對齊（見 lib/overlay）
                className={cn(
                  HEADER_PANEL_POSITION,
                  "animate-pane-slide-up flex max-h-[min(70vh,32rem)] w-[min(26rem,calc(100vw-1rem))] flex-col overflow-hidden rounded-xl border bg-card shadow-overlay",
                )}
              >
                <div className="flex items-center justify-between border-b px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Bell className="size-4 text-primary" />
                    <h2 className="text-sm font-semibold">系統通知</h2>
                    {unreadCount > 0 ? (
                      <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">
                        {unreadCount} 則未讀
                      </span>
                    ) : (
                      <span className="text-[11px] text-muted-foreground">
                        全部已讀
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    aria-label="關閉"
                    onClick={() => setOpen(false)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-4" />
                  </button>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto">
                  {pinned.length === 0 && inbox.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-sm text-muted-foreground">
                      <Inbox className="size-6 opacity-60" />
                      目前沒有系統通知。
                    </div>
                  ) : null}

                  {pinned.length > 0 ? (
                    <section>
                      <div className="flex items-center gap-1.5 bg-muted/50 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        <Pin className="size-3" />
                        釘選（{pinned.length}）
                      </div>
                      {pinned.map((item) => (
                        <Row
                          key={item.id}
                          item={item}
                          expanded={expandedId === item.id}
                          busy={busy === item.id}
                          onExpand={() => void expand(item)}
                          onTogglePin={() => void togglePin(item)}
                          onNavigate={() => setOpen(false)}
                        />
                      ))}
                    </section>
                  ) : null}

                  {inbox.length > 0 ? (
                    <section>
                      {pinned.length > 0 ? (
                        <div className="bg-muted/50 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          其他通知
                        </div>
                      ) : null}
                      {inbox.map((item) => (
                        <Row
                          key={item.id}
                          item={item}
                          expanded={expandedId === item.id}
                          busy={busy === item.id}
                          onExpand={() => void expand(item)}
                          onTogglePin={() => void togglePin(item)}
                          onNavigate={() => setOpen(false)}
                        />
                      ))}
                    </section>
                  ) : null}
                </div>

                <div className="border-t px-4 py-2">
                  <Link
                    href="/notifications"
                    onClick={() => setOpen(false)}
                    className="flex items-center justify-center gap-1 text-xs font-medium text-primary hover:underline"
                  >
                    查看全部通知
                    <ChevronRight className="size-3.5" />
                  </Link>
                </div>
              </div>
            </>,
            document.body,
          )
        : null}
    </>
  );
}

function Row({
  item,
  expanded,
  busy,
  onExpand,
  onTogglePin,
  onNavigate,
}: {
  item: NotificationItem;
  expanded: boolean;
  busy: boolean;
  onExpand: () => void;
  onTogglePin: () => void;
  onNavigate: () => void;
}) {
  const unread = item.readAt === null;
  return (
    <div className={cn("border-b last:border-b-0", unread && "bg-primary/[0.03]")}>
      <div className="flex items-start gap-2 px-4 py-2.5">
        {/* 未讀圓點 */}
        <span
          className={cn(
            "mt-1.5 size-2 shrink-0 rounded-full",
            unread ? "bg-primary" : "bg-transparent",
          )}
          aria-hidden
        />
        <button
          type="button"
          onClick={onExpand}
          className="min-w-0 flex-1 text-left"
          aria-expanded={expanded}
        >
          <div
            className={cn(
              "truncate text-sm",
              unread ? "font-semibold" : "font-medium text-foreground/80",
            )}
          >
            {item.title}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
            {item.source ? <span>{item.source}</span> : null}
            {item.projectName ? <span>{item.projectName}</span> : null}
            {item.dueDate ? (
              <span className="tabular-nums">期限 {formatDate(item.dueDate)}</span>
            ) : null}
          </div>
        </button>
        <button
          type="button"
          onClick={onTogglePin}
          disabled={busy}
          title={item.pinnedAt ? "取消釘選" : "釘選此通知"}
          aria-label={item.pinnedAt ? "取消釘選" : "釘選此通知"}
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-md transition-colors disabled:opacity-50",
            item.pinnedAt
              ? "text-primary hover:bg-primary/10"
              : "text-muted-foreground/60 hover:bg-accent hover:text-foreground",
          )}
        >
          {item.pinnedAt ? (
            <PinOff className="size-3.5" />
          ) : (
            <Pin className="size-3.5" />
          )}
        </button>
      </div>

      {expanded ? (
        <div className="animate-pane-fade-in space-y-2 px-4 pb-3 pl-8">
          <p className="whitespace-pre-wrap text-xs text-muted-foreground">
            {item.detail?.trim() || "此通知沒有其他細節。"}
          </p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            {item.unit ? <span>負責單位：{item.unit}</span> : null}
          </div>
          {item.link ? (
            <Link
              href={item.link}
              onClick={onNavigate}
              className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
            >
              前往查看
              <ExternalLink className="size-3.5" />
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
