import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * 報表的「累計」必須有時間上限，而留存的必須是使用者讀過的那一份。
 *
 * 這兩件事都無法用單元測試守住 —— 它們的失效方式不是算錯，而是
 * **有人在取數處少傳一個期末、或另開一條寫入路徑**，
 * 而畫面上一切正常：數字看起來合理、留存清單也有東西。
 * 先前兩者都真的發生過（月報累計取「至今」、留存另跑一次產製），
 * 故以原始碼守住，比照 `obligation-gate-single-source.test.ts` 的作法。
 */

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

// ── 累計的時間上限 ──────────────────────────────────────────

test("月報不得使用無上限的日報累計", () => {
  const source = read("src/service/report.service.ts");
  /*
    只比對呼叫形式，不比對註解 —— 本檔的說明文字本來就會提到這個函式名。
    `loadDailyQtyTotals(` 是全期間版本；期間報表一律該用 `...UpTo`。
  */
  const calls = source.match(/\bloadDailyQtyTotals\s*\(/g) ?? [];
  assert.deepEqual(
    calls,
    [],
    "月報的累計欄位若取全期間，補產舊月報會把之後的量算進去（見〈「累計」一律要有時間上限〉）",
  );
});

test("月報的有效進度以期末為界取得", () => {
  const source = read("src/service/report.service.ts");
  assert.match(
    source,
    /getWorkItemDetails\(projectId,\s*end\)/,
    "省略第二個參數等於取「至今」的進度，與同一份報表的累計預定不同界",
  );
});

test("日報當日進度與月報共用同一個「截至某日」取數", () => {
  const source = read("src/service/supervisionReport.service.ts");
  assert.match(
    source,
    /loadDailyQtyTotalsUpTo\(/,
    "日報進度條若自行拼期間，兩處對同一天會給出不同的累計完成",
  );
});

// ── 留存的必須是畫面上那一份 ────────────────────────────────

test("彙整報表只有一條寫入路徑", () => {
  const source = read("src/repository/generatedReport.repository.ts");
  const creates = source.match(/prisma\.generatedReport\.create\(/g) ?? [];
  assert.equal(
    creates.length,
    1,
    "多一條不套用「同期只留一份草稿」的建立路徑，就會有兩份自稱是同一個月的報表",
  );
  assert.match(source, /export async function upsertDraft/);
});

test("留存不得另跑一次產製", () => {
  /*
    產製與留存必須在同一次呼叫內完成：報表數字是即時推導、期間評述由 LLM 現寫，
    另跑一次存下來的就不是使用者讀過的那一版，而「確認定稿」會把它凍結成送審文件。
  */
  const service = read("src/service/report.service.ts");
  assert.match(service, /export async function generateReportView/);
  assert.doesNotMatch(
    service,
    /generateAndSaveReport/,
    "留存不應是獨立的第二次產製",
  );

  const actions = read("src/app/logs/actions.ts");
  assert.doesNotMatch(
    actions,
    /saveReportAction/,
    "不應存在「按下才留存」的動作；產出即留存",
  );
});

test("留存的內容讀得回來", () => {
  // 只列 metadata 而讀不到全文，等於存進去再也打不開
  assert.match(read("src/app/logs/actions.ts"), /openSavedReportAction/);
  assert.match(read("src/app/logs/report-archive.tsx"), /openSavedReportAction/);
});
