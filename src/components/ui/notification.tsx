"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import {
  CheckCircle2,
  AlertCircle,
  Info,
  Loader2,
  Sparkles,
  Undo2,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import {
  TOAST_BOTTOM,
  TOAST_RIGHT_COLLAPSED,
  TOAST_RIGHT_EXPANDED,
} from "@/lib/faith-dock";
import { useAiAssistant } from "@/components/ai-assistant-context";

type Variant = "success" | "error" | "info";

type NotifyOptions = {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void | Promise<void>;
  /**
   * 動作按鈕的圖示。預設 undo（復原語意）；
   * 主動提議協助這類「往前一步」的動作應用 sparkles，否則語意相反。
   */
  actionIcon?: "undo" | "sparkles";
  variant?: Variant;
  duration?: number;
};

type Toast = NotifyOptions & {
  id: number;
  exiting?: boolean;
  /** 進行中的通知：不自動關閉，顯示轉圈與進度。 */
  pendingWork?: boolean;
  /** 0–100；undefined 表示不顯示進度條。 */
  percent?: number;
};

/**
 * 進行中通知的控制權柄。
 * 長時間工作（如整包上傳）需要「同一則通知持續更新」而非連發多則，
 * 否則右下角會被十幾則進度訊息塞滿。
 */
export type ProgressHandle = {
  update: (patch: { title?: string; description?: string; percent?: number }) => void;
  /** 轉為一般（會自動關閉）的結果通知。 */
  settle: (options: NotifyOptions) => void;
  dismiss: () => void;
};

const EXIT_MS = 220; // Info: (20260721 - Luphia) 需與 .animate-bubble-out 時長一致

/**
 * 一則通知的權柄。
 *
 * 邀請型通知（如「需要費思協助嗎」）必須能被撤回：使用者可能改由別的入口
 * 接受邀請（點右下角的費思、或費思已展開而自動接手），此時通知的內容
 * 已經過期，卻仍留在畫面上邀請一件正在進行中的事。
 * 先前 notify 不回傳任何東西，除了它自己的計時器與動作按鈕，
 * 沒有人有辦法讓它消失。
 */
export type ToastHandle = { dismiss: () => void };

const NotificationContext = createContext<{
  notify: (options: NotifyOptions) => ToastHandle;
  notifyProgress: (options: {
    title: string;
    description?: string;
    percent?: number;
  }) => ProgressHandle;
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
  success: "text-success",
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
    (options: NotifyOptions): ToastHandle => {
      const id = ++counter;
      setToasts((list) => [...list, { ...options, id }]);
      const duration = options.duration ?? (options.onAction ? 10000 : 6000);
      const timer = setTimeout(() => dismiss(id), duration);
      return {
        dismiss: () => {
          // 一併清掉計時器，否則撤回後計時器仍會再跑一次 dismiss
          clearTimeout(timer);
          dismiss(id);
        },
      };
    },
    [dismiss],
  );

  /** 開一則不自動關閉的進行中通知，並回傳更新與收尾的權柄。 */
  const notifyProgress = useCallback(
    (options: { title: string; description?: string; percent?: number }) => {
      const id = ++counter;
      setToasts((list) => [
        ...list,
        { ...options, id, pendingWork: true, variant: "info" },
      ]);

      const patchToast = (patch: Partial<Toast>) => {
        setToasts((list) =>
          list.map((t) => (t.id === id ? { ...t, ...patch } : t)),
        );
      };

      return {
        update: (patch) => patchToast(patch),
        settle: (final: NotifyOptions) => {
          // 沿用同一則通知的位置收尾，使用者的視線不必轉移
          patchToast({
            ...final,
            pendingWork: false,
            percent: undefined,
          });
          setTimeout(() => dismiss(id), final.duration ?? 6000);
        },
        dismiss: () => dismiss(id),
      } satisfies ProgressHandle;
    },
    [dismiss],
  );

  return (
    <NotificationContext.Provider value={{ notify, notifyProgress }}>
      {children}
      {/*
        對話氣泡通知，錨定於右下角費思按鈕之上。
        費思展開後往左退到面板之外 —— 先前是往上跳 600px，那是費思還是
        浮動卡片時的高度；改成全高的右側欄之後，往上移不會離開它的範圍，
        通知只是跑到畫面中央而已。
      */}
      <div
        className={cn(
          "pointer-events-none fixed z-[60] flex w-80 max-w-[calc(100vw-3rem)] flex-col items-end gap-2.5 transition-[right,bottom] duration-300 ease-out",
          expanded ? TOAST_RIGHT_EXPANDED : TOAST_RIGHT_COLLAPSED,
        )}
        style={{ bottom: TOAST_BOTTOM }}
      >
        {toasts.map((t) => {
          const variant = t.variant ?? "success";
          const Icon = ICONS[variant];
          return (
            <div
              key={t.id}
              className={cn(
                "pointer-events-auto relative w-full rounded-2xl rounded-br-md border bg-card px-3.5 py-2.5 shadow-overlay",
                t.exiting ? "animate-bubble-out" : "animate-bubble-in",
              )}
            >
              <div className="flex items-start gap-2.5">
                {t.pendingWork ? (
                  <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-primary" />
                ) : (
                  <Icon
                    className={cn("mt-0.5 size-4 shrink-0", ICON_COLOR[variant])}
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{t.title}</div>
                  {t.description ? (
                    // whitespace-pre-line：失敗清單以換行分項，需保留斷行
                    <div className="mt-0.5 whitespace-pre-line text-xs text-muted-foreground">
                      {t.description}
                    </div>
                  ) : null}
                  {t.pendingWork && t.percent !== undefined ? (
                    <div
                      className="mt-2 h-1 w-full overflow-hidden rounded-full bg-muted"
                      role="progressbar"
                      aria-valuenow={t.percent}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    >
                      <div
                        className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
                        style={{ width: `${t.percent}%` }}
                      />
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
                      {t.actionIcon === "sparkles" ? (
                        <Sparkles className="size-3.5" />
                      ) : (
                        <Undo2 className="size-3.5" />
                      )}
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
