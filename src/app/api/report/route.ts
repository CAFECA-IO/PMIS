import * as reportService from "@/service/report.service";
import type { ReportType } from "@/service/report.service";
import { getCurrentUser } from "@/service/auth.service";
import {
  canAccessModule,
  canEditModule,
  getUserModulePermissions,
} from "@/service/access.service";
import { toFaithError } from "@/service/faith-error";
import { jsonOk, jsonFail, jsonError } from "@/lib/api-response";
import { API_ERRORS } from "@/lib/api-error";

export const runtime = "nodejs";

/*
  Info: (20260806 - Julian) 本端點只產彙整報表（週／月／季／年）。

  刻意不含 DAILY：日報是監造人工填報的 `SupervisionReport`，
  與這裡的 `GeneratedReport` 是兩種東西。放行 DAILY 會讓任何有編輯權限者
  每天多留一列，而清單上與同期間的週報難以分辨。
*/
const VALID: ReportType[] = ["WEEKLY", "MONTHLY", "QUARTERLY", "ANNUAL"];

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return jsonFail(API_ERRORS.AU_NOT_SIGNED_IN);

  /*
    Info: (20260806 - Julian) ── 模組權限必須在這裡擋，不能只靠專案成員判定 ──────────────

    產製會呼叫 LLM（`faith.generatePeriodReview`），而那是有成本的動作。
    `generateReport` 內的 `canAccess` 只檢查「是不是這個專案的成員」；
    模組權限（`/logs`）是另一層 —— 一個 `/logs` 權限為 NONE、連頁面都
    打不開的帳號，只要是某專案的成員，就能對本端點連續發請求，
    每一次都燒一次 LLM。因為不寫入，留存清單上也看不到任何痕跡。

    `currentUserCanEdit` 之所以不足以擋：它的回傳值被當作 persist 旗標，
    只決定要不要寫 DB，而 LLM 在那個決定之前就已經跑完了。
    故此處先取一次權限，VIEW 以下直接回 403，EDIT 與否再交給 persist。
  */
  const perms = await getUserModulePermissions(user);
  if (!canAccessModule(perms, "/logs")) {
    return jsonFail(API_ERRORS.FO_MODULE_FORBIDDEN);
  }

  try {
    const body = (await request.json()) as {
      projectId?: string;
      type?: string;
      refDate?: string;
    };
    if (!body.projectId) {
      return jsonFail(API_ERRORS.VA_MISSING_PROJECT);
    }
    /*
      Info: (20260806 - Julian) 週期不在白名單就拒絕，不要退回 MONTHLY —— 與下方基準日同一個道理：
      使用者以為在產季報、系統默默產了月報並以月報的期間鍵留存，
      比直接報錯更難察覺。
    */
    if (!VALID.includes(body.type as ReportType)) {
      return jsonFail(API_ERRORS.VA_INVALID_REPORT_TYPE);
    }
    const type = body.type as ReportType;

    /*
      Info: (20260806 - Julian) 基準日不合理就拒絕，不要退回「今天」——
      使用者以為在產 2026 年 8 月，系統卻默默產了本月，那比報錯更糟。
    */
    if (reportService.parseRefDate(body.refDate) === null) {
      return jsonFail(API_ERRORS.VA_INVALID_REF_DATE);
    }

    /*
      Info: (20260806 - Julian) 產出即留存（決策 J-a）：回傳的 markdown 與寫進 GeneratedReport 的
      是同一個字串，故「畫面上這一版」與「留存的那一版」不可能不同。
      僅有編輯權限者會留存 —— 純瀏覽不應在留存清單留下紀錄。

      用戶端已離開（切換週期時會 abort 前一次請求）則不留存：
      使用者不會看到這一版，留下來只是在清單裡多一列沒人讀過的草稿。
      注意這**擋不掉 LLM 的花費** —— 產製在下一行才發生，
      而在那之前中斷連線的訊號未必已經到達。
    */
    const persist =
      canEditModule(perms, "/logs") && !request.signal.aborted;

    const view = await reportService.generateReportView(
      body.projectId,
      type,
      body.refDate,
      { id: user.id, name: user.name, role: user.role },
      persist,
    );
    if (!view) {
      return jsonFail(API_ERRORS.FO_PROJECT_INACCESSIBLE);
    }
    return jsonOk({
      ...view.report,
      savedId: view.savedId,
      confirmedId: view.confirmedId,
    });
  } catch (error) {
    /*
      Info: (20260810 - Luphia) 沿用 `toFaithError` 整理過的可讀訊息 ——
      LLM 失敗的原因（額度、逾時、模型拒答）對使用者有意義，
      不該換成罐頭的「系統忙線中」。語意碼仍統一為 IN000001。
    */
    return jsonError(error, toFaithError(error).message);
  }
}
