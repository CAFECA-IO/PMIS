import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * 專案切換只能有一個入口（左上角選單）。
 *
 * 為何要用測試守住 —— 原本每個模組頁的右上角都各自放了一個專案下拉，
 * 同一件事有九份實作，改一處就會漂移；也讓使用者不確定哪個才是「目前專案」。
 * 收斂之後若有人日後又在頁面裡塞一個，這條測試會擋下來。
 *
 * 允許保留的兩處，理由不同 ——
 * - project-switch-dialog：左上角選單本體，就是那個唯一入口。
 * - calendar/alert-rules：那裡的「全部專案」是預警規則的適用範圍（寫入資料的欄位），
 *   不是切換目前檢視的專案，兩者只是字面相同。
 */

const ALLOWED = [
  "src/components/project-switch-dialog.tsx",
  "src/components/sidebar.tsx",
  "src/app/calendar/alert-rules.tsx",
];

const ROOT = path.resolve(import.meta.dirname, "../..");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx$/.test(name)) out.push(full);
  }
  return out;
}

test("全站只有左上角選單能切換專案", () => {
  const offenders: string[] = [];
  for (const file of walk(path.join(ROOT, "src"))) {
    const rel = path.relative(ROOT, file).split(path.sep).join("/");
    if (ALLOWED.includes(rel)) continue;
    const source = readFileSync(file, "utf8");
    // 下拉選單裡的「全部專案」選項就是專案切換器的指紋
    if (/<option[^>]*>\s*全部專案/.test(source)) offenders.push(rel);
  }
  assert.deepEqual(
    offenders,
    [],
    `這些檔案又出現專案切換下拉：${offenders.join("、")}`,
  );
});

test("被刪掉的舊切換器元件不得復活", () => {
  for (const gone of [
    "src/components/project-switcher.tsx",
    "src/app/carbon/carbon-project-switcher.tsx",
  ]) {
    assert.throws(
      () => statSync(path.join(ROOT, gone)),
      `${gone} 應已刪除，其職責由左上角選單承擔`,
    );
  }
});

test("左上角選單本身確實提供切換（避免把唯一入口也一起刪了）", () => {
  const dialog = readFileSync(
    path.join(ROOT, "src/components/project-switch-dialog.tsx"),
    "utf8",
  );
  assert.match(dialog, /全部專案/, "選單應提供「全部專案」以清除篩選");
  const sidebar = readFileSync(
    path.join(ROOT, "src/components/sidebar.tsx"),
    "utf8",
  );
  assert.match(sidebar, /switchProjectHref/, "側邊欄應負責寫入專案參數");
  assert.match(sidebar, /目前專案/, "側邊欄應顯示目前專案");
});
