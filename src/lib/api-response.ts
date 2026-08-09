import { NextResponse } from "next/server";

import { ApiCode, HTTP_MAP } from "@/lib/api-status";
import { errorDefOf, type IErrorDef } from "@/lib/api-error";
import { name, version } from "../../package.json";

export const POWERBY = `${name} v${version}`;

/**
 * Info: (20260810 - Luphia) 統一的 API 回應信封。與 iSunFA
 * `src/lib/utils/response.ts` 同一套契約。
 *
 * 成功與失敗共用同一組欄位，前端只需判斷 `success`，不必為每個端點
 * 各寫一套解析；`code`／`errorCode` 供程式分流，`message` 供顯示。
 */
export interface IApiResponse<T> {
  powerby: string;
  success: boolean;
  code: ApiCode | string;
  errorCode?: string;
  message: string;
  payload: T | null;
}

/**
 * Info: (20260810 - Luphia) 成功信封。
 *
 * 注意 `payload` 會經過一次 JSON round-trip：`bigint` 轉字串（`JSON.stringify`
 * 無法處理 bigint），而 `Date` 會被轉成 ISO 字串。後者與直接交給
 * `NextResponse.json` 的結果相同，但型別 `T` 上仍是 `Date` ——
 * payload 內含日期時，前端請以字串解析。
 */
export const ok = <T>(payload: T, message = "OK"): IApiResponse<T> => {
  const safePayload = JSON.parse(
    JSON.stringify(payload, (_key, value) =>
      typeof value === "bigint" ? value.toString() : value,
    ),
  );

  return {
    powerby: POWERBY,
    success: true,
    code: ApiCode.SUCCESS,
    message,
    payload: safePayload,
  };
};

/** Info: (20260810 - Luphia) 失敗信封；`payload` 一律為 null。 */
export const fail = (def: IErrorDef): IApiResponse<null> => ({
  powerby: POWERBY,
  success: false,
  code: def.status,
  errorCode: def.code,
  message: def.message,
  payload: null,
});

/**
 * Info: (20260810 - Luphia) 成功回應。
 *
 * 路由一律用這個，不要直接呼叫 `NextResponse.json` —— 直接呼叫就繞過了
 * 信封，前端得為那個端點另寫一套解析。
 */
export const jsonOk = <T>(payload: T, message = "OK", init?: ResponseInit) =>
  NextResponse.json<IApiResponse<T>>(ok(payload, message), init);

/**
 * Info: (20260810 - Luphia) 失敗回應。HTTP 狀態由 `def.status` 經
 * `HTTP_MAP` 推導，故路由**不需要也不應該**自己寫 `{ status: 4xx }`：
 * 狀態碼只有一個決定點，語意碼與數字狀態不可能不一致。
 */
export const jsonFail = (def: IErrorDef, init?: ResponseInit) =>
  NextResponse.json<IApiResponse<null>>(fail(def), {
    status: httpStatusOf(def.status),
    ...init,
  });

/**
 * Info: (20260810 - Luphia) 由任意例外產生失敗回應。
 * `catch` 區塊用這個，避免每個路由各自判斷例外型別。
 */
export const jsonError = (error: unknown, fallbackMessage?: string) =>
  jsonFail(errorDefOf(error, fallbackMessage));

/**
 * Info: (20260810 - Luphia) 以 `HTTP_MAP` 為唯一對照來源。
 * `?? 500` 只是型別上的保險 —— `HTTP_MAP` 是 `Record<ApiCode, number>`，
 * 缺成員會編譯失敗，實際不會落到這個分支。
 */
function httpStatusOf(code: ApiCode): number {
  return HTTP_MAP[code] ?? 500;
}
