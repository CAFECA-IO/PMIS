import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { STEP_ORDER } from "@/service/wizard-steps";

/**
 * 建置流程的操作模型，以原始碼守住。
 *
 * 這裡守的三件事，失效時在程式碼裡都看不出異狀：
 *  1. 模型的結果只能經由「勾選匯入」進入表單。有人日後在 data 事件裡
 *     順手 setFields，症狀是欄位自己動了 —— 而每個函式看起來都合理。
 *  2. 解析中要蓋住表單。少了它，使用者會在解析期間改欄位，
 *     然後被匯入覆蓋掉自己剛填的內容。
 *  3. 建置階段只問簽約當下答得出來的事。工程分項要有數量與單價、
 *     責任分工要有組織分工、觸發方式要對照工期表、試運轉要看驗收條件 ——
 *     這些在建置頁問只會得到猜測，而猜測在畫面上與已確認的資料無法區分。
 *     反面同樣要守：契約依據**必須**留著且看得見，它與事項出自同一次閱讀。
 */

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");

const BUILD = "src/components/project-build.tsx";

test("建置只有三段：基本資料、履約標的、履約事項", () => {
  assert.deepEqual(STEP_ORDER, ["profile", "scope", "obligations"]);
});

test("data 事件只累積提議，不碰表單狀態", () => {
  const source = read(BUILD);
  const start = source.indexOf('if (event.type === "data")');
  assert.ok(start > 0, "找不到 data 事件的處理");
  const body = source.slice(start, source.indexOf('if (event.type === "done")'));

  for (const forbidden of ["commitFields", "setObligations", "setField("]) {
    assert.ok(
      !body.includes(forbidden),
      `data 事件不得呼叫 ${forbidden} —— 解析途中改動使用者眼前的欄位，` +
        "他無從分辨哪個值是自己填的，也無從拒絕讀錯的項目",
    );
  }
  assert.match(body, /proposalRef\.current/, "應把提議收在 proposalRef");
});

test("提議寫進表單的路徑只有一條：勾選後匯入", () => {
  const source = read(BUILD);
  // applyImport 是唯一算出「要寫什麼」的地方
  const calls = source.match(/applyImport\(/g) ?? [];
  assert.equal(calls.length, 1, "applyImport 只該在匯入時呼叫一次");
  assert.ok(
    !source.includes("applyIncoming"),
    "舊的即時併入函式必須整個消失，留著就會有人再接回去",
  );
});

test("解析中以覆蓋層蓋住表單，而非在角落顯示進度", () => {
  const source = read(BUILD);
  assert.match(source, /<AnalysisOverlay progress=\{progress\}/);
  // 覆蓋層要蓋在表單那一欄之上，故該欄必須是定位基準
  assert.match(
    source,
    /<section className="relative flex min-h-0 flex-col">/,
    "表單欄需為 relative，覆蓋層才會蓋住表單而非整個視窗",
  );
  const overlay = read("src/components/wizard-analysis.tsx");
  assert.match(overlay, /absolute inset-0 z-20/);
});

test("單段重試不蓋整張表單，只在該段轉圈", () => {
  const source = read(BUILD);
  assert.match(
    source,
    /!isSettled\(progress\) &&\s*\n?\s*busyStep == null/,
    "重試時 busyStep 有值，覆蓋層不應出現（否則看不到自己勾到哪裡）",
  );
});

test("建置頁不再收集工程分項", () => {
  const source = read(BUILD);
  for (const gone of [
    "WorkItemRow",
    "setWorkItems",
    "emptyWorkItem",
    "toWorkItemPayload",
    "新增工程分項",
  ]) {
    assert.ok(!source.includes(gone), `${gone} 應已隨工程分項表格一併移除`);
  }
});

test("建立專案時明確傳入空的工程分項，而非漏傳", () => {
  const source = read(BUILD);
  const start = source.indexOf("createProjectViaWizard(");
  assert.ok(start > 0);
  const call = source.slice(start, start + 700);
  assert.match(call, /\[\],/, "第三個引數應為 []，並以註解說明為何是空的");
});

test("建置頁不收那些簽約當下判不準的欄位", () => {
  const source = read(BUILD);
  /*
    這些欄位都在履約事項細節頁齊備（那裡還有觸發方式的專用輸入），
    在建置頁一併要求使用者決定，只會逼他亂填 —— 而亂填的值之後
    沒有人會回頭檢查，因為它看起來就像已經確認過了。
  */
  for (const [field, where] of [
    ["triggerType", "觸發方式"],
    ["ownerUnit", "責任單位"],
    ["ownerName", "責任人"],
    ["commissioning", "試運轉"],
  ]) {
    assert.ok(
      !source.includes(field!),
      `${where}（${field}）應已自建置頁移除，改於履約事項細節頁設定`,
    );
  }
});

test("契約依據必須逐項留在建置階段（與那些欄位不同）", () => {
  /*
    我曾把契約依據跟責任分工一起收掉 —— 兩者不同類。
    責任單位要有組織分工才決定得了；契約依據是「契約哪一條這樣要求」，
    與事項本身出自同一次閱讀。此刻不記，日後查證某項管制的來由
    就得重讀整份契約。它先前是「只存不顯示」，所以看起來像沒用的欄位。
  */
  const source = read(BUILD);
  assert.match(source, /contractBasis: string;/, "應為草稿列的欄位");
  assert.match(source, /aria-label="契約依據"/, "且必須看得見，不能只存不顯示");
  assert.match(
    source,
    /contractBasis: m\.contractBasis\.trim\(\) \|\| undefined/,
    "要隨專案一起建立，否則顯示了卻沒存",
  );

  const schema = read("src/service/faith.service.ts");
  const start = schema.indexOf("const OBLIGATIONS_SCHEMA");
  const body = schema.slice(start, schema.indexOf("export async function extractObligations"));
  assert.match(body, /required: \["title", "contractBasis"\]/, "應為模型的必填欄位");
});

test("模型也不再被要求判斷那些延後的欄位（否則是白花輸出額度）", () => {
  const schema = read("src/service/faith.service.ts");
  const start = schema.indexOf("const OBLIGATIONS_SCHEMA");
  assert.ok(start > 0);
  /*
    先去掉註解再比對。註解裡說明「為何不再要求 triggerType」是文件，不是缺陷 ——
    我第一次寫這個測試就是被自己的註解判為失敗。
  */
  const body = schema
    .slice(start, schema.indexOf("export async function extractObligations"))
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
  for (const field of ["triggerType", "commissioning", "ownerUnit"]) {
    assert.ok(
      !body.includes(field),
      `履約事項的 responseSchema 不該再要求 ${field}：表單收不到，等於白花輸出額度`,
    );
  }
});

test("履約事項表格的欄寬總和與 min-w 相符", () => {
  const source = read(BUILD);
  const cols = source.match(/sm:grid-cols-\[([^\]]+)\]/);
  assert.ok(cols, "找不到履約事項表格的欄位定義");
  const parts = cols![1].split("_");
  const minW = Number(source.match(/sm:min-w-\[(\d+)px\]/)![1]);

  // 固定寬度欄 + 間距 + 各彈性欄的最小寬度（fr 係數不影響最小值）
  let fixed = 0;
  let flexMin = 0;
  for (const part of parts) {
    const mm = part.match(/^minmax\((\d+)px,[\d.]+fr\)$/);
    if (mm) {
      flexMin += Number(mm[1]);
      continue;
    }
    fixed += Number(part.replace("px", ""));
  }
  const gaps = (parts.length - 1) * 8; // gap-2
  assert.equal(
    fixed + gaps + flexMin,
    minW,
    `欄寬總和 ${fixed + gaps + flexMin} 與 min-w-[${minW}px] 不符 —— ` +
      "少算會把最後一欄（刪除鈕）擠出容器，這是先前實際發生過的版面異常",
  );
});

test("重複檢查在伺服器端把關，不只在前端提醒", () => {
  /*
    前端的檢查是為了讓使用者早點知道，不能當作把關 ——
    呼叫端可以不做檢查就送出，兩次檢查之間也可能有人剛建了同名專案。
    故建立路徑必須自己重查，而非信任前端傳來的 allowDuplicate。
  */
  const service = read("src/service/project.service.ts");
  const start = service.indexOf("export async function createProjectWithStructure");
  assert.ok(start > 0);
  const body = service.slice(start, start + 2600);
  assert.match(
    body,
    /await checkDuplicates\(/,
    "建立路徑必須自己查一次，不能只靠前端",
  );
  assert.match(
    body,
    /!allowDuplicate \|\| hasBlocking\(duplicates\)/,
    "編號撞號即使使用者同意也要擋（資料庫 unique 約束，同意也建不出來）",
  );
});

test("被擋下時要把重複清單交回前端", () => {
  /*
    只回一句「請確認後再建立」而不說是哪些專案，使用者沒有任何
    可以確認的依據 —— 他會反覆按同一顆按鈕。
  */
  const service = read("src/service/project.service.ts");
  assert.match(service, /duplicates\?: DuplicateMatch\[\]/);
  assert.match(service, /error:[\s\S]{0,200}duplicates,/);

  const build = read(BUILD);
  assert.match(
    build,
    /if \(result\.duplicates\?\.length\)/,
    "前端要收下伺服器查到的重複並就地詢問",
  );
});

test("重複比對用的候選資料由伺服器撈，不含檔案內容", () => {
  const repo = read("src/repository/project.repository.ts");
  const start = repo.indexOf("export function listForDuplicateCheck");
  assert.ok(start > 0);
  const body = repo.slice(start);
  // 只要檔名，取內容是白花 IO 且無助於判斷
  assert.match(body, /select: \{ fileName: true \}/);
  assert.ok(
    !body.includes("storedName"),
    "比對不需要儲存區檔名，撈了只是多帶敏感路徑",
  );
  assert.match(body, /deletedAt: null/, "已刪除的專案不該被報成重複");
});
