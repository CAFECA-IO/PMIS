"use client";

import { useRouter } from "next/navigation";

import { Select } from "@/components/ui/select";

export function CarbonProjectSwitcher({
  projects,
  selected,
}: {
  projects: { id: string; name: string }[];
  selected?: string;
}) {
  const router = useRouter();
  return (
    <Select
      className="w-64"
      value={selected ?? "all"}
      onChange={(e) => {
        const v = e.target.value;
        router.push(v === "all" ? "/carbon" : `/carbon?project=${v}`);
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
