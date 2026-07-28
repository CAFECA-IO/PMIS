import { test } from "node:test";
import assert from "node:assert/strict";

import { NAV_SECTIONS, SECTION_BY_ROUTE, sectionOf } from "./navigation";
import { PMIS_MODULES } from "./modules";

test("每個側邊欄項目都能對應到分區標題", () => {
  for (const s of NAV_SECTIONS) {
    for (const i of s.items) {
      assert.equal(SECTION_BY_ROUTE[i.href], s.title, `缺少 ${i.href}`);
    }
  }
});

test("路由不重複出現在多個分區", () => {
  const seen = new Set<string>();
  for (const s of NAV_SECTIONS) {
    for (const i of s.items) {
      assert.ok(!seen.has(i.href), `${i.href} 重複`);
      seen.add(i.href);
    }
  }
});

test("每個可授權模組都出現在導覽中（否則使用者找不到入口）", () => {
  const routes = new Set(
    NAV_SECTIONS.flatMap((s) => s.items.map((i) => i.href)),
  );
  // 系統通知由頁首鈴鐺進入，刻意不佔側邊欄項目
  const offNav = new Set(["/notifications"]);
  for (const m of PMIS_MODULES) {
    if (offNav.has(m.key)) continue;
    assert.ok(routes.has(m.key), `模組 ${m.key} 未出現在側邊欄`);
  }
});

test("未列於導覽的路由仍有分區標籤", () => {
  assert.equal(sectionOf("/notifications"), "01 總覽與決策");
});

test("子路由沿用父模組的分區", () => {
  assert.equal(sectionOf("/projects/abc123"), "02 契約與時程管理");
  assert.equal(sectionOf("/submittals/x/y"), "03 文件與協作");
});

test("根路由不會被誤判為其他路由的父層", () => {
  assert.equal(sectionOf("/"), "01 總覽與決策");
  assert.equal(sectionOf("/unknown-route"), undefined);
});
