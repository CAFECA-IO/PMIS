"use client";

import { useState, type ReactNode } from "react";

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

  const canConfirm = !requireText || typed === requireText;

  function close() {
    setOpen(false);
    setTyped("");
  }

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
          <div className="relative z-10 w-full max-w-md rounded-lg border bg-card p-6 shadow-overlay">
            <h2 className="text-lg font-semibold">{title}</h2>
            {description ? (
              <div className="mt-2 text-sm text-muted-foreground">
                {description}
              </div>
            ) : null}

            {requireText ? (
              <div className="mt-4 space-y-2">
                <label className="text-sm text-muted-foreground">
                  請輸入{" "}
                  <span className="rounded bg-muted px-1.5 py-0.5 font-mono font-semibold text-foreground">
                    {requireText}
                  </span>{" "}
                  以確認
                </label>
                <Input
                  autoFocus
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  placeholder={requireText}
                  className={cn(
                    typed && !canConfirm && "border-destructive",
                  )}
                />
              </div>
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
