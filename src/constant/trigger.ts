/**
 * 履約事項的觸發方式詞彙（PMIS-15）。
 *
 * 觸發方式決定「期限從哪裡算出來」，而不只是一個標籤。四種方式各需要不同的
 * 輸入：固定日期只要日期；相對期限要基準點與天數；前置事項要指到另一項事項；
 * 條件觸發要說明條件為何。先前四種都只給一個日期欄位，於是後三種的依據
 * 全靠承辦人記在腦裡，契約工期一改就沒人知道哪些期限該跟著動。
 */

/** 相對期限的基準時間點。 */
export const RELATIVE_ANCHORS = [
  {
    id: "PROJECT_START",
    label: "專案開始",
    hint: "專案的開工日。如「開工後 30 日內提送施工計畫」",
    /** 週期性基準：期限會重複發生，非單一日期。 */
    cyclic: false,
  },
  {
    id: "PROJECT_END",
    label: "專案結束",
    hint: "專案的完工日。如「竣工前 60 日完成試運轉」，天數填負數即為之前",
    cyclic: false,
  },
  {
    id: "CONTRACT_SIGNED",
    label: "契約簽訂日",
    hint: "公共工程許多期限自簽約日起算，不必等於開工日",
    cyclic: false,
  },
  {
    id: "NOTICE_TO_PROCEED",
    label: "開工命令日",
    hint: "機關發出開工通知之日",
    cyclic: false,
  },
  {
    id: "PREV_STAGE_DONE",
    label: "上一階段完成日",
    hint: "以本事項所屬階段的前一階段最後完成日為基準",
    cyclic: false,
  },
  {
    id: "MONTHLY",
    label: "每月",
    hint: "定期事項。天數即每月第幾日，如「每月 10 日前提送月報」填 10",
    cyclic: true,
  },
  {
    id: "QUARTERLY",
    label: "每季",
    hint: "定期事項。天數即每季首月起算第幾日",
    cyclic: true,
  },
] as const;

export type RelativeAnchorId = (typeof RELATIVE_ANCHORS)[number]["id"];

export const anchorMeta = (id: string | null | undefined) =>
  RELATIVE_ANCHORS.find((a) => a.id === id) ?? null;

export const relativeAnchorOptions = RELATIVE_ANCHORS.map((a) => ({
  value: a.id,
  label: a.label,
}));

/**
 * 條件觸發的模式。
 *
 * 刻意不提供自由文字：能歸類才能統計與追蹤（例如「有幾項卡在機關回覆」），
 * 全靠自由描述則只能逐項人工閱讀。細節仍可補充於條件說明。
 */
export const CONDITION_KINDS = [
  {
    id: "AGENCY_ACTION",
    label: "機關或第三方行為",
    hint: "期限自外部單位的動作起算，監造只能追蹤不能決定時點",
    patterns: [
      "機關書面通知後",
      "機關審查意見回覆後",
      "設計單位圖說核定後",
      "主管機關許可取得後",
      "用地或路權取得後",
      "管線單位遷移完成後",
    ],
  },
  {
    id: "WORK_EVENT",
    label: "工程事件觸發",
    hint: "自工程本身的事件起算，可由分項進度與查驗紀錄判定",
    patterns: [
      "指定工程分項完成後",
      "查驗合格後",
      "試驗報告提出後",
      "隱蔽部位施作前",
      "分項開工前",
      "階段性完工後",
    ],
  },
  {
    id: "THRESHOLD",
    label: "進度或金額門檻",
    hint: "達到某個累計數字後才啟動，可與估驗台帳串接",
    patterns: [
      "累計估驗達契約金額 25% 後",
      "累計估驗達契約金額 50% 後",
      "累計估驗達契約金額 75% 後",
      "整體進度達 50% 後",
      "整體進度達 80% 後",
    ],
  },
] as const;

export type ConditionKindId = (typeof CONDITION_KINDS)[number]["id"];

export const conditionKindMeta = (id: string | null | undefined) =>
  CONDITION_KINDS.find((c) => c.id === id) ?? null;

export const conditionKindOptions = CONDITION_KINDS.map((c) => ({
  value: c.id,
  label: c.label,
}));

/** 某一條件類型下的可選模式。 */
export function conditionPatterns(kind: string | null | undefined): string[] {
  return [...(conditionKindMeta(kind)?.patterns ?? [])];
}
