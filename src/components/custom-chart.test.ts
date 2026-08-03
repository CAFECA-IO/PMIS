/**
 * Info: (20260803 - Julian)
 * CustomChart 派發元件測試：合法 DSL → 渲染 SVG；畸形 DSL → fallback 訊息、不崩。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { CustomChart } from "./custom-chart";

function render(lang: string, source: string): string {
  return renderToStaticMarkup(createElement(CustomChart, { lang, source }));
}

test("合法 custom-tornado → 渲染 SVG", () => {
  const markup = render(
    "custom-tornado",
    ["預算 <-> 實際", "結構, 4800, 4620", "機電, 2600, 2810"].join("\n"),
  );
  assert.ok(markup.includes("<svg"), "應渲染 SVG");
  assert.ok(!/NaN|Infinity/.test(markup), "不應含 NaN/Infinity");
});

test("合法 custom-matrix → 渲染 SVG", () => {
  const markup = render(
    "custom-matrix",
    ["xAxis: 低 <-> 高", "yAxis: 輕 <-> 重", "A, 3, 4", "B, 2, 3"].join("\n"),
  );
  assert.ok(markup.includes("<svg"));
});

test("畸形 DSL → 顯示 fallback、不出 SVG、不崩", () => {
  const markup = render("custom-histogram", "trend: weird\n0-1, 2");
  assert.ok(markup.includes("圖表無法繪製"), "應顯示 fallback 訊息");
  assert.ok(!markup.includes("<svg"), "畸形不應渲染 SVG");
});

test("非自訂圖表 fence → 不渲染（回 null）", () => {
  const markup = render("mermaid", "pie showData");
  assert.equal(markup, "");
});
