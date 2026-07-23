"use client";

import { useMemo, useState } from "react";

import { cn } from "@/lib/utils";
import { extractToc } from "@/lib/doc-toc";
import { Markdown } from "./markdown";

export type Doc = {
  key: string;
  label: string;
  description?: string;
  content: string;
};

export function DocViewer({ docs }: { docs: Doc[] }) {
  const [active, setActive] = useState(docs[0]?.key);
  const current = docs.find((d) => d.key === active) ?? docs[0];
  const toc = useMemo(() => extractToc(current?.content ?? ""), [current]);

  if (!current) return null;

  return (
    <div>
      {/* 分頁列（黏頂） */}
      <div className="sticky top-0 z-10 flex gap-1 overflow-x-auto border-b bg-card px-2">
        {docs.map((d) => (
          <button
            key={d.key}
            type="button"
            onClick={() => setActive(d.key)}
            className={cn(
              "-mb-px shrink-0 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
              d.key === current.key
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {d.label}
          </button>
        ))}
      </div>

      <div className="p-6 sm:p-8">
        {current.description ? (
          <p className="mb-6 border-l-2 border-primary/40 pl-3 text-sm text-muted-foreground">
            {current.description}
          </p>
        ) : null}

        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_14rem] lg:gap-10">
          <div className="min-w-0">
            <Markdown content={current.content} />
          </div>

          {toc.length > 1 ? (
            <aside className="hidden lg:block">
              <nav
                aria-label="章節目錄"
                className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto border-l pl-4"
              >
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  本頁章節
                </p>
                <ul className="space-y-1.5 text-sm">
                  {toc.map((item, i) => (
                    <li key={`${item.id}-${i}`}>
                      <a
                        href={`#${item.id}`}
                        className={cn(
                          "block text-muted-foreground transition-colors hover:text-primary",
                          item.level === 3 && "pl-3 text-[0.8125rem]",
                        )}
                      >
                        {item.text}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            </aside>
          ) : null}
        </div>
      </div>
    </div>
  );
}
