/**
 * 各專案的展示用 3D 施工動畫資料。
 *
 * 這些是「示範版本」：以資料驅動的樣板產生，不需呼叫模型即可重現，
 * 讓 3D 工程視覺一進頁面就有東西可看、也可用來示範版本切換與修訂。
 * 實際使用時，費思會以這些版本為基礎繼續修訂，或完全重做。
 *
 * 同時提供各案的「關鍵要求重點」——它是產生施工設計與數位孿生動畫的依據，
 * 示範資料若缺這一段，動畫的寫實度就無從展現。
 */

import type { DemoSpec } from "./design-animation";

export type ProjectDemo = {
  /** 對應 Project.code。 */
  code: string;
  keyRequirements: string;
  /** 主版本；陣列順序即版號順序（第 1 筆為 v1）。 */
  versions: { spec: DemoSpec; instruction?: string; baseVersion?: number }[];
};

// ── 1. 捷運環狀線南環段（地下車站＋潛盾隧道）──────────────────
const mrtSpec: DemoSpec = {
  code: "PMIS-2026-001",
  name: "捷運環狀線南環段 CQ801 標土建工程",
  location: "新北市板橋區",
  contractor: "大陸工程股份有限公司",
  start: "2025-02-17",
  end: "2029-08-31",
  terrain: "ground",
  items: [
    { name: "交通維持及環境保護設施", kind: "temp", start: "2025-02-17", end: "2029-06-30" },
    { name: "連續壁施作（厚 1.2m）", kind: "dwall", start: "2025-03-01", end: "2026-02-28", qty: "12,400 m²" },
    { name: "開挖及支撐架設", kind: "excavate", start: "2026-01-01", end: "2027-03-31", qty: "186,000 m³" },
    { name: "車站主體結構混凝土", kind: "box", start: "2026-09-01", end: "2028-06-30", qty: "58,000 m³" },
    { name: "潛盾機推進", kind: "bore", start: "2027-01-01", end: "2028-09-30", qty: "2,850 m" },
    { name: "環片組裝及背填灌漿", kind: "segment", start: "2027-02-01", end: "2028-10-31", qty: "1,900 環" },
    { name: "機電預埋管線", kind: "mep", start: "2028-03-01", end: "2029-06-30" },
  ],
  milestones: [
    { title: "連續壁完成", date: "2026-02-28" },
    { title: "開挖到底", date: "2027-03-31" },
    { title: "潛盾隧道貫通", date: "2028-09-30" },
    { title: "車站結構體完成", date: "2028-06-30" },
    { title: "土建竣工", date: "2029-08-31" },
  ],
};

// ── 2. 後龍溪橋改建（河中橋梁，有汛期限制）────────────────────
const bridgeSpec: DemoSpec = {
  code: "PMIS-2026-002",
  name: "西濱快速公路後龍溪橋改建工程",
  location: "苗栗縣後龍鎮",
  contractor: "工信工程股份有限公司",
  start: "2024-12-09",
  end: "2027-06-30",
  terrain: "water",
  items: [
    { name: "施工安全衛生及環境維護", kind: "temp", start: "2024-12-09", end: "2027-05-31" },
    { name: "既有橋梁拆除", kind: "demolish", start: "2025-01-06", end: "2025-04-30" },
    { name: "全套管基樁（D=1500mm）", kind: "pile", start: "2025-04-01", end: "2025-12-31", qty: "96 支" },
    { name: "橋墩柱身及帽梁", kind: "pier", start: "2025-11-01", end: "2026-08-31", qty: "24 座" },
    { name: "預力梁製作及架設", kind: "girder", start: "2026-06-01", end: "2027-01-31", qty: "108 支" },
    { name: "橋面版及引道路面", kind: "deck", start: "2026-12-01", end: "2027-05-31", qty: "13,600 m²" },
  ],
  milestones: [
    { title: "舊橋拆除完成", date: "2025-04-30" },
    { title: "基樁完成", date: "2025-12-31" },
    { title: "下結構完成", date: "2026-08-31" },
    { title: "全橋合龍", date: "2027-01-31" },
    { title: "竣工通車", date: "2027-06-30" },
  ],
  pause: { label: "汛期停工（河道內）", fromMonth: 6, toMonth: 9 },
};

// ── 3. 烏日水資中心監造（服務型，無實體構造物）────────────────
const supervisionSpec: DemoSpec = {
  code: "PMIS-2026-003",
  name: "烏日水資源回收中心擴建工程委託監造技術服務",
  location: "臺中市烏日區",
  contractor: "中興工程顧問股份有限公司",
  start: "2026-03-16",
  end: "2029-03-15",
  terrain: "ground",
  items: [
    { name: "駐地監造人員（專任技師）", kind: "service", start: "2026-03-16", end: "2029-03-15" },
    { name: "品質查驗及抽驗作業", kind: "service", start: "2026-04-01", end: "2029-01-31" },
    { name: "計價審核及契約變更作業", kind: "service", start: "2026-05-01", end: "2029-03-15" },
    { name: "受監造之處理設施結構", kind: "box", start: "2026-06-01", end: "2028-09-30" },
  ],
  milestones: [
    { title: "監造計畫核定", date: "2026-05-31" },
    { title: "第一階段查驗完成", date: "2027-06-30" },
    { title: "設施結構完成查驗", date: "2028-09-30" },
    { title: "監造服務結束", date: "2029-03-15" },
  ],
};

// ── 4. 市立醫院醫療大樓（建築，地下＋地上＋裝修）──────────────
const hospitalSpec: DemoSpec = {
  code: "PMIS-2026-004",
  name: "市立醫院醫療大樓新建工程",
  location: "桃園市中壢區",
  contractor: "潤弘精密工程事業股份有限公司",
  start: "2026-09-01",
  end: "2030-08-31",
  terrain: "ground",
  items: [
    { name: "假設工程及交通維持", kind: "temp", start: "2026-09-01", end: "2030-06-30" },
    { name: "基礎開挖及地下結構", kind: "excavate", start: "2026-10-01", end: "2028-03-31", qty: "72,000 m³" },
    { name: "地下結構體", kind: "box", start: "2027-04-01", end: "2028-06-30" },
    { name: "地上結構及外牆", kind: "floor", start: "2028-01-01", end: "2029-10-31", qty: "48,000 m²" },
    { name: "醫療空間裝修及設備", kind: "fitout", start: "2029-06-01", end: "2030-06-30" },
  ],
  milestones: [
    { title: "地下開挖完成", date: "2028-03-31" },
    { title: "結構體上樑", date: "2029-10-31" },
    { title: "裝修及設備安裝完成", date: "2030-06-30" },
    { title: "竣工取得使用執照", date: "2030-08-31" },
  ],
};

// ── 5. 大里溪排水路護岸（已竣工，水路）────────────────────────
const drainageSpec: DemoSpec = {
  code: "PMIS-2025-018",
  name: "大里溪排水路護岸改善工程",
  location: "臺中市大里區",
  contractor: "宏昇營造有限公司",
  start: "2024-09-02",
  end: "2025-11-28",
  terrain: "water",
  items: [
    { name: "假設工程及圍堰", kind: "temp", start: "2024-09-02", end: "2025-10-31" },
    { name: "混凝土護岸新設", kind: "wall", start: "2024-09-16", end: "2025-08-26", qty: "1,800 m" },
    { name: "排水路疏濬及土方外運", kind: "dredge", start: "2025-03-10", end: "2025-10-09", qty: "42,000 m³" },
  ],
  milestones: [
    { title: "護岸工程完成", date: "2025-08-26" },
    { title: "疏濬完成・通水", date: "2025-10-09" },
    { title: "竣工驗收合格", date: "2025-11-28" },
  ],
  pause: { label: "汛期河道內停工", fromMonth: 6, toMonth: 8 },
};

/** 大里溪的第二版：示範「基於 v1 繼續更新」的結果（護岸分上下游兩段）。 */
const drainageV2: DemoSpec = {
  ...drainageSpec,
  items: [
    { name: "假設工程及圍堰", kind: "temp", start: "2024-09-02", end: "2025-10-31" },
    { name: "混凝土護岸新設（下游段）", kind: "wall", start: "2024-09-16", end: "2025-03-31", qty: "900 m" },
    { name: "混凝土護岸新設（上游段）", kind: "wall", start: "2025-03-01", end: "2025-08-26", qty: "900 m" },
    { name: "排水路疏濬及土方外運", kind: "dredge", start: "2025-03-10", end: "2025-10-09", qty: "42,000 m³" },
  ],
};

export const PROJECT_DEMOS: ProjectDemo[] = [
  {
    code: "PMIS-2026-001",
    keyRequirements: [
      "・車站基地位於既有道路下方，須採半半施工並全程維持雙向各一車道通行。",
      "・連續壁施作期間鄰接建物須設置傾斜儀與沉陷觀測點，每日監測並設管理值。",
      "・潛盾隧道自東側工作井單向推進，穿越既有橋墩基礎時須降低推進速率並加密監測。",
      "・夜間（22:00–07:00）不得進行產生噪音之打擊性作業。",
      "・開挖土方須全數外運至指定收容處理場所，運土車輛須洗車後上路。",
    ].join("\n"),
    versions: [{ spec: mrtSpec }],
  },
  {
    code: "PMIS-2026-002",
    keyRequirements: [
      "・汛期（6–9 月）不得於河道內施工，機具與臨時設施須於汛期前撤離並清除阻水物。",
      "・採半半施工分兩階段：先施作下游側新橋，交通轉移後再拆除上游側舊橋。",
      "・施工期間須維持西濱快速公路雙向各一車道通行，改道須經公路局核可。",
      "・基樁施作採全套管工法，減少泥水外洩並避免影響河川水質。",
      "・預力梁架設須於夜間交通離峰時段進行並全面封閉管制。",
    ].join("\n"),
    versions: [{ spec: bridgeSpec }],
  },
  {
    code: "PMIS-2026-003",
    keyRequirements: [
      "・駐地監造須配置專任技師 1 名及監造員 2 名，全程駐地。",
      "・混凝土澆置前須完成模板、鋼筋、預埋件三項會同查驗並留存紀錄。",
      "・材料進場須抽驗並經審核合格後方可使用；不合格品須即刻退場。",
      "・計價須於承包商提出後 14 日內完成審核，契約變更須先報主辦機關核定。",
      "・現有處理設施須維持營運，施工不得中斷污水處理程序。",
    ].join("\n"),
    versions: [{ spec: supervisionSpec }],
  },
  {
    code: "PMIS-2026-004",
    keyRequirements: [
      "・基地緊鄰營運中院區，施工須維持急診動線與救護車通行淨寬 6 公尺以上。",
      "・地下開挖採逆打工法，鄰院區側設置連續壁與地中壁並全程監測沉陷。",
      "・噪音振動須符合醫療區標準，病房側外牆施工限於 09:00–17:00。",
      "・醫療空間裝修須於潔淨區施作前完成風管清洗並取得潔淨度測試合格報告。",
      "・手術室及加護病房之機電設備須配置不斷電系統並完成整合測試。",
    ].join("\n"),
    versions: [{ spec: hospitalSpec }],
  },
  {
    code: "PMIS-2025-018",
    keyRequirements: [
      "・汛期（6–8 月）不得於河道內施工，圍堰及機具須於汛期前撤離。",
      "・護岸自下游往上游分段施作，每段完成後即回填並恢復通水斷面。",
      "・疏濬土方 42,000 m³ 須全數外運至指定土資場，不得於河岸暫置。",
      "・施工期間須維持排水路通水能力，不得阻斷上游來水。",
      "・鄰接農地側須設置臨時擋土及沉砂設施，避免泥水漫流。",
    ].join("\n"),
    versions: [
      { spec: drainageSpec },
      {
        spec: drainageV2,
        instruction: "護岸改為上下游分兩段施工，下游段先行",
        baseVersion: 1,
      },
    ],
  },
];
