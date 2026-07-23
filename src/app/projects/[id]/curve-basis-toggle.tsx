"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { cn } from "@/lib/utils";

/**
 * 切換 S-Curve 計算基準（里程碑 / 分項工程），寫入 ?curve= 並保留其他查詢參數。
 */
export function CurveBasisToggle({ basis }: { basis: "MILESTONE" | "WORKITEM" }) {
  const pathname = usePathname();
  const router = useRouter();
  const params = useSearchParams();

  function set(value: "MILESTONE" | "WORKITEM") {
    const sp = new URLSearchParams(params.toString());
    if (value === "MILESTONE") sp.delete("curve");
    else sp.set("curve", "workitem");
    const qs = sp.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  const options: { key: "MILESTONE" | "WORKITEM"; label: string }[] = [
    { key: "MILESTONE", label: "里程碑" },
    { key: "WORKITEM", label: "分項工程" },
  ];

  return (
    <div className="inline-flex rounded-md border p-0.5 text-xs">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => set(o.key)}
          className={cn(
            "rounded px-2.5 py-1 font-medium transition-colors",
            basis === o.key
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
