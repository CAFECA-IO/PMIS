"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Select } from "@/components/ui/select";

/**
 * Info: (20260721 - Luphia)
 * 各模組頁共用的專案篩選器。寫入 `?project=<id>`（全部則清除），並保留其他查詢參數（如 tab）。
 */
export function ProjectSwitcher({
  projects,
  selected,
}: {
  projects: { id: string; name: string }[];
  selected?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const params = useSearchParams();

  return (
    <Select
      className="w-56"
      value={selected ?? "all"}
      onChange={(e) => {
        const v = e.target.value;
        const sp = new URLSearchParams(params.toString());
        if (v === "all") sp.delete("project");
        else sp.set("project", v);
        const qs = sp.toString();
        router.push(qs ? `${pathname}?${qs}` : pathname);
      }}
    >
      <option value="all">全部專案</option>
      {projects.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </Select>
  );
}
