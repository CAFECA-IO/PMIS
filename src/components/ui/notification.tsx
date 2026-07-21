"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { CheckCircle2, AlertCircle, Info, Undo2, X } from "lucide-react";

import { cn } from "@/lib/utils";

type Variant = "success" | "error" | "info";

type NotifyOptions = {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void | Promise<void>;
  variant?: Variant;
  duration?: number;
};

type Toast = NotifyOptions & { id: number };

const NotificationContext = createContext<{
  notify: (options: NotifyOptions) => void;
} | null>(null);

export function useNotification() {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error("useNotification 必須在 NotificationProvider 內使用");
  }
  return ctx;
}

let counter = 0;

const ICONS: Record<Variant, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
};

const ICON_COLOR: Record<Variant, string> = {
  success: "text-emerald-600",
  error: "text-destructive",
  info: "text-primary",
};

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const notify = useCallback(
    (options: NotifyOptions) => {
      const id = ++counter;
      setToasts((list) => [...list, { ...options, id }]);
      const duration = options.duration ?? (options.onAction ? 10000 : 6000);
      setTimeout(() => dismiss(id), duration);
    },
    [dismiss],
  );

  return (
    <NotificationContext.Provider value={{ notify }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 left-4 z-[60] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
        {toasts.map((t) => {
          const variant = t.variant ?? "success";
          const Icon = ICONS[variant];
          return (
            <div
              key={t.id}
              className="pointer-events-auto flex items-start gap-3 rounded-lg border bg-card p-3 shadow-lg"
            >
              <Icon className={cn("mt-0.5 size-5 shrink-0", ICON_COLOR[variant])} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{t.title}</div>
                {t.description ? (
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {t.description}
                  </div>
                ) : null}
                {t.actionLabel && t.onAction ? (
                  <button
                    type="button"
                    onClick={async () => {
                      await t.onAction?.();
                      dismiss(t.id);
                    }}
                    className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                  >
                    <Undo2 className="size-3.5" />
                    {t.actionLabel}
                  </button>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                aria-label="關閉"
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>
          );
        })}
      </div>
    </NotificationContext.Provider>
  );
}
