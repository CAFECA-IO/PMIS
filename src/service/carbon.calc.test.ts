import { test } from "node:test";
import assert from "node:assert/strict";

import {
  computeCo2e,
  summarizeEntries,
  computeIntensity,
  assessTarget,
  type EntryLike,
} from "./carbon.calc";

test("computeCo2e 基本乘積", () => {
  assert.equal(computeCo2e(42000, 2.606), 109452);
  assert.equal(computeCo2e(0, 5), 0);
});

test("computeCo2e 對非有限值回傳 0", () => {
  assert.equal(computeCo2e(Number.NaN, 2), 0);
  assert.equal(computeCo2e(10, Number.POSITIVE_INFINITY), 0);
});

const sample: EntryLike[] = [
  { scope: "SCOPE_1", co2e: 100000, status: "CONFIRMED" },
  { scope: "SCOPE_2", co2e: 50000, status: "DRAFT" },
  { scope: "SCOPE_3", co2e: 350000, status: "VERIFIED" },
];

test("summarizeEntries 分範疇與狀態統計", () => {
  const s = summarizeEntries(sample);
  assert.equal(s.totalKg, 500000);
  assert.equal(s.totalTonnes, 500);
  assert.equal(s.byScopeKg.SCOPE_1, 100000);
  assert.equal(s.byScopeKg.SCOPE_3, 350000);
  assert.equal(s.entryCount, 3);
  assert.equal(s.draftCount, 1);
  assert.equal(s.confirmedCount, 1);
  assert.equal(s.verifiedCount, 1);
  // 占比加總約 100
  const shareSum =
    s.byScopeShare.SCOPE_1 + s.byScopeShare.SCOPE_2 + s.byScopeShare.SCOPE_3;
  assert.ok(Math.abs(shareSum - 100) < 0.5);
});

test("summarizeEntries 空清單", () => {
  const s = summarizeEntries([]);
  assert.equal(s.totalKg, 0);
  assert.equal(s.byScopeShare.SCOPE_1, 0);
  assert.equal(s.entryCount, 0);
});

test("computeIntensity 預設契約金額 (tCO₂e/百萬元)", () => {
  const r = computeIntensity({
    totalTonnes: 500,
    basis: "CONTRACT_AMOUNT",
    budget: 4_850_000_000,
  });
  assert.equal(r.unit, "tCO₂e / 百萬元");
  // 500 / (4850e6 / 1e6) = 500 / 4850 ≈ 0.1031
  assert.ok(Math.abs((r.value ?? 0) - 0.1031) < 0.001);
});

test("computeIntensity 缺分母回傳 null", () => {
  const r = computeIntensity({ totalTonnes: 500, basis: "FLOOR_AREA", floorArea: null });
  assert.equal(r.value, null);
  assert.equal(r.unit, "tCO₂e / m²");
});

test("computeIntensity 樓地板面積與工期", () => {
  const area = computeIntensity({ totalTonnes: 1000, basis: "FLOOR_AREA", floorArea: 20000 });
  assert.equal(area.value, 0.05);
  const dur = computeIntensity({ totalTonnes: 120, basis: "DURATION", durationMonths: 12 });
  assert.equal(dur.value, 10);
});

test("assessTarget 超標判斷", () => {
  assert.deepEqual(assessTarget(1200, 1000), { overTarget: true, gap: 200 });
  assert.deepEqual(assessTarget(900, 1000), { overTarget: false, gap: -100 });
  assert.deepEqual(assessTarget(900, null), { overTarget: false, gap: null });
});
