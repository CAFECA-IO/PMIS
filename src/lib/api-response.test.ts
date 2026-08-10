import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import {
  ok,
  fail,
  jsonOk,
  jsonFail,
  jsonError,
  jsonFailWithPayload,
  jsonErrorWithPayload,
  POWERBY,
} from "./api-response";
import { ApiCode, HTTP_MAP } from "./api-status";
import { API_ERRORS, ApiError, errorDefOf, withMessage } from "./api-error";

/**
 * Info: (20260810 - Luphia) 統一回應信封的行為測試。
 *
 * 這組契約的價值全在「每個端點都一樣」。一旦某個路由繞過信封，
 * 前端就得為它另寫一套解析，而那種偏離不會有任何執行期跡象 ——
 * 故除了行為測試，末段另有 source-guard 掃描 `src/app/api` 下的路由。
 */

test("ok 產生成功信封", () => {
  const res = ok({ a: 1 });
  assert.equal(res.success, true);
  assert.equal(res.code, ApiCode.SUCCESS);
  assert.equal(res.message, "OK");
  assert.equal(res.powerby, POWERBY);
  assert.deepEqual(res.payload, { a: 1 });
  assert.equal(res.errorCode, undefined);
});

test("ok 可帶自訂訊息", () => {
  assert.equal(ok(null, "已留存").message, "已留存");
});

test("ok 把 bigint 轉成字串（JSON.stringify 無法處理 bigint）", () => {
  // Info: (20260810 - Luphia) 用 BigInt() 而非 9007…n 字面值：tsconfig target 為 ES2017
  const res = ok({ id: BigInt("9007199254740993") });
  assert.deepEqual(res.payload, { id: "9007199254740993" });
});

test("fail 產生失敗信封，payload 為 null", () => {
  const res = fail(API_ERRORS.VA_MISSING_PROJECT);
  assert.equal(res.success, false);
  assert.equal(res.code, ApiCode.VALIDATION_ERROR);
  assert.equal(res.errorCode, "VA000001");
  assert.equal(res.message, "缺少專案");
  assert.equal(res.payload, null);
});

test("jsonOk 回 200 並帶信封", async () => {
  const res = jsonOk({ markdown: "# t" });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.success, true);
  assert.deepEqual(body.payload, { markdown: "# t" });
});

/**
 * Info: (20260810 - Luphia) 這是 `jsonFail` 存在的理由：HTTP 狀態只有
 * 一個決定點。路由若自己寫 `{ status: 400 }`，語意碼與數字狀態就可能不一致，
 * 而不一致的那一天沒有任何徵兆。
 */
test("jsonFail 由 def.status 推導 HTTP 狀態，路由無須自行指定", async () => {
  const cases: [typeof API_ERRORS.AU_NOT_SIGNED_IN, number][] = [
    [API_ERRORS.AU_NOT_SIGNED_IN, 401],
    [API_ERRORS.FO_MODULE_FORBIDDEN, 403],
    [API_ERRORS.FO_PROJECT_INACCESSIBLE, 403],
    [API_ERRORS.VA_MISSING_PROJECT, 400],
    [API_ERRORS.VA_INVALID_REPORT_TYPE, 400],
    [API_ERRORS.VA_INVALID_REF_DATE, 400],
    [API_ERRORS.IN_UNKNOWN, 500],
  ];
  for (const [def, status] of cases) {
    const res = jsonFail(def);
    assert.equal(res.status, status, `${def.code} 應回 ${status}`);
    const body = await res.json();
    assert.equal(body.errorCode, def.code);
    assert.equal(body.success, false);
  }
});

/**
 * Info: (20260810 - Luphia) 這是 jsonFailWithPayload 唯一的用途，也是它的理由：
 * forms/assist 與 projects/wizard 先歸檔才送模型。若歸檔資訊隨錯誤回應消失，
 * 使用者會以為檔案沒上傳而重傳，同一份文件就在庫裡出現兩份。
 */
test("jsonFailWithPayload 失敗時仍保留 payload", async () => {
  const res = jsonFailWithPayload(API_ERRORS.UM_UNSUPPORTED_FILE, {
    archived: { id: "f1" },
  });
  assert.equal(res.status, 415);
  const body = await res.json();
  assert.equal(body.success, false);
  assert.equal(body.errorCode, "UM000001");
  assert.deepEqual(body.payload, { archived: { id: "f1" } });
});

test("jsonErrorWithPayload 由例外產生 500 但保留 payload", async () => {
  const res = jsonErrorWithPayload(new Error("boom"), { archived: null }, "判讀失敗");
  assert.equal(res.status, 500);
  const body = await res.json();
  assert.equal(body.message, "判讀失敗");
  assert.deepEqual(body.payload, { archived: null });
});

test("withMessage 換訊息但保留 code 與 status", () => {
  const def = withMessage(API_ERRORS.FO_UPLOAD_NOT_ALLOWED, "此資料夾唯讀。");
  assert.equal(def.code, "FO000005", "語意碼必須固定，否則前端無從判斷");
  assert.equal(def.status, ApiCode.FORBIDDEN);
  assert.equal(def.message, "此資料夾唯讀。");
});

test("HTTP_MAP 覆蓋每一個 ApiCode", () => {
  for (const code of Object.values(ApiCode)) {
    assert.equal(
      typeof HTTP_MAP[code],
      "number",
      `${code} 缺少 HTTP 對照`,
    );
  }
});

test("錯誤字典的 code 不重複", () => {
  const codes = Object.values(API_ERRORS).map((d) => d.code);
  assert.equal(new Set(codes).size, codes.length, "錯誤碼重複");
});

test("errorDefOf 保留 ApiError 的語意碼", () => {
  const def = errorDefOf(new ApiError("CF000009", "同期已有定稿", ApiCode.CONFLICT));
  assert.equal(def.code, "CF000009");
  assert.equal(def.status, ApiCode.CONFLICT);
  assert.equal(def.message, "同期已有定稿");
});

test("errorDefOf 對未知例外收斂為 IN_UNKNOWN，但沿用呼叫端訊息", () => {
  const def = errorDefOf(new Error("boom"), "AI 額度已用罄");
  assert.equal(def.code, "IN000001");
  assert.equal(def.status, ApiCode.INTERNAL_SERVER_ERROR);
  assert.equal(def.message, "AI 額度已用罄", "呼叫端整理過的訊息不應被罐頭文案取代");
});

test("jsonError 由任意例外產生 500 信封", async () => {
  const res = jsonError(new Error("boom"), "LLM 逾時");
  assert.equal(res.status, 500);
  const body = await res.json();
  assert.equal(body.errorCode, "IN000001");
  assert.equal(body.message, "LLM 逾時");
});

/**
 * Info: (20260810 - Luphia) source-guard：路由不得直接呼叫
 * `NextResponse.json`。
 *
 * 繞過信封不會讓任何測試變紅 —— 那個端點自己是好的，壞的是「前端得為它
 * 例外處理」。這種偏離只有靠掃原始碼才抓得到。
 *
 * `ALLOWED` 現在只剩一個，而且是**永久**豁免而非待辦：
 *
 * `gis/tiles` 是圖磚二進位代理，不是 JSON API。它的契約是「回圖磚位元組，
 * 或回一個 HTTP 狀態」：Leaflet 只看狀態與位元組，永遠不讀 body；
 * 而 `new NextResponse(null, { status: res.status })` 直接轉發上游
 * （內政部 NLSC）的任意狀態碼，那不是 `ApiCode` 能列舉的集合。
 * 把它包進信封會讓圖磚直接壞掉，故整支維持原樣。
 *
 * 其餘路由若要新增，一律走 jsonOk／jsonFail。
 */
const ALLOWED = new Set<string>([]);

/**
 * Info: (20260810 - Luphia) 內容型回應（圖磚、GeoJSON、KML、檔案下載）
 * 以 `new NextResponse` 回傳本體，其**錯誤**路徑仍須走 jsonFail。
 * 這些檔案因此同時存在兩種回應，屬預期。
 */
const CONTENT_ROUTES = new Set<string>([
  "src/app/api/gis/tiles/[...seg]/route.ts",
  "src/app/api/gis/export/[projectId]/route.ts",
  "src/app/api/gis/vector/[id]/route.ts",
]);

function routeFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) routeFiles(full, acc);
    else if (entry === "route.ts") acc.push(full);
  }
  return acc;
}

test("已遷移的路由不得直接使用 NextResponse.json", () => {
  const offenders: string[] = [];
  for (const file of routeFiles("src/app/api")) {
    if (ALLOWED.has(file)) continue;
    if (readFileSync(file, "utf8").includes("NextResponse.json")) {
      offenders.push(file);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `這些路由應改用 jsonOk／jsonFail：\n  ${offenders.join("\n  ")}`,
  );
});

test("ALLOWED 只列真正還在用 NextResponse.json 的路由", () => {
  const stale = [...ALLOWED].filter(
    (f) => !readFileSync(f, "utf8").includes("NextResponse.json"),
  );
  assert.deepEqual(
    stale,
    [],
    `這些路由已不再使用 NextResponse.json，請自 ALLOWED 移除：\n  ${stale.join("\n  ")}`,
  );
});

/**
 * Info: (20260810 - Luphia) 每一支路由都必須表態：要嘛用信封，
 * 要嘛是明列的內容型回應。沒表態的（例如新增了一支只回純文字的路由）
 * 會在這裡被抓到，而不是等到前端發現「這個端點的形狀跟別人不一樣」。
 */
test("每支路由都使用信封，或列為內容型回應", () => {
  const offenders: string[] = [];
  for (const file of routeFiles("src/app/api")) {
    if (CONTENT_ROUTES.has(file)) continue;
    const body = readFileSync(file, "utf8");
    if (!/jsonOk|jsonFail|jsonError/.test(body)) offenders.push(file);
  }
  assert.deepEqual(
    offenders,
    [],
    `這些路由未使用信封：\n  ${offenders.join("\n  ")}`,
  );
});

/**
 * Info: (20260810 - Luphia) 手寫數字狀態是這套契約最容易復發的偏離：
 * 它能編譯、能跑、看起來也對，只是語意碼與數字狀態從此各說各話。
 * `gis/tiles` 除外 —— 它轉發上游狀態，見 ALLOWED 的說明。
 */
test("路由不得手寫 HTTP 數字狀態", () => {
  const offenders: string[] = [];
  for (const file of routeFiles("src/app/api")) {
    if (file === "src/app/api/gis/tiles/[...seg]/route.ts") continue;
    const body = readFileSync(file, "utf8");
    if (/status:\s*\d{3}/.test(body)) offenders.push(file);
  }
  assert.deepEqual(
    offenders,
    [],
    `HTTP 狀態應由 def.status 經 HTTP_MAP 推導：\n  ${offenders.join("\n  ")}`,
  );
});
