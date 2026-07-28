"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  obligationRiskOptions,
  obligationStageOptions,
  obligationStatusOptions,
} from "@/constant/obligation";

/**
 * 篩選條件在本地暫存，按下「套用篩選」才寫入 URL 查詢字串。
 * 條件放在 URL 上，重新整理與分享連結都會保留同一份檢視。
 */
export type ObligationFilterState = {
  project: string;
  q: string;
  stage: string;
  risk: string;
  status: string;
};

const EMPTY: ObligationFilterState = {
  project: "all",
  q: "",
  stage: "all",
  risk: "all",
  status: "all",
};

export function ObligationFilterBar({
  projects,
  initial,
}: {
  projects: { id: string; name: string }[];
  initial: ObligationFilterState;
}) {
  const router = useRouter();
  const [state, setState] = useState<ObligationFilterState>(initial);

  function apply(next: ObligationFilterState) {
    const sp = new URLSearchParams();
    if (next.project !== "all") sp.set("project", next.project);
    if (next.q.trim()) sp.set("q", next.q.trim());
    if (next.stage !== "all") sp.set("stage", next.stage);
    if (next.risk !== "all") sp.set("risk", next.risk);
    if (next.status !== "all") sp.set("status", next.status);
    const qs = sp.toString();
    router.push(qs ? `/obligations?${qs}` : "/obligations");
  }

  const set = <K extends keyof ObligationFilterState>(
    key: K,
    value: ObligationFilterState[K],
  ) => setState((prev) => ({ ...prev, [key]: value }));

  const dirty = JSON.stringify(state) !== JSON.stringify(EMPTY);

  return (
    <form
      className="grid grid-cols-1 gap-2 rounded-lg border bg-card p-3 @[560px]:grid-cols-2 @[1080px]:grid-cols-[minmax(180px,1fr)_minmax(200px,1.4fr)_140px_130px_140px_auto]"
      onSubmit={(e) => {
        e.preventDefault();
        apply(state);
      }}
    >
      <Select
        aria-label="專案"
        value={state.project}
        onChange={(e) => set("project", e.target.value)}
      >
        <option value="all">全部專案</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </Select>

      <Input
        aria-label="關鍵字"
        placeholder="搜尋事項名稱、編號、契約依據或責任人"
        value={state.q}
        onChange={(e) => set("q", e.target.value)}
      />

      <Select
        aria-label="階段"
        value={state.stage}
        onChange={(e) => set("stage", e.target.value)}
      >
        <option value="all">全部階段</option>
        {obligationStageOptions.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>

      <Select
        aria-label="風險"
        value={state.risk}
        onChange={(e) => set("risk", e.target.value)}
      >
        <option value="all">全部風險</option>
        {obligationRiskOptions.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>

      <Select
        aria-label="狀態"
        value={state.status}
        onChange={(e) => set("status", e.target.value)}
      >
        <option value="all">全部狀態</option>
        {obligationStatusOptions.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>

      <div className="flex items-center gap-2">
        <Button type="submit" className="flex-1">
          <Search className="size-4" />
          套用篩選
        </Button>
        {dirty ? (
          <Button
            type="button"
            variant="outline"
            aria-label="清除篩選"
            onClick={() => {
              setState(EMPTY);
              apply(EMPTY);
            }}
          >
            <RotateCcw className="size-4" />
          </Button>
        ) : null}
      </div>
    </form>
  );
}
