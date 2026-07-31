"use client";

import {
  useCallback,
  useEffect,
  useId,
  useState,
  type ReactNode,
} from "react";

import { cn } from "@/lib/utils";
import { Button } from "./button";
import { Input } from "./input";

type ButtonVariant =
  | "default"
  | "destructive"
  | "outline"
  | "secondary"
  | "ghost"
  | "link";

/**
 * Reusable confirmation dialog that submits a server action on confirm.
 * Optionally requires the user to type `requireText` (e.g. "DELETE") first.
 */
export function ConfirmForm({
  action,
  onConfirm,
  hidden = {},
  title,
  description,
  triggerLabel,
  triggerIcon,
  triggerVariant = "default",
  triggerSize,
  confirmLabel = "確認",
  confirmVariant = "default",
  requireText,
}: {
  action?: (formData: FormData) => void | Promise<void>;
  onConfirm?: () => void | Promise<void>;
  hidden?: Record<string, string>;
  title: string;
  description?: ReactNode;
  triggerLabel: string;
  triggerIcon?: ReactNode;
  triggerVariant?: ButtonVariant;
  triggerSize?: "default" | "sm" | "lg" | "icon";
  confirmLabel?: string;
  confirmVariant?: ButtonVariant;
  requireText?: string;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [pending, setPending] = useState(false);
  /*
    同一頁可能同時存在多個確認框（例如清單每列一個），
    寫死 id 會讓 label 指到第一個欄位 —— 點文字時焦點跑到別列去。
  */
  const inputId = `${useId()}confirm-text`;

  const canConfirm = !requireText || typed === requireText;

  const close = useCallback(() => {
    setOpen(false);
    setTyped("");
  }, []);

  /*
    Esc 取消。
    這是破壞性操作的對話框，卻只能用滑鼠點背景或取消才關得掉 ——
    鍵盤操作者會被困在裡面。與 ConfirmProvider 的行為一致。
  */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || pending) return;
      e.stopPropagation();
      close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, pending, close]);

  return (
    <>
      <Button
        type="button"
        variant={triggerVariant}
        size={triggerSize}
        onClick={() => setOpen(true)}
      >
        {triggerIcon}
        {triggerLabel}
      </Button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div
            className="absolute inset-0 bg-black/50"
            onClick={close}
            aria-hidden
          />
          {/*
            max-h + overflow：說明文字可能很長（專案全名動輒二三十字，
            再加上一句會刪掉哪些東西）。在筆電的視窗高度下，
            少了這兩個類別，最下面的取消／刪除會被推到視窗外而按不到。
          */}
          <div className="relative z-10 flex max-h-[90vh] w-full max-w-md flex-col overflow-y-auto rounded-lg border bg-card p-6 shadow-overlay">
            <h2 className="text-lg font-semibold">{title}</h2>
            {description ? (
              /* break-words：契約編號這類長字串不會換行，會把對話框撐破 */
              <div className="mt-2 break-words text-sm text-muted-foreground">
                {description}
              </div>
            ) : null}

            {requireText ? (
              <RequireTextField
                id={inputId}
                requireText={requireText}
                value={typed}
                onChange={setTyped}
              />
            ) : null}

            {onConfirm ? (
              <div className="mt-6 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={close}
                  disabled={pending}
                >
                  取消
                </Button>
                <Button
                  type="button"
                  variant={confirmVariant}
                  disabled={!canConfirm || pending}
                  onClick={async () => {
                    setPending(true);
                    try {
                      await onConfirm();
                      close();
                    } finally {
                      setPending(false);
                    }
                  }}
                >
                  {pending ? "處理中…" : confirmLabel}
                </Button>
              </div>
            ) : (
              <form action={action} className="mt-6 flex justify-end gap-2">
                {Object.entries(hidden).map(([k, v]) => (
                  <input key={k} type="hidden" name={k} value={v} />
                ))}
                <Button type="button" variant="outline" onClick={close}>
                  取消
                </Button>
                <Button
                  type="submit"
                  variant={confirmVariant}
                  disabled={!canConfirm}
                >
                  {confirmLabel}
                </Button>
              </form>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}

/**
 * 「請輸入 DELETE 以確認」的欄位。
 *
 * 抽成獨立元件的理由是可驗證：它先前的破版（灰底標籤的背景框撐出行高）
 * 只有真的算出版面才看得出來，而確認框的內容只在開啟後才存在，
 * 在沒有 DOM 的環境裡渲染不到。抽出來就能單獨渲染並比對結構。
 */
export function RequireTextField({
  id,
  requireText,
  value,
  onChange,
}: {
  id: string;
  requireText: string;
  value: string;
  onChange: (next: string) => void;
}) {
  const mismatch = value.length > 0 && value !== requireText;

  return (
    <div className="mt-4 space-y-1.5">
      {/*
        label 用 flex 而非行內文字：那個灰底的 DELETE 是個有上下內距的
        行內元素，塞在行內 label 裡時它的背景框會撐出行高之外，
        看起來像壓到隔壁的字。改成 flex 後由容器決定對齊。
      */}
      <label
        htmlFor={id}
        className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground"
      >
        請輸入
        <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs font-semibold leading-5 text-foreground">
          {requireText}
        </span>
        以確認
      </label>
      <Input
        id={id}
        autoFocus
        autoComplete="off"
        spellCheck={false}
        aria-invalid={mismatch}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn("font-mono", mismatch && "border-destructive")}
      />
      {/*
        不放 placeholder。
        先前的 placeholder 就是 requireText 本身 —— 欄位看起來已經填好了，
        而「刪除」卻是停用的，使用者只會反覆點那顆按鈕。
        改為在輸入不符時明說原因。
      */}
      {mismatch ? (
        <p className="text-xs text-destructive">
          需與 {requireText} 完全相同（區分大小寫）
        </p>
      ) : null}
    </div>
  );
}
