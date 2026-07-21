"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Select } from "@/components/ui/select";

/**
 * Project filter shared across module pages. Writes `?project=<id>` (or clears
 * it for 全部) while preserving other query params (e.g. tab).
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
