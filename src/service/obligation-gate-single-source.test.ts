import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * 完成履約事項只能有一條路。
 *
 * 規則是「歸屬的工程分項全部完成才能完成履約事項」。這種約束的失效方式
 * 從來不是判斷寫錯，而是有人新增了一條沒經過判斷的寫入路徑 ——
 * 先前 project.service 就有一個未把關的 completeObligation，
 * 而畫面上的限制看起來完好。本檔以原始碼守住這件事。
 */

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const SRC = path.join(ROOT, "src");

/** 唯一可以標記完成的地方。 */
const GATEKEEPER = "src/service/obligation.service.ts";
/** 資料存取層本身允許定義寫入函式。 */
const REPOSITORY = "src/repository/obligation.repository.ts";

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

test("只有 obligation.service 能呼叫 markDone", () => {
  const offenders: string[] = [];
  for (const file of walk(SRC)) {
    const name = rel(file);
    if (name === GATEKEEPER || name === REPOSITORY) continue;
    if (/markDone\s*\(/.test(readFileSync(file, "utf8"))) offenders.push(name);
  }
  assert.deepEqual(
    offenders,
    [],
    `這些檔案繞過完成條件直接標記完成：${offenders.join("、")}`,
  );
});

test("只有 obligation.service 與資料存取層能寫入 DONE 狀態", () => {
  /*
    只掃會寫資料的層（service、repository、API 路由）。
    畫面元件裡的 status: "DONE" 多是統計卡或篩選條件的描述，
    把它們一起算進來會讓這條測試充滿假警報而終被忽略 ——
    那比沒有測試更糟。
  */
  const offenders: string[] = [];
  const layers = ["src/service", "src/repository", "src/app/api"];
  for (const file of walk(SRC)) {
    const name = rel(file);
    if (name === GATEKEEPER || name === REPOSITORY) continue;
    if (!layers.some((l) => name.startsWith(l))) continue;
    const source = readFileSync(file, "utf8");
    // 寫入形式（status: "DONE"）才算；比對與判斷（=== "DONE"）不算
    if (/status:\s*"DONE"/.test(source)) offenders.push(name);
  }
  assert.deepEqual(
    offenders,
    [],
    `這些檔案直接把狀態寫成完成：${offenders.join("、")}`,
  );
});

test("履約事項的細節寫入只由 obligation.service 發動", () => {
  const offenders: string[] = [];
  for (const file of walk(SRC)) {
    const name = rel(file);
    if (name === GATEKEEPER || name === REPOSITORY) continue;
    if (/updateDetail\s*\(/.test(readFileSync(file, "utf8"))) {
      offenders.push(name);
    }
  }
  assert.deepEqual(offenders, [], `繞過驗證直接寫入：${offenders.join("、")}`);
});

test("完成與編輯都確實引用了完成條件的判斷", () => {
  const source = readFileSync(path.join(ROOT, GATEKEEPER), "utf8");
  assert.match(source, /checkCompletion/, "完成前必須算出完成條件");
  assert.match(
    source,
    /planObligationUpdate/,
    "編輯必須經過會擋下 DONE 的驗證",
  );
});

test("編輯的驗證確實把關 DONE（而非只是解析欄位）", () => {
  const source = readFileSync(
    path.join(ROOT, "src/service/obligation-edit.ts"),
    "utf8",
  );
  assert.match(source, /checkCompletion/);
  assert.match(source, /completionBlockedMessage/);
});

test("每個完成入口都經過確認視窗", () => {
  for (const file of [
    "src/app/obligations/obligation-table.tsx",
    "src/app/obligations/[id]/obligation-detail.tsx",
  ]) {
    const source = readFileSync(path.join(ROOT, file), "utf8");
    assert.match(source, /useConfirm/, `${file} 的完成動作需先確認`);
    assert.match(
      source,
      /completeConfirm/,
      `${file} 應使用共用的完成確認文案`,
    );
  }
});
