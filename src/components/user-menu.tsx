"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, LogOut, Mail } from "lucide-react";

import type { AccountRole } from "@/generated/prisma/enums";
import { accountRoleMeta } from "@/constant/people";
import { logoutAction } from "@/app/login/actions";
import { cn } from "@/lib/utils";
import {
  HEADER_PANEL_OVERLAY,
  HEADER_PANEL_POSITION,
} from "@/lib/overlay";

/**
 * 頂列的登入者資訊。
 *
 * 桌機直接顯示姓名與職稱；手機空間不足只顯示頭像，點開後於下拉中呈現，
 * 兩者都能立即看出「目前以誰的身分登入」。
 * 下拉以 portal 掛載，避免被 header 的 overflow 或堆疊順序裁切。
 */
export function UserMenu({
  user,
}: {
  user: { name: string; email: string; role: AccountRole };
}) {
  const [open, setOpen] = useState(false);
  const canPortal = typeof document !== "undefined";
  const roleLabel = accountRoleMeta[user.role].label;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`登入身分：${user.name}（${roleLabel}）`}
        aria-expanded={open}
        className={cn(
          "flex shrink-0 items-center gap-2 rounded-md py-1 pl-1 pr-1 transition-colors hover:bg-accent sm:pr-2",
          open && "bg-accent",
        )}
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
          {user.name.slice(0, 1)}
        </span>
        {/* 桌機直接把姓名與職稱攤開 */}
        <span className="hidden min-w-0 text-left leading-tight sm:block">
          <span className="block truncate text-sm font-medium">{user.name}</span>
          <span className="block truncate text-[11px] text-muted-foreground">
            {roleLabel}
          </span>
        </span>
        <ChevronDown
          className={cn(
            "hidden size-3.5 shrink-0 text-muted-foreground/60 transition-transform sm:block",
            open && "rotate-180",
          )}
        />
      </button>

      {open && canPortal
        ? createPortal(
            <>
              <div
                className={HEADER_PANEL_OVERLAY}
                onClick={() => setOpen(false)}
              />
              <div
                role="dialog"
                aria-label="帳號"
                // 定位與系統通知共用同一份定義，確保兩者對齊（見 lib/overlay）
                className={cn(
                  HEADER_PANEL_POSITION,
                  "animate-pane-slide-up w-[min(16rem,calc(100vw-1rem))] overflow-hidden rounded-xl border bg-card shadow-overlay",
                )}
              >
                <div className="flex items-center gap-3 border-b px-4 py-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                    {user.name.slice(0, 1)}
                  </span>
                  <div className="min-w-0 leading-tight">
                    <div className="truncate text-sm font-semibold">
                      {user.name}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {roleLabel}
                    </div>
                  </div>
                </div>
                <div className="border-b px-4 py-2.5">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Mail className="size-3.5 shrink-0" />
                    <span className="truncate">{user.email}</span>
                  </div>
                </div>
                <form action={logoutAction}>
                  <button
                    type="submit"
                    className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    <LogOut className="size-4 shrink-0" />
                    登出
                  </button>
                </form>
              </div>
            </>,
            document.body,
          )
        : null}
    </>
  );
}
