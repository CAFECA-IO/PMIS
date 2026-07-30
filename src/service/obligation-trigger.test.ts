import { test } from "node:test";
import assert from "node:assert/strict";

import {
  addDays,
  computeDueDate,
  describeTrigger,
  diffDays,
  parseDay,
  patternsFor,
  predecessorCandidates,
  requiredFields,
  validateTrigger,
  wouldCycle,
  type TriggerContext,
  type TriggerSetting,
} from "./obligation-trigger";
import { CONDITION_KINDS, RELATIVE_ANCHORS } from "@/constant/trigger";

const setting = (over: Partial<TriggerSetting> = {}): TriggerSetting => ({
  triggerType: over.triggerType ?? "FIXED_DATE",
  dueDate: over.dueDate ?? null,
  relativeAnchor: over.relativeAnchor ?? null,
  offsetDays: over.offsetDays ?? null,
  predecessorId: over.predecessorId ?? null,
  conditionKind: over.conditionKind ?? null,
  conditionDetail: over.conditionDetail ?? null,
  dueDateOverridden: over.dueDateOverridden ?? false,
});

const DUES: Record<string, string | null> = { a: "2026-06-30", b: null };

/*
  以 ?? 帶預設值會讓「明確傳入 null」被預設值吃掉，
  於是「專案沒填契約簽訂日」這個情境根本測不到。改為只補未指定的鍵。
*/
const context = (over: Partial<TriggerContext> = {}): TriggerContext => ({
  projectStart: "2026-01-15",
  projectEnd: "2028-06-30",
  contractSigned: "2025-12-20",
  noticeToProceed: "2026-01-10",
  prevStageDone: "2026-03-31",
  dueDateOf: (id: string) => DUES[id] ?? null,
  today: "2026-07-27",
  ...over,
});

// ── 日期工具 ────────────────────────────────────────────────
test("日期以 UTC 計算，不因時區偏一天", () => {
  assert.equal(addDays("2026-01-15", 30), "2026-02-14");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addDays("2028-06-30", -60), "2028-05-01");
  assert.equal(diffDays("2026-01-15", "2026-02-14"), 30);
});

test("不合法日期一律回 null，不產生 Invalid Date", () => {
  assert.equal(parseDay("2026-13-45"), null);
  assert.equal(parseDay(""), null);
  assert.equal(parseDay(null), null);
  assert.equal(addDays("不是日期", 5), null);
});

// ── 固定日期 ────────────────────────────────────────────────
test("固定日期直接採用所填日期", () => {
  const r = computeDueDate(
    setting({ triggerType: "FIXED_DATE", dueDate: "2026-07-15" }),
    context(),
  );
  assert.equal(r.dueDate, "2026-07-15");
  assert.equal(r.reason, null);
  assert.match(r.basis ?? "", /固定日期/);
});

test("固定日期未填時說明缺什麼", () => {
  const r = computeDueDate(setting({ triggerType: "FIXED_DATE" }), context());
  assert.match(r.reason ?? "", /需填入期限/);
});

// ── 相對期限 ────────────────────────────────────────────────
test("開工後 30 日：由專案開始推算", () => {
  const r = computeDueDate(
    setting({
      triggerType: "RELATIVE_DUE",
      relativeAnchor: "PROJECT_START",
      offsetDays: 30,
    }),
    context(),
  );
  assert.equal(r.dueDate, "2026-02-14");
  assert.match(r.basis ?? "", /專案開始（2026-01-15）後 30 日/);
});

test("竣工前 60 日：天數為負代表基準點之前", () => {
  const r = computeDueDate(
    setting({
      triggerType: "RELATIVE_DUE",
      relativeAnchor: "PROJECT_END",
      offsetDays: -60,
    }),
    context(),
  );
  assert.equal(r.dueDate, "2028-05-01");
  assert.match(r.basis ?? "", /前 60 日/);
});

test("契約簽訂日與開工命令日各自獨立，不等於專案開始", () => {
  const signed = computeDueDate(
    setting({
      triggerType: "RELATIVE_DUE",
      relativeAnchor: "CONTRACT_SIGNED",
      offsetDays: 7,
    }),
    context(),
  );
  assert.equal(signed.dueDate, "2025-12-27");
  const ntp = computeDueDate(
    setting({
      triggerType: "RELATIVE_DUE",
      relativeAnchor: "NOTICE_TO_PROCEED",
      offsetDays: 7,
    }),
    context(),
  );
  assert.equal(ntp.dueDate, "2026-01-17");
  assert.notEqual(signed.dueDate, ntp.dueDate);
});

test("基準日期尚未填入時不推算，並說明原因", () => {
  const r = computeDueDate(
    setting({
      triggerType: "RELATIVE_DUE",
      relativeAnchor: "CONTRACT_SIGNED",
      offsetDays: 7,
    }),
    context({ contractSigned: null }),
  );
  assert.equal(r.dueDate, null);
  assert.match(r.reason ?? "", /尚未填入契約簽訂日/);
});

test("每月 10 日：本月未過取本月，已過取下月", () => {
  const before = computeDueDate(
    setting({ triggerType: "RELATIVE_DUE", relativeAnchor: "MONTHLY", offsetDays: 10 }),
    context({ today: "2026-07-05" }),
  );
  assert.equal(before.dueDate, "2026-07-10");

  const after = computeDueDate(
    setting({ triggerType: "RELATIVE_DUE", relativeAnchor: "MONTHLY", offsetDays: 10 }),
    context({ today: "2026-07-27" }),
  );
  assert.equal(after.dueDate, "2026-08-10", "已過期的定期事項應指向下一次");
});

test("每月的跨年推進正確", () => {
  const r = computeDueDate(
    setting({ triggerType: "RELATIVE_DUE", relativeAnchor: "MONTHLY", offsetDays: 10 }),
    context({ today: "2026-12-20" }),
  );
  assert.equal(r.dueDate, "2027-01-10");
});

test("每季以 1、4、7、10 月為季首", () => {
  const r = computeDueDate(
    setting({ triggerType: "RELATIVE_DUE", relativeAnchor: "QUARTERLY", offsetDays: 15 }),
    context({ today: "2026-08-01" }),
  );
  assert.equal(r.dueDate, "2026-10-15", "第三季 7/15 已過，下一季為 10/15");
});

test("未選基準或未填天數時擋下", () => {
  assert.match(
    validateTrigger(setting({ triggerType: "RELATIVE_DUE" })) ?? "",
    /需選擇基準時間點/,
  );
  assert.match(
    validateTrigger(
      setting({ triggerType: "RELATIVE_DUE", relativeAnchor: "PROJECT_START" }),
    ) ?? "",
    /需填入天數/,
  );
});

test("偽造的基準值不被接受", () => {
  assert.match(
    validateTrigger(
      setting({
        triggerType: "RELATIVE_DUE",
        relativeAnchor: "WHENEVER",
        offsetDays: 1,
      }),
    ) ?? "",
    /不在可選清單內/,
  );
});

// ── 前置事項 ────────────────────────────────────────────────
test("前置事項完成後 14 日", () => {
  const r = computeDueDate(
    setting({ triggerType: "PREDECESSOR", predecessorId: "a", offsetDays: 14 }),
    context(),
    () => "細部設計審查",
  );
  assert.equal(r.dueDate, "2026-07-14");
  assert.match(r.basis ?? "", /前置事項「細部設計審查」（2026-06-30）後 14 日/);
});

test("前置事項本身還沒有期限時不推算", () => {
  const r = computeDueDate(
    setting({ triggerType: "PREDECESSOR", predecessorId: "b", offsetDays: 14 }),
    context(),
    () => "尚未排定的事項",
  );
  assert.equal(r.dueDate, null);
  assert.match(r.reason ?? "", /尚無期限/);
});

test("未指定前置事項時擋下", () => {
  assert.match(
    validateTrigger(setting({ triggerType: "PREDECESSOR" })) ?? "",
    /需選擇一項履約事項/,
  );
});

// ── 條件觸發 ────────────────────────────────────────────────
test("條件觸發不推算日期，但說清楚條件", () => {
  const r = computeDueDate(
    setting({
      triggerType: "CONDITION",
      conditionKind: "AGENCY_ACTION",
      conditionDetail: "機關書面通知後",
    }),
    context(),
  );
  assert.equal(r.dueDate, null);
  assert.match(r.basis ?? "", /機關或第三方行為：機關書面通知後/);
  assert.match(r.reason ?? "", /待條件成立後才確定/);
});

test("條件類型與說明皆為必填", () => {
  assert.match(
    validateTrigger(setting({ triggerType: "CONDITION" })) ?? "",
    /需選擇條件類型/,
  );
  assert.match(
    validateTrigger(
      setting({ triggerType: "CONDITION", conditionKind: "WORK_EVENT" }),
    ) ?? "",
    /需說明觸發條件/,
  );
});

test("每種條件類型都提供可選模式", () => {
  for (const kind of CONDITION_KINDS) {
    assert.ok(
      patternsFor(kind.id).length >= 3,
      `${kind.label} 的可選模式過少，使用者只能自己想`,
    );
  }
  assert.deepEqual(patternsFor("不存在的類型"), []);
});

// ── 人工覆寫 ────────────────────────────────────────────────
test("人工覆寫的期限不被算式蓋掉", () => {
  const r = computeDueDate(
    setting({
      triggerType: "RELATIVE_DUE",
      relativeAnchor: "PROJECT_START",
      offsetDays: 30,
      dueDate: "2026-03-01",
      dueDateOverridden: true,
    }),
    context(),
  );
  assert.equal(r.dueDate, "2026-03-01", "契約的例外約定必須能如實記錄");
  assert.equal(r.manual, true);
  assert.match(r.reason ?? "", /人工指定/);
});

test("未標記覆寫時，改動專案工期會讓期限跟著動", () => {
  const s = setting({
    triggerType: "RELATIVE_DUE",
    relativeAnchor: "PROJECT_START",
    offsetDays: 30,
    dueDate: "2026-02-14",
  });
  const moved = computeDueDate(s, context({ projectStart: "2026-02-01" }));
  assert.equal(moved.dueDate, "2026-03-03", "這正是相對期限存在的理由");
});

// ── 迴圈防護 ────────────────────────────────────────────────
const CHAIN: Record<string, string | null> = { a: null, b: "a", c: "b" };
const predOf = (id: string) => CHAIN[id] ?? null;

test("不能把自己設為前置事項", () => {
  assert.equal(wouldCycle("a", "a", predOf), true);
});

test("直接互為前置會被擋下", () => {
  // a 目前沒有前置；若讓 a 以 b 為前置，而 b 的前置是 a → 成環
  assert.equal(wouldCycle("a", "b", predOf), true);
});

test("間接成環也會被擋下", () => {
  // c ← b ← a；若讓 a 以 c 為前置就形成 a→c→b→a
  assert.equal(wouldCycle("a", "c", predOf), true);
});

test("正常的鏈結不被誤擋", () => {
  const flat: Record<string, string | null> = { x: null, y: null };
  assert.equal(wouldCycle("x", "y", (id) => flat[id] ?? null), false);
});

test("候選清單排除自己與會成環者", () => {
  const all = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
  const flat: Record<string, string | null> = { a: null, b: "a", c: "b", d: null };
  const candidates = predecessorCandidates("a", all, (id) => flat[id] ?? null);
  assert.deepEqual(
    candidates.map((c) => c.id),
    ["d"],
    "b 與 c 的前置鏈都會回到 a",
  );
});

// ── 欄位需求與摘要 ──────────────────────────────────────────
test("每種觸發方式各有不同的必填欄位", () => {
  assert.deepEqual(requiredFields("FIXED_DATE"), ["dueDate"]);
  assert.deepEqual(requiredFields("RELATIVE_DUE"), ["relativeAnchor", "offsetDays"]);
  assert.deepEqual(requiredFields("PREDECESSOR"), ["predecessorId", "offsetDays"]);
  assert.deepEqual(requiredFields("CONDITION"), ["conditionKind", "conditionDetail"]);
});

test("四種觸發方式的必填欄位互不相同（否則就不必分四種）", () => {
  const sets = (["FIXED_DATE", "RELATIVE_DUE", "PREDECESSOR", "CONDITION"] as const).map(
    (t) => requiredFields(t).join(","),
  );
  assert.equal(new Set(sets).size, 4);
});

test("摘要以人話說出依據", () => {
  assert.match(
    describeTrigger(
      setting({
        triggerType: "RELATIVE_DUE",
        relativeAnchor: "PROJECT_START",
        offsetDays: 30,
      }),
    ),
    /專案開始後 30 日/,
  );
  assert.match(
    describeTrigger(
      setting({ triggerType: "PREDECESSOR", predecessorId: "a", offsetDays: 7 }),
      () => "細部設計審查",
    ),
    /細部設計審查 完成後 7 日/,
  );
  assert.match(
    describeTrigger(
      setting({
        triggerType: "CONDITION",
        conditionKind: "THRESHOLD",
        conditionDetail: "累計估驗達契約金額 50% 後",
      }),
    ),
    /進度或金額門檻：累計估驗達契約金額 50% 後/,
  );
});

test("設定不完整時摘要也說得出來，不顯示空白", () => {
  assert.match(describeTrigger(setting({ triggerType: "RELATIVE_DUE" })), /未設定基準/);
  assert.match(describeTrigger(setting({ triggerType: "PREDECESSOR" })), /未指定/);
  assert.match(describeTrigger(setting({ triggerType: "FIXED_DATE" })), /未填/);
});

test("基準時間點清單涵蓋約定的四類，且每項都有說明", () => {
  const ids = RELATIVE_ANCHORS.map((a) => a.id);
  for (const id of [
    "PROJECT_START",
    "PROJECT_END",
    "CONTRACT_SIGNED",
    "NOTICE_TO_PROCEED",
    "PREV_STAGE_DONE",
    "MONTHLY",
    "QUARTERLY",
  ]) {
    assert.ok(ids.includes(id as never), `缺少基準點 ${id}`);
  }
  for (const a of RELATIVE_ANCHORS) {
    assert.ok(a.hint.length > 0, `${a.label} 缺少說明`);
  }
});
