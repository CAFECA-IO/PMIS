import {
  obligationRiskOptions,
  obligationStageOptions,
  obligationStatusOptions,
  obligationTriggerOptions,
  type ObligationRisk,
  type ObligationStage,
  type ObligationStatus,
  type ObligationTrigger,
} from "@/constant/obligation";
import {
  checkCompletion,
  completionBlockedMessage,
  type WorkItemState,
} from "./obligation-completion";
import { validateTrigger } from "./obligation-trigger";

/**
 * 履約事項編輯的驗證與解析（純函式，無 I/O，便於單元測試）。
 *
 * 抽出來的理由是這裡藏著一條安全性判斷：表單可以把狀態直接選成「完成」，
 * 若只在完成按鈕上檢查歸屬分項，這張表單就是繞過限制的後門。
 * 這種「看起來只是解析欄位」的地方最需要測試釘住。
 */

/** 編輯表單送出的內容（皆為字串）。 */
export type ObligationEditInput = {
  code?: string;
  title?: string;
  stage?: string;
  risk?: string;
  triggerType?: string;
  status?: string;
  dueDate?: string;
  actualDate?: string;
  ownerUnit?: string;
  ownerName?: string;
  contractBasis?: string;
  weight?: string;
  commissioning?: string;
  offsetDays?: string;
  docNo?: string;
  note?: string;
  /** 觸發設定。 */
  relativeAnchor?: string;
  predecessorId?: string;
  conditionKind?: string;
  conditionDetail?: string;
  dueDateOverridden?: string;
};

/** 目前資料庫中的值，用於未送出或不合法欄位的退回值。 */
export type ObligationCurrent = {
  code: string;
  status: ObligationStatus | string;
  stage: ObligationStage | string;
  risk: ObligationRisk | string;
  triggerType: ObligationTrigger | string;
  weight: number;
};

/** 寫回資料庫的內容。 */
export type ObligationEditData = {
  code: string;
  title: string;
  stage: ObligationStage;
  risk: ObligationRisk;
  triggerType: ObligationTrigger;
  status: ObligationStatus;
  dueDate: Date | null;
  actualDate: Date | null;
  ownerUnit: string | null;
  ownerName: string | null;
  contractBasis: string | null;
  weight: number;
  commissioning: boolean;
  offsetDays: number | null;
  docNo: string | null;
  note: string | null;
  relativeAnchor: string | null;
  predecessorId: string | null;
  conditionKind: string | null;
  conditionDetail: string | null;
  dueDateOverridden: boolean;
};

export type EditPlan =
  | { ok: true; data: ObligationEditData }
  | { ok: false; error: string };

const text = (v: string | undefined) => v?.trim() ?? "";

const nullable = (v: string | undefined) => {
  const s = text(v);
  return s === "" ? null : s;
};

/** 日期字串轉 Date；空白與不合法皆視為未填，不寫入 Invalid Date。 */
export function dateOrNull(v: string | undefined): Date | null {
  const s = text(v);
  if (s === "") return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function intOrNull(v: string | undefined): number | null {
  const s = text(v);
  if (s === "") return null;
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

/** 核選方塊未勾選時不會出現在 FormData，故只認明確的勾選值。 */
export function isChecked(v: string | undefined): boolean {
  const s = text(v);
  return s === "on" || s === "true" || s === "1";
}

/** 落在選項清單內才採用，否則保留原值（避免竄改的值寫入資料庫）。 */
function oneOf<T extends string>(
  value: string | undefined,
  allowed: readonly { value: string }[],
  fallback: T,
): T {
  const s = text(value);
  return allowed.some((o) => o.value === s) ? (s as T) : fallback;
}

/**
 * 決定這次編輯能不能寫入，以及要寫入什麼。
 *
 * @param workItems 歸屬的工程分項；轉為完成時據此把關
 */
export function planObligationUpdate(
  input: ObligationEditInput,
  current: ObligationCurrent,
  workItems: WorkItemState[],
): EditPlan {
  const title = text(input.title);
  if (!title) return { ok: false, error: "履約事項名稱不可空白。" };
  const code = text(input.code);
  if (!code) return { ok: false, error: "管制編號不可空白。" };

  const triggerType = oneOf<ObligationTrigger>(
    input.triggerType,
    obligationTriggerOptions,
    current.triggerType as ObligationTrigger,
  );
  const status = oneOf<ObligationStatus>(
    input.status,
    obligationStatusOptions,
    current.status as ObligationStatus,
  );

  // 由未完成改為完成時，套用與完成按鈕相同的關卡
  if (status === "DONE" && current.status !== "DONE") {
    const check = checkCompletion(workItems);
    if (!check.ok) return { ok: false, error: completionBlockedMessage(check) };
  }

  /*
    觸發設定須完整。這裡擋下的是「選了相對期限卻沒選基準點」這類
    半套設定 —— 存進去之後期限永遠算不出來，而畫面上看不出為什麼。
  */
  const triggerError = validateTrigger({
    triggerType,
    dueDate: text(input.dueDate) || null,
    relativeAnchor: nullable(input.relativeAnchor),
    offsetDays: intOrNull(input.offsetDays),
    predecessorId: nullable(input.predecessorId),
    conditionKind: nullable(input.conditionKind),
    conditionDetail: nullable(input.conditionDetail),
    dueDateOverridden: isChecked(input.dueDateOverridden),
  });
  if (triggerError) return { ok: false, error: triggerError };

  const weight = intOrNull(input.weight);
  if (weight !== null && weight < 1) {
    return { ok: false, error: "進度權重須為 1 以上的整數。" };
  }

  const actualDate = dateOrNull(input.actualDate);
  return {
    ok: true,
    data: {
      code,
      title,
      stage: oneOf<ObligationStage>(
        input.stage,
        obligationStageOptions,
        current.stage as ObligationStage,
      ),
      risk: oneOf<ObligationRisk>(
        input.risk,
        obligationRiskOptions,
        current.risk as ObligationRisk,
      ),
      triggerType,
      status,
      dueDate: dateOrNull(input.dueDate),
      /*
        轉為完成卻沒填完成日時補今天。
        少了這一步會出現「狀態已完成、完成日空白」的紀錄，
        而進度上捲是以完成日計算的，那筆事項會被當成還沒做完。
      */
      actualDate: status === "DONE" ? (actualDate ?? new Date()) : actualDate,
      ownerUnit: nullable(input.ownerUnit),
      ownerName: nullable(input.ownerName),
      contractBasis: nullable(input.contractBasis),
      weight: weight ?? current.weight,
      commissioning: isChecked(input.commissioning),
      offsetDays: intOrNull(input.offsetDays),
      docNo: nullable(input.docNo),
      note: nullable(input.note),
      /*
        只保留與所選觸發方式相關的欄位，其餘一律清空。
        把觸發方式從「相對期限」改成「固定日期」後若留著舊的基準點，
        日後有人改回相對期限就會沿用一個早已無意義的設定。
      */
      relativeAnchor: triggerType === "RELATIVE_DUE" ? nullable(input.relativeAnchor) : null,
      predecessorId: triggerType === "PREDECESSOR" ? nullable(input.predecessorId) : null,
      conditionKind: triggerType === "CONDITION" ? nullable(input.conditionKind) : null,
      conditionDetail:
        triggerType === "CONDITION" ? nullable(input.conditionDetail) : null,
      // 固定日期本身就是人工指定，不需另外標記
      dueDateOverridden:
        triggerType !== "FIXED_DATE" && isChecked(input.dueDateOverridden),
    },
  };
}
