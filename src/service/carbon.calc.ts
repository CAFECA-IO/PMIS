import type {
  CarbonScope,
  CarbonEntryStatus,
  CarbonIntensityBasis,
} from "@/generated/prisma/enums";

/**
 * Info: (20260721 - Luphia)
 * 純碳排計算工具，無 Prisma／DB 依賴，可獨立單元測試並於前端即時試算重用。
 */

export const CARBON_SCOPES: CarbonScope[] = ["SCOPE_1", "SCOPE_2", "SCOPE_3"];

function round(n: number, digits = 3): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

// Info: (20260721 - Luphia) 排放量 (kgCO₂e) = 活動數據 × 排放係數
export function computeCo2e(activityQty: number, factorValue: number): number {
  if (!Number.isFinite(activityQty) || !Number.isFinite(factorValue)) return 0;
  return round(activityQty * factorValue, 3);
}

export type EntryLike = {
  scope: CarbonScope;
  co2e: number; // kgCO₂e
  status: CarbonEntryStatus;
};

export type InventorySummary = {
  totalKg: number;
  totalTonnes: number;
  byScopeKg: Record<CarbonScope, number>;
  byScopeShare: Record<CarbonScope, number>; // percent 0-100
  entryCount: number;
  draftCount: number;
  confirmedCount: number;
  verifiedCount: number;
};

// Info: (20260721 - Luphia) 分範疇彙總、狀態統計
export function summarizeEntries(entries: EntryLike[]): InventorySummary {
  const byScopeKg: Record<CarbonScope, number> = {
    SCOPE_1: 0,
    SCOPE_2: 0,
    SCOPE_3: 0,
  };
  let total = 0;
  let draft = 0;
  let confirmed = 0;
  let verified = 0;

  for (const e of entries) {
    const v = Number.isFinite(e.co2e) ? e.co2e : 0;
    byScopeKg[e.scope] += v;
    total += v;
    if (e.status === "DRAFT") draft++;
    else if (e.status === "CONFIRMED") confirmed++;
    else if (e.status === "VERIFIED") verified++;
  }

  const byScopeShare: Record<CarbonScope, number> = {
    SCOPE_1: 0,
    SCOPE_2: 0,
    SCOPE_3: 0,
  };
  for (const s of CARBON_SCOPES) {
    byScopeKg[s] = round(byScopeKg[s], 3);
    byScopeShare[s] = total > 0 ? round((byScopeKg[s] / total) * 100, 1) : 0;
  }

  return {
    totalKg: round(total, 3),
    totalTonnes: round(total / 1000, 3),
    byScopeKg,
    byScopeShare,
    entryCount: entries.length,
    draftCount: draft,
    confirmedCount: confirmed,
    verifiedCount: verified,
  };
}

export type IntensityInput = {
  totalTonnes: number;
  basis: CarbonIntensityBasis;
  budget?: number | null; // 契約金額 (TWD)
  floorArea?: number | null; // m²
  durationMonths?: number | null;
};

export type Intensity = {
  basis: CarbonIntensityBasis;
  value: number | null; // null = 缺分母資料
  unit: string;
  denominator: number | null;
};

// Info: (20260721 - Luphia) 碳排強度 = 總排放 (tCO₂e) / 分母（依基準切換，預設契約金額）
export function computeIntensity(input: IntensityInput): Intensity {
  const t = input.totalTonnes;
  switch (input.basis) {
    case "FLOOR_AREA": {
      const d = input.floorArea ?? null;
      return {
        basis: input.basis,
        denominator: d,
        unit: "tCO₂e / m²",
        value: d && d > 0 ? round(t / d, 4) : null,
      };
    }
    case "DURATION": {
      const d = input.durationMonths ?? null;
      return {
        basis: input.basis,
        denominator: d,
        unit: "tCO₂e / 月",
        value: d && d > 0 ? round(t / d, 3) : null,
      };
    }
    case "CONTRACT_AMOUNT":
    default: {
      const d = input.budget ?? null;
      return {
        basis: "CONTRACT_AMOUNT",
        denominator: d,
        unit: "tCO₂e / 百萬元",
        value: d && d > 0 ? round(t / (d / 1_000_000), 4) : null,
      };
    }
  }
}

// Info: (20260721 - Luphia) 對比基準/目標的達成狀態（用於總覽燈號）
export function assessTarget(
  totalTonnes: number,
  targetCo2e: number | null | undefined,
): { overTarget: boolean; gap: number | null } {
  if (targetCo2e == null) return { overTarget: false, gap: null };
  return {
    overTarget: totalTonnes > targetCo2e,
    gap: round(totalTonnes - targetCo2e, 3),
  };
}
