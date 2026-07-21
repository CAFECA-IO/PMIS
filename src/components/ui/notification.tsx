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
import { useAiAssistant } from "@/components/ai-assistant-context";

type Variant = "success" | "error" | "info";

type NotifyOptions = {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void | Promise<void>;
  variant?: Variant;
  duration?: number;
};

type Toast = NotifyOptions & { id: number; exiting?: boolean };

const EXIT_MS = 220; // Info: (20260721 - Luphia) 需與 .animate-bubble-out 時長一致

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
  const { expanded } = useAiAssistant();

  const remove = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  // Info: (20260721 - Luphia) Mark the toast as exiting to play the fade-out, then remove it from the DOM.
  const dismiss = useCallback(
    (id: number) => {
      setToasts((list) =>
        list.map((t) => (t.id === id ? { ...t, exiting: true } : t)),
      );
      setTimeout(() => remove(id), EXIT_MS);
    },
    [remove],
  );

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
      {/* Info: (20260721 - Luphia) 對話氣泡通知，錨定於右下角 AI 助理旁；助理卡展開時自動上移避開 */}
      <div
        className="pointer-events-none fixed right-6 z-[60] flex w-80 max-w-[calc(100vw-3rem)] flex-col items-end gap-2.5 transition-[bottom] duration-300 ease-out"
        style={{ bottom: expanded ? "calc(600px + 2.25rem)" : "6rem" }}
      >
        {toasts.map((t) => {
          const variant = t.variant ?? "success";
          const Icon = ICONS[variant];
          return (
            <div
              key={t.id}
              className={cn(
                "pointer-events-auto relative w-full rounded-2xl rounded-br-md border bg-card px-3.5 py-2.5 shadow-lg",
                t.exiting ? "animate-bubble-out" : "animate-bubble-in",
              )}
            >
              <div className="flex items-start gap-2.5">
                <Icon
                  className={cn("mt-0.5 size-4 shrink-0", ICON_COLOR[variant])}
                />
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
                  className="-mr-1 -mt-0.5 text-muted-foreground hover:text-foreground"
                >
                  <X className="size-4" />
                </button>
              </div>
              {/* Info: (20260721 - Luphia) bubble tail pointing toward the assistant below */}
              <span className="absolute -bottom-1 right-6 size-2.5 rotate-45 border-b border-r bg-card" />
            </div>
          );
        })}
      </div>
    </NotificationContext.Provider>
  );
}
