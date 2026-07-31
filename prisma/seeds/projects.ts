/**
 * 專案層模擬資料。
 *
 * 自 seed.ts 抽出來，理由不只是長度：這一層的資料互相牽制 ——
 * 工程分項的「契約數量 × 單價」加總要對得上契約金額、履約事項的權重要
 * 加得起來、每一項履約事項都該指得回某一項合約標的、日期要有先後。
 * 這些關係散在一支千行的腳本裡就沒有人會去對，而對不上的模擬資料
 * 比沒有資料更糟：畫面看起來正常，數字卻是假的，之後拿它驗證新功能
 * 會得到錯誤的結論。抽成模組後可以用一支不需要資料庫的檢查跑過一遍。
 *
 * 涵蓋範圍刻意包含四種情境：
 *  1. 進度正常的施工案（土建，完整台帳數據）
 *  2. 明顯落後且有逾期履約事項的施工案
 *  3. 委託監造技術服務案 —— 沒有施工節點，履約事項全是定期義務
 *  4. 尚未開工的規劃中案件（各欄位齊備但無實績）
 * 另有一件已竣工的案子，用於驗證「完工」狀態下的畫面。
 */

import type { PrismaClient } from "../../src/generated/prisma/client";
import type { ProjectStatus } from "../../src/generated/prisma/enums";

// ── 型別 ────────────────────────────────────────────────────

/** 合約標的：契約「履約標的」條逐項照抄的結果。 */
export type ScopeSeed = {
  code?: string;
  title: string;
  sourceClause: string;
};

/** 工程分項，含估驗台帳所需的數量與單價。 */
export type WorkItemSeed = {
  code: string;
  name: string;
  category: string;
  wbsCode: string;
  wbsCategory: "civil" | "pipeline" | "mechanical" | "electrical" | "safety" | "indirect";
  unit: string;
  contractQty: number;
  unitPrice: number;
  /** 累計完成量。0 代表尚未施作。 */
  completedQty: number;
  /** 累計估驗量；通常略小於完成量（完成但未估驗）。 */
  valuatedQty: number;
  progress: number;
  status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "DELAYED";
  plannedStart?: string;
  plannedEnd?: string;
  actualStart?: string;
  actualEnd?: string;
  /** 所屬合約標的（title）；供溯源。 */
  scopeRef?: string;
  /** 所屬履約事項（code）。 */
  obligationRef?: string;
};

export type ObligationSeed = {
  code: string;
  title: string;
  stage:
    | "CONCEPT_DESIGN"
    | "DETAIL_DESIGN"
    | "TENDER"
    | "CONSTRUCTION"
    | "COMMISSIONING"
    | "HANDOVER"
    | "OTHER";
  risk: "GREEN" | "YELLOW" | "ORANGE" | "RED" | "PURPLE";
  status:
    | "NOT_STARTED"
    | "IN_PROGRESS"
    | "PENDING_REVIEW"
    | "PENDING_EXTERNAL"
    | "OVERDUE"
    | "DONE";
  triggerType?: "FIXED_DATE" | "RELATIVE_DUE" | "PREDECESSOR" | "CONDITION";
  weight: number;
  dueDate?: string;
  actualDate?: string;
  offsetDays?: number;
  commissioning?: boolean;
  ownerUnit?: string;
  ownerName?: string;
  /** 契約依據條次。每一項都必須有 —— 這是日後溯源的唯一線索。 */
  contractBasis: string;
  docNo?: string;
  note?: string;
  /** 源自哪一項合約標的（title）。 */
  scopeRef?: string;
};

export type ProjectSeed = {
  /** seed.ts 內部引用用的代號。 */
  key: string;
  code: string;
  name: string;
  description: string;
  location: string;
  contractNo: string;
  client: string;
  contractor: string;
  supervisor: string;
  /** 契約金額。施工案應等於各分項「數量 × 單價」之和。 */
  budget: number;
  floorArea?: number;
  lat?: number;
  lng?: number;
  signedDate: string;
  noticeDate?: string;
  startDate?: string;
  endDate?: string;
  status: ProjectStatus;
  scope: ScopeSeed[];
  obligations: ObligationSeed[];
  workItems: WorkItemSeed[];
};

// ── 資料 ────────────────────────────────────────────────────

/*
  金額的湊法：先定各分項的數量與單價，budget 再填其總和。
  反過來（先定一個好記的契約金額再回頭湊數量）會湊不平，
  而畫面上「累計估驗 / 契約金額」的百分比就會是錯的。
*/

/** 1. 進度正常的捷運土建案。 */
const mrt: ProjectSeed = {
  key: "mrt",
  code: "PMIS-2026-001",
  name: "捷運環狀線南環段 CQ801 標土建工程",
  description:
    "南環段 3 座地下車站與潛盾隧道土建工程監造，含連續壁、開挖支撐及車站主體結構。",
  location: "新北市板橋區",
  contractNo: "CQ801-C-1150012",
  client: "新北市政府捷運工程局",
  contractor: "大陸工程股份有限公司",
  supervisor: "台灣世曦工程顧問股份有限公司",
  budget: 3_311_300_000,
  floorArea: 48_600,
  lat: 25.0128,
  lng: 121.4628,
  signedDate: "2025-01-20",
  noticeDate: "2025-02-10",
  startDate: "2025-02-17",
  endDate: "2029-08-31",
  status: "ACTIVE",
  scope: [
    { code: "(一)", title: "車站區連續壁及擋土支撐施作", sourceClause: "契約第二條 履約標的" },
    { code: "(二)", title: "潛盾隧道推進及環片組裝", sourceClause: "契約第二條 履約標的" },
    { code: "(三)", title: "車站主體結構及出入口工程", sourceClause: "契約第二條 履約標的" },
    { code: "(四)", title: "機電預埋管線及設備基座", sourceClause: "契約第二條 履約標的" },
    { code: "(五)", title: "施工期間交通維持及環境保護", sourceClause: "契約第二條 履約標的" },
  ],
  obligations: [
    {
      code: "PMIS-2026-001-001",
      title: "開工",
      stage: "CONSTRUCTION",
      risk: "GREEN",
      status: "DONE",
      triggerType: "RELATIVE_DUE",
      offsetDays: 7,
      weight: 5,
      dueDate: "2025-02-17",
      actualDate: "2025-02-17",
      ownerUnit: "工務組",
      ownerName: "林建良",
      contractBasis: "契約第七條第一款 開工期限",
      note: "自開工命令日起 7 日內開工。",
    },
    {
      code: "PMIS-2026-001-002",
      title: "連續壁及擋土支撐完成",
      stage: "CONSTRUCTION",
      risk: "GREEN",
      status: "DONE",
      weight: 20,
      dueDate: "2026-06-30",
      actualDate: "2026-06-24",
      ownerUnit: "工務組",
      ownerName: "林建良",
      contractBasis: "契約第八條 施工進度 附表一之一",
      scopeRef: "車站區連續壁及擋土支撐施作",
    },
    {
      code: "PMIS-2026-001-003",
      title: "潛盾隧道貫通",
      stage: "CONSTRUCTION",
      risk: "YELLOW",
      status: "IN_PROGRESS",
      weight: 25,
      dueDate: "2027-10-31",
      ownerUnit: "隧道組",
      ownerName: "張哲維",
      contractBasis: "契約第八條 施工進度 附表一之二",
      scopeRef: "潛盾隧道推進及環片組裝",
    },
    {
      code: "PMIS-2026-001-004",
      title: "車站主體結構完成",
      stage: "CONSTRUCTION",
      risk: "GREEN",
      status: "NOT_STARTED",
      triggerType: "PREDECESSOR",
      weight: 25,
      dueDate: "2028-12-31",
      ownerUnit: "工務組",
      ownerName: "林建良",
      contractBasis: "契約第八條 施工進度 附表一之三",
      scopeRef: "車站主體結構及出入口工程",
      note: "須待潛盾隧道貫通後始得全面施作。",
    },
    {
      code: "PMIS-2026-001-005",
      title: "機電預埋查驗完成",
      stage: "CONSTRUCTION",
      risk: "GREEN",
      status: "NOT_STARTED",
      weight: 10,
      dueDate: "2029-03-31",
      ownerUnit: "機電組",
      ownerName: "黃志偉",
      contractBasis: "契約第九條第四款 隱蔽工程查驗",
      scopeRef: "機電預埋管線及設備基座",
    },
    {
      code: "PMIS-2026-001-006",
      title: "每季提送交通維持執行檢討報告",
      stage: "CONSTRUCTION",
      risk: "GREEN",
      status: "IN_PROGRESS",
      triggerType: "RELATIVE_DUE",
      offsetDays: 90,
      weight: 5,
      dueDate: "2026-09-30",
      ownerUnit: "工務組",
      ownerName: "周雅婷",
      contractBasis: "契約第十四條第三款 交通維持",
      scopeRef: "施工期間交通維持及環境保護",
    },
    {
      code: "PMIS-2026-001-007",
      title: "全案竣工查驗",
      stage: "HANDOVER",
      risk: "PURPLE",
      status: "NOT_STARTED",
      triggerType: "CONDITION",
      weight: 10,
      dueDate: "2029-08-31",
      commissioning: true,
      ownerUnit: "工務組",
      ownerName: "王振豐",
      contractBasis: "契約第十六條 驗收",
      note: "須全部工程完成且機關通知後始辦理。",
    },
  ],
  workItems: [
    {
      code: "WI-001",
      name: "連續壁施作（厚 1.2m）",
      category: "結構",
      wbsCode: "WBS-1.1",
      wbsCategory: "civil",
      unit: "m2",
      contractQty: 18_400,
      unitPrice: 32_000,
      completedQty: 18_400,
      valuatedQty: 18_400,
      progress: 100,
      status: "COMPLETED",
      plannedStart: "2025-03-01",
      plannedEnd: "2026-06-30",
      actualStart: "2025-03-06",
      actualEnd: "2026-06-24",
      scopeRef: "車站區連續壁及擋土支撐施作",
      obligationRef: "PMIS-2026-001-002",
    },
    {
      code: "WI-002",
      name: "開挖及支撐架設",
      category: "土方",
      wbsCode: "WBS-1.2",
      wbsCategory: "civil",
      unit: "m3",
      contractQty: 246_000,
      unitPrice: 1_850,
      completedQty: 246_000,
      valuatedQty: 246_000,
      progress: 100,
      status: "COMPLETED",
      plannedStart: "2025-08-01",
      plannedEnd: "2026-06-30",
      actualStart: "2025-08-11",
      actualEnd: "2026-06-20",
      scopeRef: "車站區連續壁及擋土支撐施作",
      obligationRef: "PMIS-2026-001-002",
    },
    {
      code: "WI-003",
      name: "潛盾機推進",
      category: "隧道",
      wbsCode: "WBS-2.1",
      wbsCategory: "civil",
      unit: "m",
      contractQty: 4_200,
      unitPrice: 285_000,
      completedQty: 1_680,
      valuatedQty: 1_560,
      progress: 40,
      status: "IN_PROGRESS",
      plannedStart: "2026-03-01",
      plannedEnd: "2027-10-31",
      actualStart: "2026-03-09",
      scopeRef: "潛盾隧道推進及環片組裝",
      obligationRef: "PMIS-2026-001-003",
    },
    {
      code: "WI-004",
      name: "環片組裝及背填灌漿",
      category: "隧道",
      wbsCode: "WBS-2.2",
      wbsCategory: "civil",
      unit: "環",
      contractQty: 2_800,
      unitPrice: 96_000,
      completedQty: 1_120,
      valuatedQty: 1_040,
      progress: 40,
      status: "IN_PROGRESS",
      plannedStart: "2026-03-15",
      plannedEnd: "2027-11-30",
      actualStart: "2026-03-20",
      scopeRef: "潛盾隧道推進及環片組裝",
      obligationRef: "PMIS-2026-001-003",
    },
    {
      code: "WI-005",
      name: "車站主體結構混凝土",
      category: "結構",
      wbsCode: "WBS-3.1",
      wbsCategory: "civil",
      unit: "m3",
      contractQty: 62_000,
      unitPrice: 8_600,
      completedQty: 0,
      valuatedQty: 0,
      progress: 0,
      status: "NOT_STARTED",
      plannedStart: "2027-11-01",
      plannedEnd: "2028-12-31",
      scopeRef: "車站主體結構及出入口工程",
      obligationRef: "PMIS-2026-001-004",
    },
    {
      code: "WI-006",
      name: "機電預埋管線",
      category: "機電",
      wbsCode: "WBS-4.1",
      wbsCategory: "electrical",
      unit: "m",
      contractQty: 34_000,
      unitPrice: 2_400,
      completedQty: 0,
      valuatedQty: 0,
      progress: 0,
      status: "NOT_STARTED",
      plannedStart: "2028-06-01",
      plannedEnd: "2029-03-31",
      scopeRef: "機電預埋管線及設備基座",
      obligationRef: "PMIS-2026-001-005",
    },
    {
      code: "WI-007",
      name: "交通維持及環境保護設施",
      category: "假設工程",
      wbsCode: "WBS-5.1",
      wbsCategory: "safety",
      unit: "式",
      contractQty: 1,
      unitPrice: 186_800_000,
      completedQty: 0.45,
      valuatedQty: 0.42,
      progress: 45,
      status: "IN_PROGRESS",
      plannedStart: "2025-02-17",
      plannedEnd: "2029-08-31",
      actualStart: "2025-02-17",
      scopeRef: "施工期間交通維持及環境保護",
      obligationRef: "PMIS-2026-001-006",
    },
  ],
};

/** 2. 明顯落後、且有逾期履約事項的橋梁改建案。 */
const bridge: ProjectSeed = {
  key: "bridge",
  code: "PMIS-2026-002",
  name: "西濱快速公路後龍溪橋改建工程",
  description: "既有橋梁拆除重建，含基樁、橋墩、預力梁架設及引道路面工程。",
  location: "苗栗縣後龍鎮",
  contractNo: "WCH-115-BR-024",
  client: "交通部公路局中區養護工程分局",
  contractor: "麗明營造股份有限公司",
  supervisor: "中興工程顧問股份有限公司",
  budget: 1_000_400_000,
  lat: 24.6152,
  lng: 120.7869,
  signedDate: "2024-11-08",
  noticeDate: "2024-12-02",
  startDate: "2024-12-09",
  endDate: "2027-06-30",
  status: "ACTIVE",
  scope: [
    { code: "1", title: "既有橋梁拆除及廢棄物清運", sourceClause: "契約第二條 工作範圍" },
    { code: "2", title: "橋梁基樁及基礎工程", sourceClause: "契約第二條 工作範圍" },
    { code: "3", title: "橋墩及帽梁工程", sourceClause: "契約第二條 工作範圍" },
    { code: "4", title: "預力梁製作及架設", sourceClause: "契約第二條 工作範圍" },
    { code: "5", title: "橋面版及引道路面工程", sourceClause: "契約第二條 工作範圍" },
  ],
  obligations: [
    {
      code: "PMIS-2026-002-001",
      title: "既有橋梁拆除完成",
      stage: "CONSTRUCTION",
      risk: "GREEN",
      status: "DONE",
      weight: 10,
      dueDate: "2025-05-31",
      actualDate: "2025-05-28",
      ownerUnit: "工務組",
      ownerName: "陳世昌",
      contractBasis: "契約第八條 施工進度表 項次 1",
      scopeRef: "既有橋梁拆除及廢棄物清運",
    },
    {
      code: "PMIS-2026-002-002",
      title: "全部基樁完成",
      stage: "CONSTRUCTION",
      risk: "ORANGE",
      status: "OVERDUE",
      weight: 20,
      dueDate: "2026-03-31",
      ownerUnit: "工務組",
      ownerName: "陳世昌",
      contractBasis: "契約第八條 施工進度表 項次 2",
      scopeRef: "橋梁基樁及基礎工程",
      note: "河川高水位期停工，實際完成 82%。",
    },
    {
      code: "PMIS-2026-002-003",
      title: "橋墩及帽梁完成",
      stage: "CONSTRUCTION",
      risk: "RED",
      status: "OVERDUE",
      triggerType: "PREDECESSOR",
      weight: 25,
      dueDate: "2026-06-30",
      ownerUnit: "工務組",
      ownerName: "陳世昌",
      contractBasis: "契約第八條 施工進度表 項次 3",
      scopeRef: "橋墩及帽梁工程",
      note: "受基樁延誤連動，尚未開始 P3、P4 墩柱。",
    },
    {
      code: "PMIS-2026-002-004",
      title: "預力梁架設完成",
      stage: "CONSTRUCTION",
      risk: "ORANGE",
      status: "NOT_STARTED",
      triggerType: "PREDECESSOR",
      weight: 25,
      dueDate: "2027-01-31",
      ownerUnit: "橋梁組",
      ownerName: "許文彬",
      contractBasis: "契約第八條 施工進度表 項次 4",
      scopeRef: "預力梁製作及架設",
    },
    {
      code: "PMIS-2026-002-005",
      title: "進度落後逾 10% 提送趕工計畫",
      stage: "CONSTRUCTION",
      risk: "RED",
      status: "PENDING_REVIEW",
      triggerType: "CONDITION",
      weight: 5,
      dueDate: "2026-07-31",
      ownerUnit: "工務組",
      ownerName: "陳世昌",
      contractBasis: "契約第十九條第二款 進度落後之處理",
      docNo: "麗明字第1150214號",
      note: "已提送，待機關審核。",
    },
    {
      code: "PMIS-2026-002-006",
      title: "颱風災損工期展延申請",
      stage: "OTHER",
      risk: "YELLOW",
      status: "PENDING_EXTERNAL",
      triggerType: "RELATIVE_DUE",
      offsetDays: 30,
      weight: 5,
      dueDate: "2026-08-15",
      ownerUnit: "工務組",
      ownerName: "陳世昌",
      contractBasis: "契約第二十二條 不可歸責於廠商之延誤",
      docNo: "麗明字第1150187號",
      note: "凱米颱風停工 32 日，展延案待公路局核定。",
    },
    {
      code: "PMIS-2026-002-007",
      title: "通車前初驗",
      stage: "HANDOVER",
      risk: "GREEN",
      status: "NOT_STARTED",
      weight: 10,
      dueDate: "2027-05-31",
      commissioning: true,
      ownerUnit: "工務組",
      ownerName: "陳世昌",
      contractBasis: "契約第十六條第一款 初驗",
      scopeRef: "橋面版及引道路面工程",
    },
  ],
  workItems: [
    {
      code: "WI-101",
      name: "既有橋梁拆除",
      category: "拆除",
      wbsCode: "WBS-1.1",
      wbsCategory: "civil",
      unit: "式",
      contractQty: 1,
      unitPrice: 128_000_000,
      completedQty: 1,
      valuatedQty: 1,
      progress: 100,
      status: "COMPLETED",
      plannedStart: "2025-01-06",
      plannedEnd: "2025-05-31",
      actualStart: "2025-01-13",
      actualEnd: "2025-05-28",
      scopeRef: "既有橋梁拆除及廢棄物清運",
      obligationRef: "PMIS-2026-002-001",
    },
    {
      code: "WI-102",
      name: "全套管基樁（D=1500mm）",
      category: "基礎",
      wbsCode: "WBS-2.1",
      wbsCategory: "civil",
      unit: "m",
      contractQty: 3_600,
      unitPrice: 42_000,
      completedQty: 2_952,
      valuatedQty: 2_880,
      progress: 82,
      status: "DELAYED",
      plannedStart: "2025-06-01",
      plannedEnd: "2026-03-31",
      actualStart: "2025-06-16",
      scopeRef: "橋梁基樁及基礎工程",
      obligationRef: "PMIS-2026-002-002",
    },
    {
      code: "WI-103",
      name: "橋墩柱身及帽梁",
      category: "結構",
      wbsCode: "WBS-3.1",
      wbsCategory: "civil",
      unit: "m3",
      contractQty: 12_400,
      unitPrice: 12_800,
      completedQty: 3_100,
      valuatedQty: 2_976,
      progress: 25,
      status: "DELAYED",
      plannedStart: "2025-11-01",
      plannedEnd: "2026-06-30",
      actualStart: "2025-12-08",
      scopeRef: "橋墩及帽梁工程",
      obligationRef: "PMIS-2026-002-003",
    },
    {
      code: "WI-104",
      name: "預力梁製作及架設",
      category: "結構",
      wbsCode: "WBS-4.1",
      wbsCategory: "civil",
      unit: "支",
      contractQty: 96,
      unitPrice: 4_250_000,
      completedQty: 0,
      valuatedQty: 0,
      progress: 0,
      status: "NOT_STARTED",
      plannedStart: "2026-07-01",
      plannedEnd: "2027-01-31",
      scopeRef: "預力梁製作及架設",
      obligationRef: "PMIS-2026-002-004",
    },
    {
      code: "WI-105",
      name: "橋面版及引道路面",
      category: "道路",
      wbsCode: "WBS-5.1",
      wbsCategory: "civil",
      unit: "m2",
      contractQty: 14_800,
      unitPrice: 7_600,
      completedQty: 0,
      valuatedQty: 0,
      progress: 0,
      status: "NOT_STARTED",
      plannedStart: "2027-01-01",
      plannedEnd: "2027-05-31",
      scopeRef: "橋面版及引道路面工程",
      obligationRef: "PMIS-2026-002-007",
    },
    {
      code: "WI-106",
      name: "施工安全衛生及環境維護",
      category: "假設工程",
      wbsCode: "WBS-6.1",
      wbsCategory: "safety",
      unit: "式",
      contractQty: 1,
      unitPrice: 42_000_000,
      completedQty: 0.55,
      valuatedQty: 0.52,
      progress: 55,
      status: "IN_PROGRESS",
      plannedStart: "2024-12-09",
      plannedEnd: "2027-06-30",
      actualStart: "2024-12-09",
    },
  ],
};

/**
 * 3. 委託監造技術服務案。
 *
 * 這一件刻意沒有施工節點：服務型契約的履約事項幾乎都是定期義務
 * （每月月報、每季督導會議、巡查頻率）與相對期限義務（收文後幾日內審畢）。
 * 沒有這種案子，甘特圖與履約事項頁只會被施工節點填滿，
 * 那些定期義務的呈現就從來沒被驗證過。
 */
const supervision: ProjectSeed = {
  key: "supervision",
  code: "PMIS-2026-003",
  name: "烏日水資源回收中心擴建工程委託監造技術服務",
  description:
    "擴建工程施工階段監造服務，含施工計畫審查、品質查驗、進度督導、估驗計價審核及竣工結算。",
  location: "臺中市烏日區",
  contractNo: "TCWR-115-S-007",
  client: "臺中市政府水利局",
  contractor: "冠陽工程股份有限公司",
  supervisor: "亞新工程顧問股份有限公司",
  budget: 68_800_000,
  lat: 24.1046,
  lng: 120.6231,
  signedDate: "2026-02-26",
  noticeDate: "2026-03-16",
  startDate: "2026-03-16",
  endDate: "2029-03-15",
  status: "ACTIVE",
  scope: [
    { code: "(一)", title: "審查施工計畫及各項施工圖說", sourceClause: "契約第二條 服務項目" },
    { code: "(二)", title: "施工品質查驗及材料設備抽驗", sourceClause: "契約第二條 服務項目" },
    { code: "(三)", title: "工程進度控制及督導", sourceClause: "契約第二條 服務項目" },
    { code: "(四)", title: "估驗計價及契約變更審核", sourceClause: "契約第二條 服務項目" },
    { code: "(五)", title: "竣工驗收及結算文件審核", sourceClause: "契約第二條 服務項目" },
    { code: "(六)", title: "監造報表及履約紀錄彙整", sourceClause: "契約第二條 服務項目" },
  ],
  obligations: [
    {
      code: "PMIS-2026-003-001",
      title: "簽約後 14 日內指派專任監造人員並報備",
      stage: "CONSTRUCTION",
      risk: "GREEN",
      status: "DONE",
      triggerType: "RELATIVE_DUE",
      offsetDays: 14,
      weight: 3,
      dueDate: "2026-03-12",
      actualDate: "2026-03-10",
      ownerUnit: "監造組",
      ownerName: "許雅玲",
      contractBasis: "契約第六條第一款 人員配置",
    },
    {
      code: "PMIS-2026-003-002",
      title: "收到施工計畫後 10 日內完成審查",
      stage: "CONSTRUCTION",
      risk: "PURPLE",
      status: "DONE",
      triggerType: "RELATIVE_DUE",
      offsetDays: 10,
      weight: 5,
      dueDate: "2026-04-20",
      actualDate: "2026-04-17",
      ownerUnit: "監造組",
      ownerName: "許雅玲",
      contractBasis: "契約第七條第二款 文件審查期限",
      scopeRef: "審查施工計畫及各項施工圖說",
    },
    {
      code: "PMIS-2026-003-003",
      title: "每月 10 日前提送前一個月監造月報",
      stage: "CONSTRUCTION",
      risk: "YELLOW",
      status: "IN_PROGRESS",
      triggerType: "RELATIVE_DUE",
      offsetDays: 30,
      weight: 15,
      dueDate: "2026-08-10",
      ownerUnit: "監造組",
      ownerName: "許雅玲",
      contractBasis: "契約第九條第一款 監造月報",
      scopeRef: "監造報表及履約紀錄彙整",
    },
    {
      code: "PMIS-2026-003-004",
      title: "每週至少 2 次工區品質巡查並留存紀錄",
      stage: "CONSTRUCTION",
      risk: "GREEN",
      status: "IN_PROGRESS",
      triggerType: "RELATIVE_DUE",
      offsetDays: 7,
      weight: 20,
      dueDate: "2026-07-26",
      ownerUnit: "監造組",
      ownerName: "鄭凱文",
      contractBasis: "契約第八條第三款 品質查驗頻率",
      scopeRef: "施工品質查驗及材料設備抽驗",
    },
    {
      code: "PMIS-2026-003-005",
      title: "每季辦理履約督導會議",
      stage: "CONSTRUCTION",
      risk: "GREEN",
      status: "IN_PROGRESS",
      triggerType: "RELATIVE_DUE",
      offsetDays: 90,
      weight: 10,
      dueDate: "2026-09-30",
      ownerUnit: "監造組",
      ownerName: "許雅玲",
      contractBasis: "契約第十條第二款 履約督導",
      scopeRef: "工程進度控制及督導",
    },
    {
      code: "PMIS-2026-003-006",
      title: "收到估驗計價申請後 7 日內審核完成",
      stage: "CONSTRUCTION",
      risk: "ORANGE",
      status: "OVERDUE",
      triggerType: "RELATIVE_DUE",
      offsetDays: 7,
      weight: 18,
      dueDate: "2026-07-14",
      ownerUnit: "監造組",
      ownerName: "鄭凱文",
      contractBasis: "契約第十一條第一款 估驗計價審核期限",
      scopeRef: "估驗計價及契約變更審核",
      note: "第 3 期計價因數量爭議尚未審結。",
    },
    {
      code: "PMIS-2026-003-007",
      title: "進度落後達 3% 時 14 日內提出因應方案",
      stage: "CONSTRUCTION",
      risk: "RED",
      status: "NOT_STARTED",
      triggerType: "CONDITION",
      weight: 5,
      ownerUnit: "監造組",
      ownerName: "許雅玲",
      contractBasis: "契約第十條第四款 進度異常之處理",
      scopeRef: "工程進度控制及督導",
      note: "尚未觸發（目前進度差距 1.2%）。",
    },
    {
      code: "PMIS-2026-003-008",
      title: "每年辦理法務及財務講習各 1 次",
      stage: "CONSTRUCTION",
      risk: "GREEN",
      status: "NOT_STARTED",
      triggerType: "RELATIVE_DUE",
      offsetDays: 365,
      weight: 3,
      dueDate: "2026-12-31",
      ownerUnit: "行政組",
      ownerName: "李佩珊",
      contractBasis: "契約第十三條第五款 教育訓練",
    },
    {
      code: "PMIS-2026-003-009",
      title: "履約期滿後 10 日內提送最後一次月報",
      stage: "HANDOVER",
      risk: "GREEN",
      status: "NOT_STARTED",
      triggerType: "RELATIVE_DUE",
      offsetDays: 10,
      weight: 5,
      dueDate: "2029-03-25",
      ownerUnit: "監造組",
      ownerName: "許雅玲",
      contractBasis: "契約第九條第三款 結案文件",
      scopeRef: "監造報表及履約紀錄彙整",
    },
    {
      code: "PMIS-2026-003-010",
      title: "竣工結算文件審核完成後申報驗收",
      stage: "HANDOVER",
      risk: "PURPLE",
      status: "NOT_STARTED",
      triggerType: "PREDECESSOR",
      weight: 16,
      dueDate: "2029-03-15",
      ownerUnit: "監造組",
      ownerName: "許雅玲",
      contractBasis: "契約第十六條 驗收",
      scopeRef: "竣工驗收及結算文件審核",
    },
  ],
  /*
    服務型契約的「工程分項」是服務工作而非施作項目，
    以人月計價。台帳同樣算得出累計服務費，故仍給完整數量與單價。
  */
  workItems: [
    {
      code: "SV-001",
      name: "駐地監造人員（專任技師）",
      category: "監造服務",
      wbsCode: "WBS-1.1",
      wbsCategory: "indirect",
      unit: "人月",
      contractQty: 36,
      unitPrice: 1_150_000,
      completedQty: 5,
      valuatedQty: 5,
      progress: 14,
      status: "IN_PROGRESS",
      plannedStart: "2026-03-16",
      plannedEnd: "2029-03-15",
      actualStart: "2026-03-16",
      scopeRef: "工程進度控制及督導",
      obligationRef: "PMIS-2026-003-005",
    },
    {
      code: "SV-002",
      name: "品質查驗及抽驗作業",
      category: "監造服務",
      wbsCode: "WBS-2.1",
      wbsCategory: "indirect",
      unit: "人月",
      contractQty: 18,
      unitPrice: 820_000,
      completedQty: 2.5,
      valuatedQty: 2.5,
      progress: 14,
      status: "IN_PROGRESS",
      plannedStart: "2026-03-16",
      plannedEnd: "2029-03-15",
      actualStart: "2026-03-16",
      scopeRef: "施工品質查驗及材料設備抽驗",
      obligationRef: "PMIS-2026-003-004",
    },
    {
      code: "SV-003",
      name: "計價審核及契約變更作業",
      category: "監造服務",
      wbsCode: "WBS-3.1",
      wbsCategory: "indirect",
      unit: "式",
      contractQty: 1,
      unitPrice: 12_640_000,
      completedQty: 0.12,
      valuatedQty: 0.1,
      progress: 12,
      status: "IN_PROGRESS",
      plannedStart: "2026-04-01",
      plannedEnd: "2029-03-15",
      actualStart: "2026-04-06",
      scopeRef: "估驗計價及契約變更審核",
      obligationRef: "PMIS-2026-003-006",
    },
  ],
};

/** 4. 尚未開工的規劃中案件：欄位齊備但無任何實績。 */
const hospital: ProjectSeed = {
  key: "hospital",
  code: "PMIS-2026-004",
  name: "市立醫院醫療大樓新建工程",
  description: "地下 3 層、地上 12 層醫療大樓新建，含門診、急診及手術室裝修。",
  location: "桃園市中壢區",
  contractNo: "TYH-115-B-002",
  client: "桃園市政府衛生局",
  contractor: "根基營造股份有限公司",
  supervisor: "亞新工程顧問股份有限公司",
  budget: 2_469_600_000,
  floorArea: 62_400,
  lat: 24.9536,
  lng: 121.2251,
  signedDate: "2026-06-30",
  noticeDate: "2026-09-01",
  startDate: "2026-09-01",
  endDate: "2030-08-31",
  status: "PLANNING",
  scope: [
    { code: "(一)", title: "基礎開挖及地下結構工程", sourceClause: "契約第二條 履約標的" },
    { code: "(二)", title: "地上結構及外牆工程", sourceClause: "契約第二條 履約標的" },
    { code: "(三)", title: "醫療空間裝修及設備安裝", sourceClause: "契約第二條 履約標的" },
  ],
  obligations: [
    {
      code: "PMIS-2026-004-001",
      title: "開工前提送施工計畫書",
      stage: "CONSTRUCTION",
      risk: "GREEN",
      status: "NOT_STARTED",
      triggerType: "RELATIVE_DUE",
      offsetDays: 30,
      weight: 10,
      dueDate: "2026-08-31",
      ownerUnit: "工務組",
      ownerName: "蔡宗翰",
      contractBasis: "契約第七條第三款 施工計畫",
    },
    {
      code: "PMIS-2026-004-002",
      title: "地下結構完成",
      stage: "CONSTRUCTION",
      risk: "GREEN",
      status: "NOT_STARTED",
      weight: 30,
      dueDate: "2028-02-29",
      ownerUnit: "工務組",
      ownerName: "蔡宗翰",
      contractBasis: "契約第八條 施工進度表 項次 1",
      scopeRef: "基礎開挖及地下結構工程",
    },
    {
      code: "PMIS-2026-004-003",
      title: "上部結構完成",
      stage: "CONSTRUCTION",
      risk: "GREEN",
      status: "NOT_STARTED",
      triggerType: "PREDECESSOR",
      weight: 35,
      dueDate: "2029-10-31",
      ownerUnit: "工務組",
      ownerName: "蔡宗翰",
      contractBasis: "契約第八條 施工進度表 項次 2",
      scopeRef: "地上結構及外牆工程",
    },
    {
      code: "PMIS-2026-004-004",
      title: "醫療設備安裝及功能測試完成",
      stage: "COMMISSIONING",
      risk: "YELLOW",
      status: "NOT_STARTED",
      weight: 25,
      dueDate: "2030-06-30",
      commissioning: true,
      ownerUnit: "機電組",
      ownerName: "邱建宏",
      contractBasis: "契約第十五條 設備測試",
      scopeRef: "醫療空間裝修及設備安裝",
    },
  ],
  workItems: [
    {
      code: "WI-201",
      name: "基礎開挖及地下結構",
      category: "結構",
      wbsCode: "WBS-1.1",
      wbsCategory: "civil",
      unit: "m3",
      contractQty: 88_000,
      unitPrice: 9_400,
      completedQty: 0,
      valuatedQty: 0,
      progress: 0,
      status: "NOT_STARTED",
      plannedStart: "2026-09-01",
      plannedEnd: "2028-02-29",
      scopeRef: "基礎開挖及地下結構工程",
      obligationRef: "PMIS-2026-004-002",
    },
    {
      code: "WI-202",
      name: "地上結構及外牆",
      category: "結構",
      wbsCode: "WBS-2.1",
      wbsCategory: "civil",
      unit: "m2",
      contractQty: 62_400,
      unitPrice: 18_600,
      completedQty: 0,
      valuatedQty: 0,
      progress: 0,
      status: "NOT_STARTED",
      plannedStart: "2028-01-01",
      plannedEnd: "2029-10-31",
      scopeRef: "地上結構及外牆工程",
      obligationRef: "PMIS-2026-004-003",
    },
    {
      code: "WI-203",
      name: "醫療空間裝修及設備",
      category: "裝修",
      wbsCode: "WBS-3.1",
      wbsCategory: "mechanical",
      unit: "式",
      contractQty: 1,
      unitPrice: 481_760_000,
      completedQty: 0,
      valuatedQty: 0,
      progress: 0,
      status: "NOT_STARTED",
      plannedStart: "2029-06-01",
      plannedEnd: "2030-06-30",
      scopeRef: "醫療空間裝修及設備安裝",
      obligationRef: "PMIS-2026-004-004",
    },
  ],
};

/** 5. 已竣工結案的小型案件。 */
const drainage: ProjectSeed = {
  key: "drainage",
  code: "PMIS-2025-018",
  name: "大里溪排水路護岸改善工程",
  description: "既有護岸修復及排水路清疏，全長 1.8 公里。",
  location: "臺中市大里區",
  contractNo: "TCWR-114-D-031",
  client: "臺中市政府水利局",
  contractor: "宏昇營造有限公司",
  supervisor: "臺中市政府水利局（自辦監造）",
  budget: 187_080_000,
  lat: 24.0994,
  lng: 120.6783,
  signedDate: "2024-08-14",
  noticeDate: "2024-09-02",
  startDate: "2024-09-02",
  endDate: "2025-11-28",
  status: "COMPLETED",
  scope: [
    { code: "1", title: "既有護岸修復及新設", sourceClause: "契約第二條 工作範圍" },
    { code: "2", title: "排水路疏濬及土方處理", sourceClause: "契約第二條 工作範圍" },
  ],
  obligations: [
    {
      code: "PMIS-2025-018-001",
      title: "護岸工程完成",
      stage: "CONSTRUCTION",
      risk: "GREEN",
      status: "DONE",
      weight: 50,
      dueDate: "2025-08-31",
      actualDate: "2025-08-26",
      ownerUnit: "工務組",
      ownerName: "劉俊宏",
      contractBasis: "契約第八條 施工進度表 項次 1",
      scopeRef: "既有護岸修復及新設",
    },
    {
      code: "PMIS-2025-018-002",
      title: "排水路疏濬完成",
      stage: "CONSTRUCTION",
      risk: "GREEN",
      status: "DONE",
      weight: 30,
      dueDate: "2025-10-15",
      actualDate: "2025-10-09",
      ownerUnit: "工務組",
      ownerName: "劉俊宏",
      contractBasis: "契約第八條 施工進度表 項次 2",
      scopeRef: "排水路疏濬及土方處理",
    },
    {
      code: "PMIS-2025-018-003",
      title: "竣工驗收合格",
      stage: "HANDOVER",
      risk: "GREEN",
      status: "DONE",
      weight: 20,
      dueDate: "2025-11-30",
      actualDate: "2025-11-28",
      ownerUnit: "工務組",
      ownerName: "劉俊宏",
      contractBasis: "契約第十六條 驗收",
    },
  ],
  workItems: [
    {
      code: "WI-301",
      name: "混凝土護岸新設",
      category: "結構",
      wbsCode: "WBS-1.1",
      wbsCategory: "civil",
      unit: "m",
      contractQty: 1_800,
      unitPrice: 68_000,
      completedQty: 1_800,
      valuatedQty: 1_800,
      progress: 100,
      status: "COMPLETED",
      plannedStart: "2024-09-16",
      plannedEnd: "2025-08-31",
      actualStart: "2024-09-16",
      actualEnd: "2025-08-26",
      scopeRef: "既有護岸修復及新設",
      obligationRef: "PMIS-2025-018-001",
    },
    {
      code: "WI-302",
      name: "排水路疏濬及土方外運",
      category: "土方",
      wbsCode: "WBS-2.1",
      wbsCategory: "civil",
      unit: "m3",
      contractQty: 42_000,
      unitPrice: 1_540,
      completedQty: 42_000,
      valuatedQty: 42_000,
      progress: 100,
      status: "COMPLETED",
      plannedStart: "2025-03-01",
      plannedEnd: "2025-10-15",
      actualStart: "2025-03-10",
      actualEnd: "2025-10-09",
      scopeRef: "排水路疏濬及土方處理",
      obligationRef: "PMIS-2025-018-002",
    },
  ],
};

export const PROJECT_SEEDS: ProjectSeed[] = [
  mrt,
  bridge,
  supervision,
  hospital,
  drainage,
];

// ── 供檢查與測試用的推算 ────────────────────────────────────

/** 各分項「契約數量 × 單價」之和，應等於契約金額。 */
export function contractTotal(p: ProjectSeed): number {
  return p.workItems.reduce((sum, w) => sum + w.contractQty * w.unitPrice, 0);
}

/** 累計估驗金額。 */
export function valuatedTotal(p: ProjectSeed): number {
  return p.workItems.reduce((sum, w) => sum + w.valuatedQty * w.unitPrice, 0);
}

/** 履約事項權重總和，應為 100。 */
export function weightTotal(p: ProjectSeed): number {
  return p.obligations.reduce((sum, o) => sum + o.weight, 0);
}

// ── 建立 ────────────────────────────────────────────────────

/** 建立後回傳的控制點，供 seed.ts 其餘段落引用。 */
export type CreatedProject = {
  id: string;
  code: string;
  name: string;
  /** 工程分項：以 code 為鍵。 */
  workItems: Record<string, string>;
  /** 履約事項：以 code 為鍵。 */
  obligations: Record<string, string>;
  /** 合約標的：以 title 為鍵。 */
  scope: Record<string, string>;
};

/**
 * 依序建立專案、合約標的、履約事項與工程分項，並接好三者的關聯。
 *
 * 順序有意義：標的先建，履約事項與分項才有 scopeItemId 可指；
 * 履約事項再建，分項才有 obligationId 可掛。反過來就得回頭 update 兩次。
 */
export async function seedProjects(
  prisma: PrismaClient,
): Promise<Record<string, CreatedProject>> {
  const out: Record<string, CreatedProject> = {};
  const day = (s?: string) => (s ? new Date(s) : undefined);

  for (const p of PROJECT_SEEDS) {
    const project = await prisma.project.create({
      data: {
        code: p.code,
        name: p.name,
        description: p.description,
        location: p.location,
        contractNo: p.contractNo,
        client: p.client,
        contractor: p.contractor,
        supervisor: p.supervisor,
        budget: p.budget,
        floorArea: p.floorArea,
        lat: p.lat,
        lng: p.lng,
        signedDate: day(p.signedDate),
        noticeDate: day(p.noticeDate),
        startDate: day(p.startDate),
        endDate: day(p.endDate),
        status: p.status,
      },
    });

    const scope: Record<string, string> = {};
    for (const [i, s] of p.scope.entries()) {
      const row = await prisma.contractScopeItem.create({
        data: {
          projectId: project.id,
          code: s.code,
          title: s.title,
          sourceClause: s.sourceClause,
          sortOrder: i,
        },
      });
      scope[s.title] = row.id;
    }

    const obligations: Record<string, string> = {};
    for (const o of p.obligations) {
      const row = await prisma.contractObligation.create({
        data: {
          projectId: project.id,
          scopeItemId: o.scopeRef ? scope[o.scopeRef] : undefined,
          code: o.code,
          title: o.title,
          stage: o.stage,
          risk: o.risk,
          status: o.status,
          triggerType: o.triggerType ?? "FIXED_DATE",
          weight: o.weight,
          dueDate: day(o.dueDate),
          actualDate: day(o.actualDate),
          offsetDays: o.offsetDays,
          commissioning: o.commissioning ?? false,
          ownerUnit: o.ownerUnit,
          ownerName: o.ownerName,
          contractBasis: o.contractBasis,
          docNo: o.docNo,
          note: o.note,
        },
      });
      obligations[o.code] = row.id;
    }

    const workItems: Record<string, string> = {};
    for (const w of p.workItems) {
      const row = await prisma.workItem.create({
        data: {
          projectId: project.id,
          scopeItemId: w.scopeRef ? scope[w.scopeRef] : undefined,
          obligationId: w.obligationRef ? obligations[w.obligationRef] : undefined,
          code: w.code,
          name: w.name,
          category: w.category,
          wbsCode: w.wbsCode,
          wbsCategory: w.wbsCategory,
          unit: w.unit,
          contractQty: w.contractQty,
          unitPrice: w.unitPrice,
          completedQty: w.completedQty,
          valuatedQty: w.valuatedQty,
          progress: w.progress,
          status: w.status,
          plannedStart: day(w.plannedStart),
          plannedEnd: day(w.plannedEnd),
          actualStart: day(w.actualStart),
          actualEnd: day(w.actualEnd),
        },
      });
      workItems[w.code] = row.id;
    }

    out[p.key] = {
      id: project.id,
      code: p.code,
      name: p.name,
      workItems,
      obligations,
      scope,
    };
  }

  return out;
}
