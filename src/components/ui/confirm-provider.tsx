"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { Button } from "./button";

// Info: (20260721 - Luphia) 統一確認對話框：以 useConfirm() 取得回傳 Promise<boolean> 的 confirm
type ConfirmOptions = {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};

const ConfirmContext = createContext<{
  confirm: (options: ConfirmOptions) => Promise<boolean>;
} | null>(null);

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm 必須在 ConfirmProvider 內使用");
  return ctx.confirm;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const [pending, setPending] = useState(false);
  const resolver = useRef<((v: boolean) => void) | null>(null);

  const confirm = useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
      setPending(false);
      setOptions(opts);
    });
  }, []);

  const settle = (value: boolean) => {
    resolver.current?.(value);
    resolver.current = null;
    setOptions(null);
    setPending(false);
  };

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {options ? (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => settle(false)}
            aria-hidden
          />
          <div className="relative z-10 w-full max-w-sm rounded-lg border bg-card p-6 shadow-xl">
            <h2 className="text-base font-semibold">{options.title}</h2>
            {options.description ? (
              <div className="mt-2 text-sm text-muted-foreground">
                {options.description}
              </div>
            ) : null}
            <div className="mt-6 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => settle(false)}
              >
                {options.cancelLabel ?? "取消"}
              </Button>
              <Button
                type="button"
                variant={options.danger ? "destructive" : "default"}
                disabled={pending}
                onClick={() => {
                  setPending(true);
                  settle(true);
                }}
              >
                {options.confirmLabel ?? "確認"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </ConfirmContext.Provider>
  );
}
