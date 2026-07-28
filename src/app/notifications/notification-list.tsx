"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCheck, ChevronDown, ExternalLink, Pin, PinOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn, formatDate } from "@/lib/utils";
import type { NotificationItem } from "@/service/notification-order";

/** 系統通知全清單：與鈴鐺面板同一套規則，釘選區在上、可展開細節。 */
export function NotificationList({
  pinned,
  inbox,
  unreadCount,
  onMarkRead,
  onMarkAllRead,
  onTogglePin,
}: {
  pinned: NotificationItem[];
  inbox: NotificationItem[];
  unreadCount: number;
  onMarkRead: (id: string) => Promise<void>;
  onMarkAllRead: () => Promise<void>;
  onTogglePin: (id: string, pinned: boolean) => Promise<void>;
}) {
  const router = useRouter();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [readLocal, setReadLocal] = useState<Set<string>>(new Set());

  const isRead = (n: NotificationItem) =>
    n.readAt !== null || readLocal.has(n.id);

  async function expand(item: NotificationItem) {
    const next = expandedId === item.id ? null : item.id;
    setExpandedId(next);
    if (next && !isRead(item)) {
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

  async function markAll() {
    setBusy("__all__");
    try {
      await onMarkAllRead();
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  const Row = (item: NotificationItem) => {
    const read = isRead(item);
    const expanded = expandedId === item.id;
    return (
      <div
        key={item.id}
        className={cn(
          "rounded-lg border transition-colors",
          read ? "bg-card" : "border-primary/30 bg-primary/[0.03]",
        )}
      >
        <div className="flex items-start gap-3 p-4">
          <span
            className={cn(
              "mt-1.5 size-2 shrink-0 rounded-full",
              read ? "bg-transparent" : "bg-primary",
            )}
            aria-hidden
          />
          <button
            type="button"
            onClick={() => void expand(item)}
            aria-expanded={expanded}
            className="min-w-0 flex-1 text-left"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "text-sm",
                  read ? "font-medium text-foreground/80" : "font-semibold",
                )}
              >
                {item.title}
              </span>
              {item.source ? (
                <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                  {item.source}
                </span>
              ) : null}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
              {item.projectName ? <span>{item.projectName}</span> : null}
              {item.unit ? <span>{item.unit}</span> : null}
              {item.dueDate ? (
                <span className="tabular-nums">
                  期限 {formatDate(item.dueDate)}
                </span>
              ) : null}
            </div>
          </button>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => void togglePin(item)}
              disabled={busy === item.id}
              title={item.pinnedAt ? "取消釘選" : "釘選此通知"}
              aria-label={item.pinnedAt ? "取消釘選" : "釘選此通知"}
              className={cn(
                "flex size-8 items-center justify-center rounded-md transition-colors disabled:opacity-50",
                item.pinnedAt
                  ? "text-primary hover:bg-primary/10"
                  : "text-muted-foreground/60 hover:bg-accent hover:text-foreground",
              )}
            >
              {item.pinnedAt ? (
                <PinOff className="size-4" />
              ) : (
                <Pin className="size-4" />
              )}
            </button>
            <ChevronDown
              className={cn(
                "size-4 text-muted-foreground/60 transition-transform",
                expanded && "rotate-180",
              )}
            />
          </div>
        </div>

        {expanded ? (
          <div className="animate-pane-fade-in space-y-3 border-t px-4 py-3 pl-9">
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">
              {item.detail?.trim() || "此通知沒有其他細節。"}
            </p>
            {item.link ? (
              <Link
                href={item.link}
                className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
              >
                前往查看
                <ExternalLink className="size-3.5" />
              </Link>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {unreadCount > 0 ? (
        <div className="flex justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void markAll()}
            disabled={busy === "__all__"}
          >
            <CheckCheck className="size-4" />
            全部標記為已讀
          </Button>
        </div>
      ) : null}

      {pinned.length > 0 ? (
        <section className="space-y-2">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold">
            <Pin className="size-3.5 text-primary" />
            釘選
            <span className="text-xs font-normal text-muted-foreground">
              （{pinned.length}）
            </span>
          </h2>
          <div className="space-y-2">{pinned.map(Row)}</div>
        </section>
      ) : null}

      {inbox.length > 0 ? (
        <section className="space-y-2">
          {pinned.length > 0 ? (
            <h2 className="text-sm font-semibold">其他通知</h2>
          ) : null}
          <div className="space-y-2">{inbox.map(Row)}</div>
        </section>
      ) : null}
    </div>
  );
}
