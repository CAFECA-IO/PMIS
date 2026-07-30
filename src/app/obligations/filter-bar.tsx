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
import { obligationFilterHref } from "@/service/obligation-view";

/**
 * 篩選條件在本地暫存，按下「套用篩選」才寫入 URL 查詢字串。
 * 條件放在 URL 上，重新整理與分享連結都會保留同一份檢視。
 *
 * 專案不在這裡切換 —— 全系統統一由左上角選單指定目前專案，
 * 這條篩選只負責事項本身的條件，並把專案參數原樣帶過去。
 */
export type ObligationFilterState = {
  q: string;
  stage: string;
  risk: string;
  status: string;
};

const EMPTY: ObligationFilterState = {
  q: "",
  stage: "all",
  risk: "all",
  status: "all",
};

export function ObligationFilterBar({
  project,
  initial,
}: {
  /** 目前專案；由網址而非本元件決定 */
  project: string | null;
  initial: ObligationFilterState;
}) {
  const router = useRouter();
  const [state, setState] = useState<ObligationFilterState>(initial);

  function apply(next: ObligationFilterState) {
    router.push(obligationFilterHref(project, next));
  }

  const set = <K extends keyof ObligationFilterState>(
    key: K,
    value: ObligationFilterState[K],
  ) => setState((prev) => ({ ...prev, [key]: value }));

  const dirty = JSON.stringify(state) !== JSON.stringify(EMPTY);

  return (
    <form
      className="grid grid-cols-1 gap-2 rounded-lg border bg-card p-3 @[560px]:grid-cols-2 @[1080px]:grid-cols-[minmax(220px,1.6fr)_140px_130px_140px_auto]"
      onSubmit={(e) => {
        e.preventDefault();
        apply(state);
      }}
    >
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
