import { test } from "node:test";
import assert from "node:assert/strict";

import {
  MAX_STATUS_CHARS,
  faithStatus,
  isExpandedStatus,
  shouldAutoAssist,
} from "./faith-status";

// ── 待命 ────────────────────────────────────────────────────
test("沒有任務也沒在工作時為待命，收合為圓鈕", () => {
  const s = faithStatus({ taskTitle: null, working: false, activity: null });
  assert.equal(s.state, "idle");
  assert.equal(s.label, "費思");
  assert.equal(s.detail, null, "圓鈕沒有空間放次要說明");
  assert.equal(isExpandedStatus(s.state), false);
});

test("空白任務名稱視為沒有任務", () => {
  const s = faithStatus({ taskTitle: "   ", working: false, activity: null });
  assert.equal(s.state, "idle");
});

// ── 任務進行中（等待輸入）────────────────────────────────────
test("接手任務但未動作時說出接手的是哪一項", () => {
  const s = faithStatus({
    taskTitle: "專案建置",
    working: false,
    activity: null,
  });
  assert.equal(s.state, "task");
  assert.equal(s.label, "專案建置");
  assert.match(s.detail ?? "", /等待/);
  assert.equal(isExpandedStatus(s.state), true);
  assert.match(s.ariaLabel, /專案建置/);
  assert.match(s.ariaLabel, /點擊開啟/, "無障礙標籤要說明可以做什麼");
});

// ── 工作中 ──────────────────────────────────────────────────
test("工作中要顯示當下動作，讓人看得出還在動", () => {
  const s = faithStatus({
    taskTitle: "專案建置",
    working: true,
    activity: "正在解析履約事項…",
  });
  assert.equal(s.state, "working");
  assert.equal(s.label, "專案建置");
  assert.equal(s.detail, "正在解析履約事項…");
  assert.match(s.ariaLabel, /費思工作中/);
  assert.match(s.ariaLabel, /正在解析履約事項/);
});

test("工作中但還沒有具體動作時給通用說明，不留空白", () => {
  const s = faithStatus({
    taskTitle: "專案建置",
    working: true,
    activity: null,
  });
  assert.equal(s.detail, "正在處理…");
});

test("一般問答時的工作中不需要任務名稱", () => {
  const s = faithStatus({ taskTitle: null, working: true, activity: null });
  assert.equal(s.state, "working");
  assert.equal(s.label, "費思工作中");
  assert.doesNotMatch(s.ariaLabel, /（/, "沒有任務就不該出現空的括號");
});

test("工作中優先於任務狀態（動態訊息比靜態標題重要）", () => {
  const s = faithStatus({
    taskTitle: "新增履約事項",
    working: true,
    activity: "判讀中…",
  });
  assert.equal(s.state, "working");
});

// ── 長度控制 ────────────────────────────────────────────────
test("過長的任務名稱截斷，不把版面撐開", () => {
  const long = "非常長的任務名稱".repeat(5);
  const s = faithStatus({ taskTitle: long, working: false, activity: null });
  assert.ok(s.label.length <= MAX_STATUS_CHARS + 1, "含省略號");
  assert.ok(s.label.endsWith("…"));
});

test("過長的工作說明同樣截斷", () => {
  const s = faithStatus({
    taskTitle: "專案建置",
    working: true,
    activity: "正在把契約履約標的逐條讀出並推導應辦期限與工程項目".repeat(2),
  });
  assert.ok((s.detail ?? "").length <= MAX_STATUS_CHARS + 1);
});

test("無障礙標籤不截斷，讀螢幕者需要完整資訊", () => {
  const activity = "正在把契約履約標的逐條讀出並推導應辦期限與工程項目";
  const s = faithStatus({ taskTitle: "專案建置", working: true, activity });
  assert.match(s.ariaLabel, new RegExp(activity));
});

test("三種狀態各自不同，不會互相混淆", () => {
  const states = new Set(
    [
      faithStatus({ taskTitle: null, working: false, activity: null }),
      faithStatus({ taskTitle: "X", working: false, activity: null }),
      faithStatus({ taskTitle: "X", working: true, activity: null }),
    ].map((s) => s.state),
  );
  assert.equal(states.size, 3);
});

// ── 可協助（建置畫面上）────────────────────────────────────────
test("畫面上有建置表單時，說出點下去會幫什麼", () => {
  const s = faithStatus({
    taskTitle: null,
    working: false,
    activity: null,
    offerTitle: "新增履約事項",
  });
  assert.equal(s.state, "offer");
  assert.match(s.detail ?? "", /新增履約事項/);
  assert.match(s.ariaLabel, /點擊讓費思協助/, "說明改由無障礙標籤與提示承擔");
});

test("可協助時維持圓鈕，不展開成膠囊", () => {
  /*
    同一時間已有一則彈出通知在問「需要協助嗎」並附接受按鈕。
    按鈕若也展開成約 320px 的膠囊，等於同一件事說兩次，
    而那塊寬度正好蓋住頁面右下角的主要動作（實際發生過）。
  */
  assert.equal(isExpandedStatus("offer"), false);
});

test("進行中的任務與工作中才展開（那才是真的狀態）", () => {
  assert.equal(isExpandedStatus("task"), true);
  assert.equal(isExpandedStatus("working"), true);
  assert.equal(isExpandedStatus("idle"), false);
});

test("已接手任務時不再顯示邀請，避免兩種語意並存", () => {
  const s = faithStatus({
    taskTitle: "新增履約事項",
    working: false,
    activity: null,
    offerTitle: "新增履約事項",
  });
  assert.equal(s.state, "task", "任務優先於邀請");
});

test("工作中優先於邀請", () => {
  const s = faithStatus({
    taskTitle: null,
    working: true,
    activity: "判讀中…",
    offerTitle: "新增查驗",
  });
  assert.equal(s.state, "working");
});

test("沒有建置表單時維持待命的圓鈕", () => {
  const s = faithStatus({
    taskTitle: null,
    working: false,
    activity: null,
    offerTitle: null,
  });
  assert.equal(s.state, "idle");
  assert.equal(isExpandedStatus(s.state), false);
});

test("空白的表單標題不構成邀請", () => {
  const s = faithStatus({
    taskTitle: null,
    working: false,
    activity: null,
    offerTitle: "   ",
  });
  assert.equal(s.state, "idle");
});

test("過長的表單標題同樣截斷", () => {
  const s = faithStatus({
    taskTitle: null,
    working: false,
    activity: null,
    offerTitle: "非常長的表單名稱".repeat(5),
  });
  assert.ok((s.detail ?? "").length <= MAX_STATUS_CHARS + 1);
});

test("四種狀態互斥且各自可辨識", () => {
  const states = [
    faithStatus({ taskTitle: null, working: false, activity: null }),
    faithStatus({ taskTitle: null, working: false, activity: null, offerTitle: "X" }),
    faithStatus({ taskTitle: "Y", working: false, activity: null }),
    faithStatus({ taskTitle: "Y", working: true, activity: null }),
  ].map((s) => s.state);
  assert.deepEqual(states, ["idle", "offer", "task", "working"]);
});

// ── 自動接手的判準 ──────────────────────────────────────────
test("費思已開啟且閒置時，進入建置畫面直接接手", () => {
  assert.equal(
    shouldAutoAssist({ expanded: true, hasTask: false, working: false }),
    true,
  );
});

test("費思收合時不擅自接手，只顯示邀請", () => {
  assert.equal(
    shouldAutoAssist({ expanded: false, hasTask: false, working: false }),
    false,
    "突然彈出並清空對話會打斷使用者",
  );
});

test("已有任務在進行時不搶走", () => {
  assert.equal(
    shouldAutoAssist({ expanded: true, hasTask: true, working: false }),
    false,
  );
});

test("正在處理中時不換任務，否則解析結果無處可去", () => {
  assert.equal(
    shouldAutoAssist({ expanded: true, hasTask: false, working: true }),
    false,
  );
});

test("只有全部條件成立才接手", () => {
  const combos = [
    [false, false, false],
    [false, false, true],
    [false, true, false],
    [false, true, true],
    [true, false, true],
    [true, true, false],
    [true, true, true],
  ] as const;
  for (const [expanded, hasTask, working] of combos) {
    assert.equal(
      shouldAutoAssist({ expanded, hasTask, working }),
      false,
      `不該接手：expanded=${expanded} hasTask=${hasTask} working=${working}`,
    );
  }
});
