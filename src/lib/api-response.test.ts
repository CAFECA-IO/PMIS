import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { ok, fail, jsonOk, jsonFail, jsonError, POWERBY } from "./api-response";
import { ApiCode, HTTP_MAP } from "./api-status";
import { API_ERRORS, ApiError, errorDefOf } from "./api-error";

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
 * `ALLOWED` 是尚未遷移的既有路由；遷移一個就從清單移除一個，
 * 清單只能變短。新增路由一律走 jsonOk／jsonFail。
 */
const ALLOWED = new Set<string>([
  "src/app/api/alerts/draft/route.ts",
  "src/app/api/chat/route.ts",
  "src/app/api/documents/file/[id]/route.ts",
  "src/app/api/ehs/analyze/route.ts",
  "src/app/api/ehs/file/[id]/route.ts",
  "src/app/api/faith/feedback/route.ts",
  "src/app/api/faith/file/[id]/route.ts",
  "src/app/api/faith/plan/route.ts",
  "src/app/api/file-manager/[id]/route.ts",
  "src/app/api/file-manager/upload/route.ts",
  "src/app/api/files/[id]/route.ts",
  "src/app/api/finance/extract/route.ts",
  "src/app/api/forms/assist/route.ts",
  "src/app/api/projects/wizard/route.ts",
  "src/app/api/screen-focus/route.ts",
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

test("report 路由已遷移（不在 ALLOWED 內）", () => {
  assert.ok(
    !ALLOWED.has("src/app/api/report/route.ts"),
    "report 路由是本次遷移的對象，不應被豁免",
  );
  const body = readFileSync("src/app/api/report/route.ts", "utf8");
  assert.match(body, /jsonOk/);
  assert.match(body, /jsonFail/);
  assert.doesNotMatch(
    body,
    /status:\s*\d{3}/,
    "HTTP 狀態應由 def.status 推導，不應出現數字狀態字面值",
  );
});
