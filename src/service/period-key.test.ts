import { test } from "node:test";
import assert from "node:assert/strict";

import {
  labelForKey,
  parseRefDate,
  periodKeyFor,
  weekStart,
  ymdKey,
} from "./period-key";

/**
 * 期間鍵是彙整報表留存的身分：`upsertDraft` 以它決定覆寫哪一份草稿，
 * `@@unique([projectId, confirmedPeriodKey])` 以它保證同期只有一份定稿。
 * 算錯不會有任何跡象 —— 畫面正常、數字正常，只是覆寫到了別的月份。
 *
 * 因此這裡測的是**行為**（給定輸入得到什麼鍵），而不是原始碼字串比對：
 * 先前那批 grep 測試在時區缺陷存在的情況下全部通過。
 */

/** 在指定時區下執行；還原原本的 TZ，避免測試之間互相影響。 */
function inTZ<T>(tz: string, fn: () => T): T {
  const prev = process.env.TZ;
  process.env.TZ = tz;
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env.TZ;
    else process.env.TZ = prev;
  }
}

/** 涵蓋正、零、負三種 UTC 偏移；負偏移是先前出錯的那一類。 */
const ZONES = ["Asia/Taipei", "UTC", "America/New_York"];

// ── parseRefDate：純日期一律解析為本地日曆日 ──────────────────

test("parseRefDate 對 YYYY-MM-DD 取本地日曆日，不受時區影響", () => {
  for (const tz of ZONES) {
    const d = inTZ(tz, () => parseRefDate("2026-01-01"));
    assert.ok(d, `${tz}: 應解析成功`);
    inTZ(tz, () => {
      assert.equal(d.getFullYear(), 2026, `${tz}: 年`);
      assert.equal(d.getMonth(), 0, `${tz}: 月`);
      assert.equal(d.getDate(), 1, `${tz}: 日`);
    });
  }
});

test("parseRefDate 拒絕不存在的日期而非靜默進位", () => {
  // new Date(2026, 12, 1) 會變成 2027 年 1 月；那會讓使用者拿到別年的報表
  assert.equal(parseRefDate("2026-13-01"), null);
  assert.equal(parseRefDate("2026-02-30"), null);
  assert.equal(parseRefDate("tomorrow"), null);
});

test("parseRefDate 仍擋掉超出合理範圍的年份", () => {
  assert.equal(parseRefDate("0202-08-07"), null, "日期欄逐鍵輸入的中間值");
  assert.equal(parseRefDate("1999-12-31"), null);
  assert.equal(parseRefDate("2101-01-01"), null);
});

// ── periodKeyFor：同一個日曆日在任何時區都得到同一個鍵 ──────────

test("期間鍵不隨伺服器時區改變", () => {
  const cases: [string, ReturnType<typeof String>, string][] = [
    ["2026-01-01", "ANNUAL", "ANNUAL:2026"],
    ["2026-01-01", "MONTHLY", "MONTHLY:2026-01"],
    ["2026-01-01", "QUARTERLY", "QUARTERLY:2026-Q1"],
    ["2026-08-01", "MONTHLY", "MONTHLY:2026-08"],
    ["2026-07-01", "QUARTERLY", "QUARTERLY:2026-Q3"],
    ["2026-12-31", "ANNUAL", "ANNUAL:2026"],
  ];
  for (const tz of ZONES) {
    for (const [iso, type, expected] of cases) {
      const key = inTZ(tz, () => {
        const ref = parseRefDate(iso);
        assert.ok(ref);
        return periodKeyFor(type as "MONTHLY", ref);
      });
      assert.equal(key, expected, `${tz} / ${iso} / ${type}`);
    }
  }
});

test("同一期間內的任何一天都得到同一個鍵", () => {
  const first = parseRefDate("2026-08-01")!;
  const mid = parseRefDate("2026-08-15")!;
  const last = parseRefDate("2026-08-31")!;
  for (const d of [first, mid, last]) {
    assert.equal(periodKeyFor("MONTHLY", d), "MONTHLY:2026-08");
    assert.equal(periodKeyFor("QUARTERLY", d), "QUARTERLY:2026-Q3");
    assert.equal(periodKeyFor("ANNUAL", d), "ANNUAL:2026");
  }
});

test("週鍵取該週的星期一", () => {
  // 2026-08-05 是星期三
  const wed = parseRefDate("2026-08-05")!;
  assert.equal(wed.getDay(), 3, "前提：這天是星期三");
  assert.equal(ymdKey(weekStart(wed)), "2026-08-03");
  assert.equal(periodKeyFor("WEEKLY", wed), "WEEKLY:2026-08-03");
  // 星期一當天應取自己
  const mon = parseRefDate("2026-08-03")!;
  assert.equal(periodKeyFor("WEEKLY", mon), "WEEKLY:2026-08-03");
  // 星期日應歸前一個星期一
  const sun = parseRefDate("2026-08-09")!;
  assert.equal(sun.getDay(), 0);
  assert.equal(periodKeyFor("WEEKLY", sun), "WEEKLY:2026-08-03");
});

test("週鍵跨月時仍取實際的星期一", () => {
  // 2026-09-01 是星期二，該週的星期一落在 8 月
  const tue = parseRefDate("2026-09-01")!;
  assert.equal(tue.getDay(), 2);
  assert.equal(periodKeyFor("WEEKLY", tue), "WEEKLY:2026-08-31");
});

// ── labelForKey：回填腳本的時區自我檢查所依賴的反推 ──────────────

test("labelForKey 反推的標籤與 periodRange 的格式一致", () => {
  assert.equal(labelForKey("MONTHLY:2026-08"), "2026 年 8 月");
  assert.equal(labelForKey("MONTHLY:2026-01"), "2026 年 1 月", "不補零");
  assert.equal(labelForKey("QUARTERLY:2026-Q3"), "2026 年 Q3");
  assert.equal(labelForKey("ANNUAL:2026"), "2026 年");
});

test("labelForKey 對日／週回 null（標籤帶格式化日期，不在此判斷）", () => {
  assert.equal(labelForKey("DAILY:2026-08-05"), null);
  assert.equal(labelForKey("WEEKLY:2026-08-03"), null);
  assert.equal(labelForKey("亂寫"), null);
});
