import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import {
  DOCK_RESERVE,
  FAITH_DOCK_POSITION,
  PANE_WIDTH_CLASS,
  TOAST_BOTTOM,
  TOAST_RIGHT_EXPANDED,
} from "./faith-dock";

/**
 * 右下角只屬於費思。
 *
 * 這條規則的失效方式不是判斷寫錯，而是有人在別處又寫一組座標 ——
 * 症狀（主要按鈕被浮動按鈕蓋住）在程式碼裡完全看不出來，
 * 只有把畫面拉到那個寬度才會發現。因此以原始碼守住。
 */

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const SRC = path.join(ROOT, "src");
const SELF = "src/lib/faith-dock.ts";

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

const rel = (file: string) =>
  path.relative(ROOT, file).split(path.sep).join("/");

test("常數本身完整", () => {
  assert.match(FAITH_DOCK_POSITION, /fixed/);
  assert.match(FAITH_DOCK_POSITION, /bottom-6/);
  assert.match(FAITH_DOCK_POSITION, /right-6/);
  assert.match(PANE_WIDTH_CLASS, /lg:w-\[400px\]/);
  assert.match(PANE_WIDTH_CLASS, /xl:w-\[440px\]/);
  assert.equal(TOAST_BOTTOM, "6rem");
});

test("保留區必須大於按鈕本身（按鈕有陰影與 hover 放大）", () => {
  const rem = (v: string) => Number.parseFloat(v);
  assert.ok(rem(DOCK_RESERVE) > 3, `保留 ${DOCK_RESERVE} 不足以容納 3rem 的按鈕`);
});

test("面板寬度只在共用常數裡出現一次", () => {
  const offenders: string[] = [];
  for (const file of walk(SRC)) {
    const name = rel(file);
    if (name === SELF) continue;
    const source = readFileSync(file, "utf8");
    if (/w-\[4[04]0px\]|pr-\[4[04]0px\]|right-\[4[26]4px\]/.test(source)) {
      offenders.push(name);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `這些檔案又自己寫死費思面板尺寸：${offenders.join("、")}`,
  );
});

test("只有費思本體能把自己固定在右下角", () => {
  const allowed = new Set([SELF, "src/components/ai-panel.tsx"]);
  const offenders: string[] = [];
  for (const file of walk(SRC)) {
    const name = rel(file);
    if (allowed.has(name)) continue;
    const source = readFileSync(file, "utf8");
    // fixed + bottom-* + right-* 同時出現才算佔用右下角
    if (/fixed[^"'`]*bottom-\d[^"'`]*right-\d/.test(source)) {
      offenders.push(name);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `這些檔案也把自己釘在右下角，會與費思重疊：${offenders.join("、")}`,
  );
});

test("彈出通知讓開面板的方式是往左，而非往上跳一個過時的高度", () => {
  const source = readFileSync(
    path.join(ROOT, "src/components/ui/notification.tsx"),
    "utf8",
  );
  // 比對實際程式碼構造而非字串出現與否 —— 註解裡提到舊值是說明，不是缺陷
  assert.match(source, /style=\{\{ bottom: TOAST_BOTTOM \}\}/);
  assert.match(source, /expanded \? TOAST_RIGHT_EXPANDED : TOAST_RIGHT_COLLAPSED/);
  assert.doesNotMatch(
    source,
    /bottom:\s*expanded/,
    "不該再依展開狀態改變垂直位置",
  );
  assert.match(TOAST_RIGHT_EXPANDED, /lg:right-\[424px\]/);
});

test("浮動按鈕不得再浮到模態視窗之上", () => {
  const source = readFileSync(
    path.join(ROOT, "src/components/ai-panel.tsx"),
    "utf8",
  );
  /*
    先前有 offer 時把按鈕提到 z-[90]，好讓它在對話框裡也點得到；
    代價是蓋住對話框自己的按鈕。對話框已內建「請費思協助」，
    通知也有「好，交給費思」，這個提升不再需要。
  */
  assert.doesNotMatch(
    source,
    /pendingOffer \? "z-\[90\]"/,
    "不該再依 offer 狀態把按鈕提到對話框之上",
  );
  assert.match(source, /"z-40",/, "應固定為 z-40");
});

test("表單動作列一律走共用元件，不自己算保留區", () => {
  const offenders: string[] = [];
  for (const file of walk(SRC)) {
    const name = rel(file);
    // 常數的定義處本身當然會出現這個名字
    if (name === SELF || name === "src/components/ui/form-action-bar.tsx") continue;
    const source = readFileSync(file, "utf8");
    if (source.includes("DOCK_RESERVE")) offenders.push(name);
  }
  assert.deepEqual(
    offenders,
    [],
    `保留區的計算只該在 FormActionBar 一處：${offenders.join("、")}`,
  );
});

test("邀請通知必須能被撤回", () => {
  /*
    「點開費思後提示仍在畫面上」的成因：notify 是射後不理，
    除了自己的計時器與動作按鈕，沒有人能讓它消失。
  */
  const notification = readFileSync(
    path.join(ROOT, "src/components/ui/notification.tsx"),
    "utf8",
  );
  assert.match(notification, /export type ToastHandle/, "notify 須回傳可撤回的權柄");
  assert.match(notification, /\): ToastHandle =>/);
  assert.match(
    notification,
    /clearTimeout\(timer\)/,
    "撤回時要一併清掉計時器，否則會再跑一次 dismiss",
  );
});

test("邀請的四件事集中在一個 hook 裡", () => {
  const hook = readFileSync(
    path.join(ROOT, "src/components/use-faith-offer.ts"),
    "utf8",
  );
  assert.match(hook, /registerOffer\(/, "註冊右下角入口");
  assert.match(hook, /asked\.current = true/, "每次出現只邀請一次");
  assert.match(hook, /asked\.current = false/, "離開畫面後重置，下次重新邀請");
  assert.match(hook, /toast\.current\?\.dismiss\(\)/, "被接手後撤回通知");
});

test("三個邀請點都改用共用 hook，不再各寫一份", () => {
  const offenders: string[] = [];
  for (const file of [
    "src/components/use-form-assist.ts",
    "src/components/project-build.tsx",
    "src/app/calendar/alert-rules.tsx",
  ]) {
    const source = readFileSync(path.join(ROOT, file), "utf8");
    assert.match(source, /useFaithOffer\(\{/, `${file} 應使用共用 hook`);
    // 自己再 registerOffer 或自己發邀請通知，就是又抄了一份
    if (/registerOffer\(\{/.test(source)) offenders.push(`${file}（自行註冊入口）`);
    if (/好，交給費思/.test(source)) offenders.push(`${file}（自行發邀請通知）`);
  }
  assert.deepEqual(offenders, [], offenders.join("、"));
});

test("邀請的有效範圍是一次出現，而非整個瀏覽期間", () => {
  /*
    先前以模組層級的 Set 記住「問過了」，於是放棄建置再回來就再也不會被
    提議 —— 而使用者往往正是因為手動填太慢才回來的。
  */
  for (const file of [
    "src/components/use-faith-offer.ts",
    "src/components/use-form-assist.ts",
    "src/components/project-build.tsx",
    "src/app/calendar/alert-rules.tsx",
  ]) {
    const source = readFileSync(path.join(ROOT, file), "utf8");
    assert.doesNotMatch(
      source,
      /^const (asked|assistAsked)\b/m,
      `${file} 不得以模組層級變數記住問過了`,
    );
  }
});

test("已改用共用動作列的畫面確實引用了它", () => {
  for (const file of [
    "src/components/project-build.tsx",
    "src/app/obligations/[id]/obligation-detail.tsx",
    /*
      解析結果的檢視清單蓋在表單欄之上，它的 footer 同樣落在右下角 ——
      蓋住表單不代表可以蓋住費思。
    */
    "src/components/wizard-analysis.tsx",
  ]) {
    const source = readFileSync(path.join(ROOT, file), "utf8");
    assert.match(source, /FormActionBar/, `${file} 應使用共用動作列`);
  }
});
