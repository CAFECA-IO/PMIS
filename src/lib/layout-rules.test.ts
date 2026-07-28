import { test } from "node:test";
import assert from "node:assert/strict";

import { hidesSidebar } from "./layout-rules";

test("專案建置頁隱藏側邊欄", () => {
  assert.equal(hidesSidebar("/projects/new"), true);
});

test("其他畫面保留側邊欄", () => {
  assert.equal(hidesSidebar("/"), false);
  assert.equal(hidesSidebar("/projects"), false);
  assert.equal(hidesSidebar("/obligations"), false);
  assert.equal(hidesSidebar("/calendar"), false);
});

test("不可誤判前綴相近的路由", () => {
  // /projects/newsletter 之類的路徑不應被當成建置頁
  assert.equal(hidesSidebar("/projects/newsletter"), false);
  assert.equal(hidesSidebar("/projects/newx"), false);
});

test("建置頁的子路由一併隱藏", () => {
  assert.equal(hidesSidebar("/projects/new/step2"), true);
});

test("空值視為不隱藏（避免初次渲染閃動）", () => {
  assert.equal(hidesSidebar(null), false);
  assert.equal(hidesSidebar(undefined), false);
  assert.equal(hidesSidebar(""), false);
});
