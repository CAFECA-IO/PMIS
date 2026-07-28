"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Building2, Check, LayoutGrid, Search, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { projectStatusMeta } from "@/constant/pmis";
import type { ProjectOption } from "@/service/project.service";

/**
 * 專案切換對話框。
 *
 * 注意：以 portal 掛載到 document.body。側邊欄 <aside> 帶有 transform，
 * 會成為 position:fixed 子元素的定位基準，直接內嵌會導致遮罩與面板錯位。
 */
export function ProjectSwitchDialog({
  open,
  projects,
  selectedId,
  onSelect,
  onClose,
}: {
  open: boolean;
  projects: ProjectOption[];
  selectedId: string | null;
  onSelect: (id: string | "all") => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement | null>(null);
  const canPortal = typeof document !== "undefined";

  // 開啟時鎖住背景捲動、支援 Esc 關閉，並聚焦搜尋框
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const id = requestAnimationFrame(() => searchRef.current?.focus());
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      cancelAnimationFrame(id);
    };
  }, [open, onClose]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) =>
      [p.name, p.code, p.client, p.location, p.description]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [projects, query]);

  if (!open || !canPortal) return null;

  const period = (p: ProjectOption) =>
    p.startDate || p.endDate
      ? `${p.startDate ?? "—"} ~ ${p.endDate ?? "—"}`
      : null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center p-4 pt-[8vh]"
      role="dialog"
      aria-modal="true"
      aria-label="切換專案"
    >
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="animate-bubble-in relative z-10 flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border bg-card shadow-overlay">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <div className="flex items-center gap-2">
            <Building2 className="size-5 text-primary" />
            <h2 className="text-base font-semibold">切換專案</h2>
            <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              共 {projects.length} 件
            </span>
          </div>
          <button
            type="button"
            aria-label="關閉"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="border-b p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜尋專案名稱、編號、業主或地點…"
              className="pl-9"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-3">
          {/* 全部專案（清除篩選） */}
          <button
            type="button"
            onClick={() => onSelect("all")}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
              selectedId === null
                ? "border-primary bg-primary/5"
                : "hover:bg-accent",
            )}
          >
            <LayoutGrid className="size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">全部專案</div>
              <div className="text-xs text-muted-foreground">
                不限定單一專案，各模組顯示全部資料
              </div>
            </div>
            {selectedId === null ? (
              <Check className="size-4 shrink-0 text-primary" />
            ) : null}
          </button>

          {filtered.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              找不到符合「{query}」的專案。
            </p>
          ) : (
            filtered.map((p) => {
              const active = p.id === selectedId;
              const meta = projectStatusMeta[p.status];
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onSelect(p.id)}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
                    active
                      ? "border-primary bg-primary/5"
                      : "hover:bg-accent",
                  )}
                >
                  <Building2
                    className={cn(
                      "mt-0.5 size-4 shrink-0",
                      active ? "text-primary" : "text-muted-foreground",
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{p.name}</span>
                      {meta ? (
                        <Badge variant={meta.variant}>{meta.label}</Badge>
                      ) : null}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      <span className="tabular-nums">{p.code}</span>
                      {p.client ? <span>{p.client}</span> : null}
                      {p.location ? <span>{p.location}</span> : null}
                      {period(p) ? (
                        <span className="tabular-nums">{period(p)}</span>
                      ) : null}
                    </div>
                    {p.description ? (
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground/80">
                        {p.description}
                      </p>
                    ) : null}
                  </div>
                  {active ? (
                    <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                  ) : null}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
