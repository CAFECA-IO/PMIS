import { test } from "node:test";
import assert from "node:assert/strict";

import {
  compare,
  daysBetween,
  describeRule,
  evaluateRules,
  isRuleComplete,
  type AlertRule,
  type AnchorItem,
  type MetricSample,
} from "./alert-rule";

const TODAY = "2026-07-27";
const P1 = { projectId: "p1", projectName: "污水下水道工程" };
const P2 = { projectId: "p2", projectName: "橋梁改建工程" };

function rule(over: Partial<AlertRule>): AlertRule {
  return {
    id: "r1",
    name: "規則",
    kind: "CONDITION",
    module: "/schedule",
    severity: "WARNING",
    enabled: true,
    ...over,
  };
}

// ── 基礎工具 ────────────────────────────────────────────────
test("daysBetween 計算天數，逾期為負值", () => {
  assert.equal(daysBetween(TODAY, "2026-08-03"), 7);
  assert.equal(daysBetween(TODAY, TODAY), 0);
  assert.equal(daysBetween(TODAY, "2026-07-20"), -7);
});

test("daysBetween 不受時分秒影響", () => {
  assert.equal(daysBetween("2026-07-27T23:59:00Z", "2026-07-28T00:01:00Z"), 1);
});

test("compare 支援五種運算子", () => {
  assert.equal(compare(5, "GTE", 5), true);
  assert.equal(compare(4.9, "GTE", 5), false);
  assert.equal(compare(3, "LTE", 5), true);
  assert.equal(compare(6, "GT", 5), true);
  assert.equal(compare(5, "GT", 5), false);
  assert.equal(compare(4, "LT", 5), true);
  assert.equal(compare(5, "EQ", 5), true);
});

// ── 啟用／停用 ──────────────────────────────────────────────
test("停用的規則不會觸發", () => {
  const r = rule({
    enabled: false,
    metric: "SCHEDULE_LAG",
    operator: "GTE",
    threshold: 5,
  });
  const samples: MetricSample[] = [
    { metric: "SCHEDULE_LAG", value: 9, label: "全案", ...P1 },
  ];
  assert.equal(
    evaluateRules({ rules: [r], anchors: [], samples, today: TODAY }).length,
    0,
  );
});

test("重新啟用後即會觸發", () => {
  const base = {
    metric: "SCHEDULE_LAG" as const,
    operator: "GTE" as const,
    threshold: 5,
  };
  const samples: MetricSample[] = [
    { metric: "SCHEDULE_LAG", value: 9, label: "全案", ...P1 },
  ];
  const off = evaluateRules({
    rules: [rule({ ...base, enabled: false })],
    anchors: [],
    samples,
    today: TODAY,
  });
  const on = evaluateRules({
    rules: [rule({ ...base, enabled: true })],
    anchors: [],
    samples,
    today: TODAY,
  });
  assert.equal(off.length, 0);
  assert.equal(on.length, 1);
});

// ── 範例一：進度落後達 5% → 建立趕工計畫與每週檢討會 ─────────
test("條件觸發：進度落後達 5% 觸發，未達門檻不觸發", () => {
  const r = rule({
    id: "lag",
    name: "進度落後預警",
    kind: "CONDITION",
    metric: "SCHEDULE_LAG",
    operator: "GTE",
    threshold: 5,
    unit: "%",
    severity: "CRITICAL",
    action: "建立趕工計畫與每週檢討會",
    notify: "專案經理,監造",
  });
  const samples: MetricSample[] = [
    { metric: "SCHEDULE_LAG", value: 7.2, label: "全案進度", ...P1 },
    { metric: "SCHEDULE_LAG", value: 3.1, label: "全案進度", ...P2 },
  ];
  const hits = evaluateRules({ rules: [r], anchors: [], samples, today: TODAY });
  assert.equal(hits.length, 1);
  assert.equal(hits[0].projectId, "p1");
  assert.equal(hits[0].action, "建立趕工計畫與每週檢討會");
  assert.match(hits[0].detail, /7\.2%/);
  assert.match(hits[0].detail, /≥ 5%/);
});

test("條件觸發：邊界值等於門檻時觸發（GTE）", () => {
  const r = rule({ metric: "SCHEDULE_LAG", operator: "GTE", threshold: 5 });
  const samples: MetricSample[] = [
    { metric: "SCHEDULE_LAG", value: 5, label: "全案", ...P1 },
  ];
  assert.equal(
    evaluateRules({ rules: [r], anchors: [], samples, today: TODAY }).length,
    1,
  );
});

// ── 範例二：文件期限前 7 日通知承辦及專案經理 ────────────────
test("相對日期：期限前 7 日進入通知區間才觸發", () => {
  const r = rule({
    id: "doc",
    name: "文件期限預警",
    kind: "RELATIVE_DATE",
    module: "/documents",
    anchor: "DOCUMENT_DUE",
    offsetDays: 7,
    notify: "承辦,專案經理",
  });
  const anchors: AnchorItem[] = [
    { anchor: "DOCUMENT_DUE", date: "2026-08-03", label: "施工計畫書", ...P1 }, // 7 天 → 觸發
    { anchor: "DOCUMENT_DUE", date: "2026-08-04", label: "材料送審", ...P1 }, // 8 天 → 不觸發
    { anchor: "DOCUMENT_DUE", date: "2026-07-20", label: "月報", ...P1 }, // 逾期 → 觸發
  ];
  const hits = evaluateRules({ rules: [r], anchors, samples: [], today: TODAY });
  assert.deepEqual(
    hits.map((h) => h.subject),
    ["月報", "施工計畫書"],
    "逾期者排前（daysUntil 較小）",
  );
  assert.equal(hits[0].overdue, true);
  assert.equal(hits[0].daysUntil, -7);
  assert.equal(hits[1].overdue, false);
  assert.equal(hits[1].daysUntil, 7);
  assert.equal(hits[1].notify, "承辦,專案經理");
});

test("相對日期：只比對相同基準類型", () => {
  const r = rule({
    kind: "RELATIVE_DATE",
    anchor: "DOCUMENT_DUE",
    offsetDays: 7,
  });
  const anchors: AnchorItem[] = [
    { anchor: "INSPECTION_DATE", date: "2026-07-28", label: "查驗", ...P1 },
  ];
  assert.equal(
    evaluateRules({ rules: [r], anchors, samples: [], today: TODAY }).length,
    0,
  );
});

// ── 範例三：材料試驗不合格 → 建立 NCR 及複查追蹤 ─────────────
test("條件觸發：查驗不合格件數達門檻建立 NCR", () => {
  const r = rule({
    id: "ncr",
    name: "材料試驗不合格",
    kind: "CONDITION",
    module: "/quality",
    metric: "INSPECTION_FAILED",
    operator: "GTE",
    threshold: 1,
    unit: "件",
    severity: "CRITICAL",
    action: "建立 NCR 及複查追蹤",
  });
  const samples: MetricSample[] = [
    { metric: "INSPECTION_FAILED", value: 2, label: "材料查驗", ...P1 },
    { metric: "INSPECTION_FAILED", value: 0, label: "材料查驗", ...P2 },
  ];
  const hits = evaluateRules({ rules: [r], anchors: [], samples, today: TODAY });
  assert.equal(hits.length, 1);
  assert.equal(hits[0].action, "建立 NCR 及複查追蹤");
});

// ── 範例四：CCTV 離線超過 10 分鐘 → 通知資訊與現場人員 ────────
test("條件觸發：CCTV 離線超過 10 分鐘，逐台設備各自命中", () => {
  const r = rule({
    id: "cctv",
    name: "CCTV 離線預警",
    kind: "CONDITION",
    module: "/monitoring",
    metric: "DEVICE_OFFLINE_MINUTES",
    operator: "GT",
    threshold: 10,
    unit: "分鐘",
    notify: "資訊,現場人員",
  });
  const samples: MetricSample[] = [
    { metric: "DEVICE_OFFLINE_MINUTES", value: 25, label: "CAM-01 東側大門", ...P1 },
    { metric: "DEVICE_OFFLINE_MINUTES", value: 10, label: "CAM-02 西側", ...P1 },
    { metric: "DEVICE_OFFLINE_MINUTES", value: 42, label: "CAM-03 料場", ...P1 },
  ];
  const hits = evaluateRules({ rules: [r], anchors: [], samples, today: TODAY });
  assert.deepEqual(
    hits.map((h) => h.subject),
    ["CAM-01 東側大門", "CAM-03 料場"],
    "剛好 10 分鐘不觸發（GT）",
  );
});

// ── 固定日期 ────────────────────────────────────────────────
test("固定日期：未到期不觸發，當日與逾期觸發", () => {
  const mk = (fixedDate: string) =>
    rule({ kind: "FIXED_DATE", fixedDate, module: "/projects" });
  const run = (d: string) =>
    evaluateRules({ rules: [mk(d)], anchors: [], samples: [], today: TODAY });

  assert.equal(run("2026-08-01").length, 0, "未到期");
  const onDay = run(TODAY);
  assert.equal(onDay.length, 1);
  assert.equal(onDay[0].daysUntil, 0);
  assert.equal(onDay[0].overdue, false);
  const past = run("2026-07-01");
  assert.equal(past[0].overdue, true);
  assert.equal(past[0].daysUntil, -26);
});

// ── 專案範圍 ────────────────────────────────────────────────
test("規則指定專案時只評估該專案；未指定則適用全部", () => {
  const scoped = rule({
    id: "s",
    projectId: "p1",
    metric: "SCHEDULE_LAG",
    operator: "GTE",
    threshold: 5,
  });
  const global = rule({
    id: "g",
    projectId: null,
    metric: "SCHEDULE_LAG",
    operator: "GTE",
    threshold: 5,
  });
  const samples: MetricSample[] = [
    { metric: "SCHEDULE_LAG", value: 9, label: "全案", ...P1 },
    { metric: "SCHEDULE_LAG", value: 8, label: "全案", ...P2 },
  ];
  assert.equal(
    evaluateRules({ rules: [scoped], anchors: [], samples, today: TODAY }).length,
    1,
  );
  assert.equal(
    evaluateRules({ rules: [global], anchors: [], samples, today: TODAY }).length,
    2,
  );
});

// ── 排序與完整性 ────────────────────────────────────────────
test("命中結果依嚴重度排序，同級再依期限遠近", () => {
  const anchors: AnchorItem[] = [
    { anchor: "DOCUMENT_DUE", date: "2026-07-30", label: "近期文件", ...P1 },
    { anchor: "DOCUMENT_DUE", date: "2026-07-28", label: "更近文件", ...P1 },
  ];
  const rules: AlertRule[] = [
    rule({
      id: "warn",
      kind: "RELATIVE_DATE",
      anchor: "DOCUMENT_DUE",
      offsetDays: 10,
      severity: "WARNING",
    }),
    rule({
      id: "crit",
      kind: "CONDITION",
      metric: "SCHEDULE_LAG",
      operator: "GTE",
      threshold: 5,
      severity: "CRITICAL",
    }),
  ];
  const samples: MetricSample[] = [
    { metric: "SCHEDULE_LAG", value: 9, label: "全案", ...P1 },
  ];
  const hits = evaluateRules({ rules, anchors, samples, today: TODAY });
  assert.equal(hits[0].severity, "CRITICAL");
  assert.deepEqual(hits.slice(1).map((h) => h.subject), [
    "更近文件",
    "近期文件",
  ]);
});

test("設定不完整的規則即使啟用也不觸發", () => {
  const incomplete: AlertRule[] = [
    rule({ kind: "FIXED_DATE", fixedDate: null }),
    rule({ kind: "RELATIVE_DATE", anchor: "DOCUMENT_DUE", offsetDays: null }),
    rule({ kind: "CONDITION", metric: "SCHEDULE_LAG", operator: "GTE", threshold: null }),
  ];
  for (const r of incomplete) {
    assert.equal(isRuleComplete(r), false);
    assert.equal(
      evaluateRules({
        rules: [r],
        anchors: [
          { anchor: "DOCUMENT_DUE", date: TODAY, label: "x", ...P1 },
        ],
        samples: [{ metric: "SCHEDULE_LAG", value: 99, label: "x", ...P1 }],
        today: TODAY,
      }).length,
      0,
    );
  }
});

test("describeRule 產生可讀摘要", () => {
  assert.equal(
    describeRule(rule({ kind: "FIXED_DATE", fixedDate: "2026-12-31" })),
    "於 2026-12-31 觸發",
  );
  assert.equal(
    describeRule(
      rule({ kind: "RELATIVE_DATE", anchor: "DOCUMENT_DUE", offsetDays: 7 }),
    ),
    "期限前 7 天觸發",
  );
  assert.equal(
    describeRule(
      rule({
        kind: "CONDITION",
        metric: "DEVICE_OFFLINE_MINUTES",
        operator: "GT",
        threshold: 10,
      }),
    ),
    "設備離線時間 > 10分鐘",
  );
  assert.equal(describeRule(rule({ kind: "CONDITION", metric: null })), "尚未設定條件");
});
