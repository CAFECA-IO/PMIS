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

// ── 產製是明示動作，不得自動發生 ──────────────────────────

/** 取出 `from` 之後到下一個 `export ` 之間的內容（近似函式本體）。 */
function bodyAfter(source: string, from: string): string {
  const i = source.indexOf(from);
  if (i < 0) return "";
  const j = source.indexOf("\nexport ", i + from.length);
  return source.slice(i, j < 0 ? source.length : j);
}

/** 取出所有 useEffect 的內容（以括號配對掃描，避免依賴縮排）。 */
function effectBodies(source: string): string[] {
  const out: string[] = [];
  const needle = "useEffect(";
  let at = source.indexOf(needle);
  while (at >= 0) {
    let depth = 0;
    let i = at + needle.length - 1;
    for (; i < source.length; i++) {
      if (source[i] === "(") depth++;
      else if (source[i] === ")") {
        depth--;
        if (depth === 0) break;
      }
    }
    out.push(source.slice(at, i + 1));
    at = source.indexOf(needle, i + 1);
  }
  return out;
}

test("開啟頁面或改參數不得自動產製報表", () => {
  /*
    產一份報表要呼叫 LLM（付費）並寫一列留存。先前掛載與每次改參數都自動跑，
    於是光是打開 /logs 就產一次，而在日期欄輸入年份會依序送出
    0002／0020／0202／2026 四個年份 —— 四次產製、四列永久草稿。
  */
  const source = read("src/app/logs/report-generator.tsx");
  for (const body of effectBodies(source)) {
    assert.ok(
      !body.includes("/api/report"),
      "effect 內不得觸發產製；產製只能由使用者按下按鈕發動",
    );
  }
  assert.match(
    source,
    /loadPeriodReportAction/,
    "掛載與切換期間應走唯讀載入，而非產製",
  );
});

test("唯讀載入不得呼叫 LLM", () => {
  const body = bodyAfter(
    read("src/service/report.service.ts"),
    "export async function getPeriodReport",
  );
  assert.ok(body.length > 0, "getPeriodReport 應存在");
  assert.ok(!body.includes("faith."), "唯讀查詢不得呼叫 LLM");
  assert.ok(!body.includes("upsertDraft"), "唯讀查詢不得寫入");
});

test("基準日在伺服器端守門，不合理者拒絕而非退回今天", () => {
  const service = read("src/service/report.service.ts");
  assert.match(service, /export function parseRefDate/);
  // 用戶端防抖擋不住直接打 API 的請求，守門必須在伺服器端
  assert.match(read("src/app/api/report/route.ts"), /parseRefDate/);
});

test("定稿不與草稿共用同一個截斷", () => {
  /*
    留存清單是唯一能開啟定稿的 UI。若定稿與草稿共用一個 take，
    草稿一多就會把去年的定稿擠出清單，等於讓已送審的文件在系統中消失。
  */
  const body = bodyAfter(
    read("src/repository/generatedReport.repository.ts"),
    "export async function listByProject",
  );
  assert.match(body, /status:\s*"CONFIRMED"/, "定稿應單獨查詢");
  assert.ok(
    !/\btake\b/.test(body.slice(body.indexOf('"CONFIRMED"'), body.indexOf('"DRAFT"'))),
    "定稿查詢不應設 take",
  );
});

// ── 定稿只能凍結使用者讀過的那一版 ──────────────────────────

test("確認定稿必須帶版本，且伺服器端比對", () => {
  /*
    草稿是同一列原地覆寫，所以 id 不足以指明「哪一版」：
    A 分頁 09:00 讀到的內容，可能在 09:05 被另一個分頁的重新生成覆寫；
    A 分頁的畫面與 id 都沒變，按下確認就凍結了一份沒人讀過的送審文件。
  */
  const body = bodyAfter(
    read("src/service/report.service.ts"),
    "export async function confirmSavedReport",
  );
  assert.match(body, /expectedGeneratedAt/, "定稿需帶版本");
  assert.match(
    body,
    /generatedAt\.getTime\(\)\s*!==\s*expectedGeneratedAt/,
    "版本必須在伺服器端比對；用戶端擋不住另一個分頁",
  );
});

test("定稿的呼叫端一律傳入版本，不得只傳 id", () => {
  for (const file of [
    "src/app/logs/actions.ts",
    "src/app/logs/report-archive.tsx",
  ]) {
    const calls = read(file).match(/confirmSavedReportAction\([^)]*\)/g) ?? [];
    assert.ok(calls.length > 0, `${file} 應呼叫或轉發定稿動作`);
    for (const call of calls) {
      assert.ok(
        call.includes(","),
        `${file} 的 ${call} 缺少版本引數 —— 只傳 id 等於沒有守門`,
      );
    }
  }
});

test("展開的留存內容在清單重載時重新驗證版本", () => {
  /*
    先前 opened 只在展開時設定一次：別處重新生成後，列上的「產生於」
    會跳到新版而下方面板仍渲染舊內容，使用者讀舊的、對著新的按確認。
  */
  const source = read("src/app/logs/report-archive.tsx");
  assert.match(
    source,
    /stampOf\(row\.generatedAt\)\s*!==\s*open\.generatedAt/,
    "清單重載時必須比對展開中內容的版本",
  );
  assert.match(source, /staleId/, "版本不符時應提示重新開啟，而非靜默替換");
});
