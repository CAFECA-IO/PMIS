import { test } from "node:test";
import assert from "node:assert/strict";

import {
  derivedProgress,
  effectiveMilestoneActual,
  rolledUpProgress,
  type RollupItem,
} from "./milestone-rollup";

const item = (
  p: number,
  ps: string | null,
  pe: string | null,
  ae: string | null = null,
): RollupItem => ({
  plannedStart: ps ? new Date(ps) : null,
  plannedEnd: pe ? new Date(pe) : null,
  actualStart: null,
  actualEnd: ae ? new Date(ae) : null,
  progress: p,
});

test("derivedProgress 依工期加權", () => {
  // A：10 天、進度 100；B：30 天、進度 0 → 加權 = (10*100)/(40) = 25
  const items = [
    item(100, "2026-01-01", "2026-01-11"),
    item(0, "2026-02-01", "2026-03-03"),
  ];
  assert.equal(derivedProgress(items), 25);
});

test("derivedProgress 無工項為 0、等權回退", () => {
  assert.equal(derivedProgress([]), 0);
  // 皆無預定日 → 等權：avg(50,100)=75
  assert.equal(
    derivedProgress([item(50, null, null), item(100, null, null)]),
    75,
  );
});

test("effectiveActual：手動日期優先", () => {
  const manual = new Date("2026-05-01");
  const eff = effectiveMilestoneActual(manual, [item(0, "2026-01-01", "2026-02-01")]);
  assert.equal(eff?.getTime(), manual.getTime());
});

test("effectiveActual：工項 100% 取最後實際完工日", () => {
  const items = [
    item(100, "2026-01-01", "2026-01-31", "2026-02-05"),
    item(100, "2026-02-01", "2026-02-28", "2026-03-10"),
  ];
  const eff = effectiveMilestoneActual(null, items);
  assert.equal(eff?.toISOString().slice(0, 10), "2026-03-10");
});

test("effectiveActual：未達 100% 且無手動 → 未達成 null", () => {
  const items = [item(60, "2026-01-01", "2026-02-01")];
  assert.equal(effectiveMilestoneActual(null, items), null);
});

test("effectiveActual：無關聯工項 → 回退手動日期(可為 null)", () => {
  assert.equal(effectiveMilestoneActual(null, []), null);
  const d = new Date("2026-06-01");
  assert.equal(effectiveMilestoneActual(d, [])?.getTime(), d.getTime());
});

test("rolledUpProgress：工項上捲驅動里程碑達成與落差", () => {
  const NOW = new Date("2026-03-15").getTime();
  const wi = (
    mid: string,
    p: number,
    ps: string,
    pe: string,
    ae: string | null = null,
  ): RollupItem & { milestoneId: string } => ({
    milestoneId: mid,
    plannedStart: new Date(ps),
    plannedEnd: new Date(pe),
    actualStart: null,
    actualEnd: ae ? new Date(ae) : null,
    progress: p,
  });
  const milestones = [
    // 已達成（工項 100%）：權重 40
    { id: "m1", type: "MILESTONE", weight: 40, plannedDate: new Date("2026-02-01"), actualDate: null },
    // 未達成（工項 50%）但預定已到：權重 60
    { id: "m2", type: "MILESTONE", weight: 60, plannedDate: new Date("2026-03-01"), actualDate: null },
  ];
  const workItems = [
    wi("m1", 100, "2026-01-01", "2026-01-31", "2026-02-02"),
    wi("m2", 50, "2026-02-01", "2026-04-30"),
  ];
  const p = rolledUpProgress(milestones, workItems, NOW);
  assert.equal(p.overall, 40); // 只有 m1 達成
  assert.equal(p.planned, 100); // 兩者預定日都已到
  assert.equal(p.gap, -60);
});

test("rolledUpProgress：手動完成日優先、無工項里程碑仍計入", () => {
  const NOW = new Date("2026-03-15").getTime();
  const milestones = [
    { id: "m1", type: "MILESTONE", weight: 50, plannedDate: new Date("2026-01-01"), actualDate: new Date("2026-02-01") },
    { id: "m2", type: "MILESTONE", weight: 50, plannedDate: new Date("2026-02-01"), actualDate: null },
  ];
  // m1 無工項但有手動實際日 → 達成；m2 無工項無手動日 → 未達成
  const p = rolledUpProgress(milestones, [], NOW);
  assert.equal(p.overall, 50);
  assert.equal(p.planned, 100);
});
