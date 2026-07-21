"use client";

import { useEffect, useRef, useState } from "react";

let counter = 0;

export function Mermaid({ chart }: { chart: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "loose",
          theme: "neutral",
          fontFamily: "inherit",
        });
        const id = `mermaid-${counter++}`;
        const { svg } = await mermaid.render(id, chart);
        if (active && ref.current) ref.current.innerHTML = svg;
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      active = false;
    };
  }, [chart]);

  if (error) {
    return (
      <div className="my-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
        圖表無法呈現：{error}
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className="my-6 flex justify-center overflow-x-auto rounded-lg border bg-card p-4"
    />
  );
}
