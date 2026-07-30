/**
 * 費思對話可檢索的結構化資料目錄。
 *
 * 為何要有目錄 ——
 * 第一段規劃時模型看不到資料庫，只能從「有哪些資料可查」的清單裡挑。
 * 目錄同時綁定模組路由，讓檢索沿用既有的職位權限：
 * 沒有財務權限的人，費思就不該替他讀出財務數字。
 */

export type ChatDatasetId =
  | "obligations"
  | "scope"
  | "quality"
  | "schedule"
  | "submittals"
  | "ehs"
  | "finance"
  | "carbon"
  | "alerts"
  | "overview";

export type ChatDatasetSpec = {
  id: ChatDatasetId;
  label: string;
  /** 給模型判斷「這個問題該不該查這份資料」的說明。 */
  hint: string;
  /** 對應模組路由（PMIS_MODULES 的 key），用於權限過濾。 */
  module: string;
};

export const CHAT_DATASETS: ChatDatasetSpec[] = [
  {
    id: "obligations",
    label: "履約事項",
    hint: "契約應辦事項的管制編號、階段、期限、狀態、風險與責任分工，含契約依據條號",
    module: "/obligations",
  },
  {
    id: "scope",
    label: "合約標的與工程分項",
    hint: "合約標的（履約標的）及其下的工程分項名稱、類別與完成百分比",
    module: "/projects",
  },
  {
    id: "quality",
    label: "施工查驗與缺失",
    hint: "查驗紀錄的類別與結果，以及缺失的嚴重度、狀態、負責人與改善期限",
    module: "/quality",
  },
  {
    id: "schedule",
    label: "時程進度",
    hint: "各工程分項的計畫與實際起訖日、完成百分比與延誤狀態",
    module: "/schedule",
  },
  {
    id: "submittals",
    label: "送審與簽核",
    hint: "材料與施工圖送審的提送日、審查日、審查結果與目前狀態",
    module: "/submittals",
  },
  {
    id: "ehs",
    label: "環安衛稽核",
    hint: "工安、環保、交維、職業健康稽核的地點、結果、缺失描述與改善期限",
    module: "/ehs",
  },
  {
    id: "finance",
    label: "財務收支",
    hint: "收支憑證明細與收入、支出、損益、現金流彙總",
    module: "/finance",
  },
  {
    id: "carbon",
    label: "碳盤查",
    hint: "各盤查期間的排放總量與範疇一、二、三的分布",
    module: "/carbon",
  },
  {
    id: "alerts",
    label: "期限預警",
    hint: "目前實際觸發的預警：已逾期、即將到期與條件式預警，含建議處置",
    module: "/calendar",
  },
  {
    id: "overview",
    label: "專案概況",
    hint: "專案基本資料、整體進度與計畫進度的落差、契約金額與付款、剩餘天數",
    module: "/projects",
  },
];

export function datasetSpec(id: string): ChatDatasetSpec | undefined {
  return CHAT_DATASETS.find((d) => d.id === id);
}
