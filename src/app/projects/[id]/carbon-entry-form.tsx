"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { computeCo2e } from "@/service/carbon.calc";
import { carbonScopeOptions } from "@/constant/pmis";
import type { CarbonScope } from "@/generated/prisma/enums";
import type { FactorOption } from "@/service/carbon.service";
import { addEntryAction } from "./carbon-actions";

export function CarbonEntryForm({
  projectId,
  inventoryId,
  options,
}: {
  projectId: string;
  inventoryId: string;
  options: FactorOption[];
}) {
  const firstScope = (options[0]?.scope ?? "SCOPE_1") as CarbonScope;
  const [scope, setScope] = useState<CarbonScope>(firstScope);
  const categoriesForScope = useMemo(
    () => options.filter((o) => o.scope === scope),
    [options, scope],
  );
  const [categoryId, setCategoryId] = useState(
    categoriesForScope[0]?.categoryId ?? "",
  );
  const selected =
    options.find((o) => o.categoryId === categoryId) ?? categoriesForScope[0];
  const [qty, setQty] = useState("");
  const [unit, setUnit] = useState(selected?.unit ?? "");

  const factorValue = selected?.factorValue ?? 0;
  const preview = computeCo2e(Number(qty) || 0, factorValue);

  function onScopeChange(next: CarbonScope) {
    setScope(next);
    const first = options.find((o) => o.scope === next);
    setCategoryId(first?.categoryId ?? "");
    setUnit(first?.unit ?? "");
  }

  function onCategoryChange(id: string) {
    setCategoryId(id);
    const opt = options.find((o) => o.categoryId === id);
    if (opt) setUnit(opt.unit);
  }

  return (
    <form
      action={addEntryAction}
      className="grid grid-cols-1 gap-4 rounded-lg border bg-muted/30 p-4 sm:grid-cols-2"
    >
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="inventoryId" value={inventoryId} />

      <div className="space-y-1.5">
        <Label htmlFor="c-scope">範疇</Label>
        <Select
          id="c-scope"
          name="scope"
          value={scope}
          onChange={(e) => onScopeChange(e.target.value as CarbonScope)}
        >
          {carbonScopeOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="c-category">排放源類別</Label>
        <Select
          id="c-category"
          name="categoryId"
          value={categoryId}
          onChange={(e) => onCategoryChange(e.target.value)}
        >
          {categoriesForScope.length === 0 ? (
            <option value="">（此範疇尚無類別）</option>
          ) : (
            categoriesForScope.map((o) => (
              <option key={o.categoryId} value={o.categoryId}>
                {o.name}（{o.factorValue} kgCO₂e/{o.unit}）
              </option>
            ))
          )}
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="c-qty">活動數據</Label>
        <Input
          id="c-qty"
          name="activityQty"
          type="number"
          step="any"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          placeholder="數量"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="c-unit">單位</Label>
        <Input
          id="c-unit"
          name="activityUnit"
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="c-date">活動發生日</Label>
        <Input id="c-date" name="occurredAt" type="date" />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="c-evidence">憑證連結</Label>
        <Input id="c-evidence" name="evidenceUrl" placeholder="https://…" />
      </div>

      <div className="flex items-center justify-between rounded-md border bg-card px-3 py-2 text-sm sm:col-span-2">
        <span className="text-muted-foreground">即時試算</span>
        <span className="font-semibold tabular-nums">
          ≈ {preview.toLocaleString()} kgCO₂e
          <span className="ml-1 text-xs text-muted-foreground">
            （{(preview / 1000).toFixed(3)} tCO₂e）
          </span>
        </span>
      </div>

      <div className="sm:col-span-2">
        <Button type="submit" variant="secondary" disabled={!categoryId || !qty}>
          <Plus className="size-4" />
          新增活動數據
        </Button>
      </div>
    </form>
  );
}
