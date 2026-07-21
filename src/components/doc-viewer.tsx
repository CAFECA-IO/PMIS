"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";
import { Markdown } from "./markdown";

export type Doc = { key: string; label: string; content: string };

export function DocViewer({ docs }: { docs: Doc[] }) {
  const [active, setActive] = useState(docs[0]?.key);
  const current = docs.find((d) => d.key === active) ?? docs[0];

  return (
    <div>
      <div className="flex gap-1 border-b px-2">
        {docs.map((d) => (
          <button
            key={d.key}
            type="button"
            onClick={() => setActive(d.key)}
            className={cn(
              "-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
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
        <Markdown content={current.content} />
      </div>
    </div>
  );
}
