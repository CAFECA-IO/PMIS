import { test } from "node:test";
import assert from "node:assert/strict";

import {
  PROJECT_PARAM,
  carriesProject,
  currentProject,
  switchProjectHref,
  withProject,
} from "./project-link";

const P = "cljx1abc";

// ── withProject：核心行為 ────────────────────────────────────
test("導覽連結帶上目前專案（本次修正的核心）", () => {
  assert.equal(withProject("/quality", P), `/quality?${PROJECT_PARAM}=${P}`);
  assert.equal(withProject("/ehs", P), `/ehs?${PROJECT_PARAM}=${P}`);
});

test("未選定專案時連結保持原樣", () => {
  for (const v of [null, undefined, "", "   "]) {
    assert.equal(withProject("/quality", v), "/quality");
  }
});

test("既有查詢參數一併保留，不覆蓋", () => {
  const out = withProject("/submittals?tab=pending", P);
  const sp = new URLSearchParams(out.split("?")[1]);
  assert.equal(sp.get("tab"), "pending");
  assert.equal(sp.get(PROJECT_PARAM), P);
});

test("連結自己指定的專案優先，不被覆寫", () => {
  const out = withProject(`/documents?${PROJECT_PARAM}=other`, P);
  assert.match(out, /project=other/);
  assert.doesNotMatch(out, new RegExp(P));
});

test("錨點保留在最後，不被查詢字串吃掉", () => {
  const out = withProject("/projects/abc#obligations", P);
  assert.ok(out.endsWith("#obligations"), `錨點位置錯誤：${out}`);
  assert.match(out, new RegExp(`${PROJECT_PARAM}=${P}`));
});

test("路徑本身不變，只加查詢字串", () => {
  assert.ok(withProject("/projects/abc/detail", P).startsWith("/projects/abc/detail?"));
});

// ── 排除清單 ────────────────────────────────────────────────
test("專案建置不帶既有專案（那是還沒有專案的畫面）", () => {
  assert.equal(withProject("/projects/new", P), "/projects/new");
  assert.equal(carriesProject("/projects/new"), false);
});

test("登入與登出不帶專案", () => {
  assert.equal(withProject("/login", P), "/login");
  assert.equal(withProject("/logout", P), "/logout");
});

test("名稱相近但不同的路徑不受排除影響", () => {
  assert.equal(carriesProject("/projects"), true, "專案列表應保留篩選");
  assert.equal(carriesProject("/projects/abc"), true);
  assert.equal(carriesProject("/projects/newest"), true, "不得誤判為 /projects/new");
});

test("不吃專案的模組也照樣帶著走（參數需能過境）", () => {
  // 從品質稽核繞到人員權限再回環安衛：中途那頁若不帶，回來就沒了
  assert.match(withProject("/people", P), new RegExp(`${PROJECT_PARAM}=${P}`));
  assert.match(withProject("/notifications", P), new RegExp(PROJECT_PARAM));
});

// ── switchProjectHref ───────────────────────────────────────
test("切換專案時寫入參數並留在原頁", () => {
  assert.equal(
    switchProjectHref("/quality", "", P),
    `/quality?${PROJECT_PARAM}=${P}`,
  );
});

test("切換為全部專案時移除參數", () => {
  assert.equal(
    switchProjectHref("/quality", `${PROJECT_PARAM}=old&tab=x`, "all"),
    "/quality?tab=x",
  );
});

test("切換時保留其他查詢參數（如 tab）", () => {
  const out = switchProjectHref("/submittals", "tab=pending", P);
  const sp = new URLSearchParams(out.split("?")[1]);
  assert.equal(sp.get("tab"), "pending");
  assert.equal(sp.get(PROJECT_PARAM), P);
});

test("移除唯一參數後不留下多餘的問號", () => {
  assert.equal(
    switchProjectHref("/quality", `${PROJECT_PARAM}=old`, "all"),
    "/quality",
  );
});

test("空值與空白視為全部專案", () => {
  for (const v of [null, undefined, "", "  "]) {
    assert.equal(switchProjectHref("/x", `${PROJECT_PARAM}=old`, v), "/x");
  }
});

// ── currentProject ──────────────────────────────────────────
test("由查詢字串讀出目前專案", () => {
  assert.equal(currentProject(`${PROJECT_PARAM}=${P}&tab=x`), P);
  assert.equal(currentProject(`tab=x&${PROJECT_PARAM}=${P}`), P);
});

test("未指定或空白回 null，不回空字串", () => {
  assert.equal(currentProject(""), null);
  assert.equal(currentProject(null), null);
  assert.equal(currentProject(undefined), null);
  assert.equal(currentProject("tab=x"), null);
  assert.equal(currentProject(`${PROJECT_PARAM}=`), null);
  assert.equal(currentProject(`${PROJECT_PARAM}=%20%20`), null, "純空白不算選定");
});

// ── 往返一致性 ──────────────────────────────────────────────
test("加上再讀出應得到同一個專案（往返一致）", () => {
  const href = withProject("/quality?tab=x", P);
  assert.equal(currentProject(href.split("?")[1]), P);
});

test("切換後再讀出應為新專案", () => {
  const href = switchProjectHref("/quality", `${PROJECT_PARAM}=old`, P);
  assert.equal(currentProject(href.split("?")[1]), P);
});

test("含特殊字元的 id 經編碼後仍能正確讀回", () => {
  const odd = "a b&c=d";
  const href = withProject("/quality", odd);
  assert.equal(currentProject(href.split("?")[1]), odd);
});
