import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * 報表數字不得靜默改寫使用者沒看到的內容。
 *
 * 三條共同的底線：累計要有時間上限、留存的要是使用者讀過的那一份、
 * 新建不得覆蓋既有日報。
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

// ── 新建不得覆蓋既有日報 ────────────────────────────────────

test("新建日報撞到既有日期時必須拒絕，不得改為更新", () => {
  /*
    新建表單的文字欄位一律從空白開始（它不顯示既有內容），送出時
    每個空輸入都寫成 null。若撞日期時退化為 update，把日期改成一個
    已有日報的日子、什麼都不打直接送出，就會抹掉當天的施工概況與
    免計工期依據，並把已核備的日報降回草稿 —— 數量還在卻不再計入累計。
  */
  const body = bodyAfter(
    read("src/service/supervisionReport.service.ts"),
    "export async function fileReport",
  );
  assert.ok(body.length > 0, "fileReport 應存在");
  assert.ok(
    !/reportRepo\.update\(/.test(body),
    "新建路徑不得更新既有日報；修改請走 updateReport",
  );
  assert.match(body, /if \(existing\)/, "撞日期時應明確拒絕");
});

test("新建表單在選定日期當下就提示衝突", () => {
  // 伺服器端會拒絕，但等使用者打完一整份才退回太晚了
  assert.match(
    read("src/app/logs/report-dialog-fields.tsx"),
    /checkReportDateAction/,
    "選好日期時就該查該日是否已有日報",
  );
});

test("定稿在留存清單上標示得出來", () => {
  /*
    橫幅會說「本期已有定稿報表（見下方留存清單）」；
    沒有這個標示，那句話就指向一個在清單裡認不出來的東西。
  */
  assert.match(
    read("src/app/logs/report-generator.tsx"),
    /periodConfirmedId=/,
    "產生器需把本期定稿的 id 傳給清單",
  );
  assert.match(read("src/app/logs/report-archive.tsx"), /本期定稿/);
});

// ── 軌跡必須留下未截斷的完整內容 ────────────────────────────

test("每一種軌跡動作都保存完整快照，而非只留截斷的摘要", () => {
  /*
    軌跡摘要會截斷（列表塞滿整段敘述就沒人會讀），所以截斷過的摘要
    只是提示、不是紀錄。免計工期依據這類直接對應金額的敘述，
    若只留 60 字摘要，DB 欄位一被覆寫就從兩邊同時消失。
  */
  const source = read("src/service/report-audit.ts");
  for (const fn of [
    "export function describeFieldChanges",
    "export function describeCreation",
    "export function describeQtyChanges",
    "export function describeDeletion",
  ]) {
    const body = bodyAfter(source, fn);
    assert.ok(body.length > 0, `${fn} 應存在`);
    assert.match(
      body,
      /before:\s*JSON\.stringify\(/,
      `${fn} 必須保存未截斷的完整內容`,
    );
  }

  /*
    服務層要真的把快照寫進去，而不是只寫摘要。
    每一筆帶 detail 的軌跡都必須有對應的 snapshot —— 摘要是截斷過的提示。
  */
  const service = read("src/service/supervisionReport.service.ts");
  for (const [summary, snapshot] of [
    ["detail: fieldChanges!.summary", "snapshot: fieldChanges!.before"],
    ["detail: qtyChanges!.summary", "snapshot: qtyChanges!.before"],
    ["detail: creation.summary", "snapshot: creation.before"],
    ["detail: detail.summary", "snapshot: detail.before"],
  ]) {
    assert.ok(service.includes(summary), `應寫入摘要：${summary}`);
    assert.ok(service.includes(snapshot), `應一併寫入快照：${snapshot}`);
  }
});

test("契約外同名項目不得以名稱當唯一鍵", () => {
  /*
    以 `x:${itemName}` 當 Map 鍵時，同名兩列會靜默收斂成最後一筆：
    刪掉其中一列會被判定為無異動而完全不寫軌跡，數量卻已從金額中消失。
  */
  const body = bodyAfter(
    read("src/service/report-audit.ts"),
    "export function describeQtyChanges",
  );
  assert.ok(
    !/`x:\$\{/.test(body),
    "同名列必須成組比對，不能用名稱當唯一鍵",
  );
  assert.match(body, /groupSig|groupByName/, "應以整組簽章比對同名列");
});

// ── 軌跡的摘要與快照分欄，不靠嗅探 ──────────────────────────

test("軌跡不得以換行切分摘要與快照", () => {
  /*
    摘要含使用者原文，而原文可以有換行：`施工概況：上午澆置\n下午養護`
    會讓後半段被摺進標示為「變更前明細」的區塊 —— 而且是在一列 CREATE 上，
    CREATE 根本沒有變更前。兩種東西放兩個欄位就不需要嗅探。
  */
  const ui = read("src/app/logs/report-audit-trail.tsx");
  assert.ok(!ui.includes("splitDetail"), "不應再從單一字串切分");
  assert.match(ui, /r\.snapshot/, "完整快照應讀獨立欄位");

  const service = read("src/service/supervisionReport.service.ts");
  assert.ok(
    !/detail:\s*`\$\{[^`]*\}\\n\$\{/.test(service),
    "不得再把摘要與 JSON 串成一個字串寫入 detail",
  );
  assert.match(service, /snapshot:\s*\w/, "快照應寫入獨立欄位");
});

// ── 數量表備註的往返 ────────────────────────────────────────

test("數量表備註必須能讀出、顯示並送回", () => {
  /*
    note 若只寫得進 DB 而表單讀不到，使用者開啟日報存個檔就會把它寫成 null
    —— 刪掉一句自己從沒看過的話。而備註常是免計工期或數量異常的唯一書面理由。
  */
  const service = read("src/service/supervisionReport.service.ts");
  const formRow = bodyAfter(service, "export type QtyFormRow");
  assert.match(formRow, /note:/, "預帶清單需帶出既有備註");

  const table = read("src/app/logs/report-qty-table.tsx");
  assert.match(table, /aria-label={`\${r\.name} 備註`}/, "台帳工項列需可填備註");
  assert.match(table, /note:\s*\(notes\[/, "送出的 payload 需帶備註");
});
