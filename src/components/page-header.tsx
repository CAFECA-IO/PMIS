import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * 頁首採「區塊標籤 → 標題 → 說明」三層。
 * 區塊標籤（eyebrow）讓使用者知道自己在哪一個功能分區，
 * 以中性底色的小圓角標籤呈現，不搶標題的注意力。
 */
export function PageHeader({
  section,
  title,
  description,
  action,
  className,
}: {
  /** 所屬功能分區，如「02 契約與時程管理」。 */
  section?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-end justify-between gap-4 border-b px-4 py-5 sm:px-8 sm:py-7",
        className,
      )}
    >
      <div className="min-w-0">
        {section ? (
          <span className="mb-2.5 inline-flex items-center rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
            {section}
          </span>
        ) : null}
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {title}
        </h1>
        {description ? (
          <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {action}
    </div>
  );
}
