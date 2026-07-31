import "dotenv/config";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../src/generated/prisma/client";
import { seedProjects } from "./seeds/projects";
import type {
  ReminderCategory,
  ReminderStatus,
  CarbonScope,
  ApprovalStatus,
  StepDecision,
} from "../src/generated/prisma/enums";

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL ?? "file:./prisma/dev.db",
});
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🌱 Seeding PMIS database (8 modules)...");

  // Clean slate (children first)
  await prisma.approvalAttachment.deleteMany();
  await prisma.approvalDocumentStep.deleteMany();
  await prisma.approvalDocument.deleteMany();
  await prisma.approvalWorkflowStep.deleteMany();
  await prisma.approvalWorkflow.deleteMany();
  await prisma.financialVoucher.deleteMany();
  await prisma.carbonEntry.deleteMany();
  await prisma.carbonInventory.deleteMany();
  await prisma.emissionFactor.deleteMany();
  await prisma.emissionCategory.deleteMany();
  await prisma.projectMember.deleteMany();
  await prisma.account.deleteMany();
  await prisma.position.deleteMany();
  await prisma.orgUnit.updateMany({ data: { parentId: null } });
  await prisma.orgUnit.deleteMany();
  await prisma.projectDocument.deleteMany();
  await prisma.supervisionReport.deleteMany();
  await prisma.mediaAsset.deleteMany();
  await prisma.submittal.deleteMany();
  await prisma.ehsNote.deleteMany();
  await prisma.ehsAttachment.deleteMany();
  await prisma.ehsAudit.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.reminderEvent.deleteMany();
  await prisma.paymentNode.deleteMany();
  await prisma.contractObligation.deleteMany();
  await prisma.contractChange.deleteMany();
  await prisma.defect.deleteMany();
  await prisma.inspection.deleteMany();
  await prisma.workItem.deleteMany();
  await prisma.contractScopeItem.deleteMany();
  await prisma.alertRule.deleteMany();
  await prisma.monitoringDevice.deleteMany();
  await prisma.project.deleteMany();

/*
    專案層改由 seeds/projects.ts 建立。
    那一層的數字互相牽制（分項數量×單價要等於契約金額、權重要加到 100、
    每項履約事項都要有契約依據並指回某項合約標的），抽出去才能用
    `npx tsx check-seed.ts` 在不碰資料庫的情況下核對一遍。
  */
  const P = await seedProjects(prisma);
  const metro = P.mrt;
  const bridge = P.bridge;
  const supervision = P.supervision;


// PMIS-07 查驗與缺失：對應新的工程分項
  const insp1 = await prisma.inspection.create({
    data: { projectId: metro.id, workItemId: metro.workItems["WI-003"], type: "PROCESS", scheduledAt: new Date("2026-07-10T09:00:00"), inspector: "張哲維", result: "PASSED", location: "潛盾隧道 K2+180", notes: "環片組裝精度與背填灌漿量符合規範。" },
  });
  await prisma.inspection.create({
    data: { projectId: metro.id, workItemId: metro.workItems["WI-007"], type: "SAFETY", scheduledAt: new Date("2026-07-15T14:00:00"), inspector: "周雅婷", result: "CONDITIONAL", location: "站區北側工作井", notes: "工作井通風量需複測後補正紀錄。" },
  });
  const insp3 = await prisma.inspection.create({
    data: { projectId: bridge.id, workItemId: bridge.workItems["WI-103"], type: "ACCEPTANCE", scheduledAt: new Date("2026-07-18T10:30:00"), inspector: "陳世昌", result: "FAILED", location: "P3 墩柱第 2 節", notes: "混凝土試體 28 天強度僅達設計值 85%。" },
  });
  await prisma.inspection.create({
    data: { projectId: supervision.id, workItemId: supervision.workItems["SV-002"], type: "MATERIAL", scheduledAt: new Date("2026-07-21T09:30:00"), inspector: "鄭凱文", result: "PASSED", location: "擴建區 A 池", notes: "鋼筋抽驗合格，出廠證明齊備。" },
  });

  await prisma.defect.createMany({
    data: [
      { projectId: metro.id, workItemId: metro.workItems["WI-003"], inspectionId: insp1.id, title: "隧道環片接縫滲水", description: "K2+340 環片接縫輕微滲水，需補注止水材。", severity: "MEDIUM", status: "IN_PROGRESS", reportedBy: "張哲維", assignedTo: "大陸工程", dueDate: new Date("2026-07-30") },
      { projectId: bridge.id, workItemId: bridge.workItems["WI-103"], inspectionId: insp3.id, title: "P3 墩柱混凝土強度不足", description: "第 2 節柱身試體 28 天強度僅達 85%，需辦理鑽心取樣複驗。", severity: "CRITICAL", status: "OPEN", reportedBy: "陳世昌", assignedTo: "麗明營造", dueDate: new Date("2026-08-05") },
      { projectId: bridge.id, workItemId: bridge.workItems["WI-102"], title: "基樁樁頭破碎超挖", description: "P2-3 樁頭打除深度超過設計 15cm。", severity: "LOW", status: "RESOLVED", reportedBy: "許文彬", assignedTo: "麗明營造", resolvedAt: new Date("2026-06-30") },
      { projectId: metro.id, title: "工區圍籬受風災損壞", description: "站區北側圍籬 12 公尺傾倒。", severity: "LOW", status: "RESOLVED", reportedBy: "周雅婷", resolvedAt: new Date("2026-07-12") },
    ],
  });

  // PMIS-03 契約變更：金額須以新的契約金額為基準遞增
  await prisma.contractChange.createMany({
    data: [
      { projectId: metro.id, sequence: 1, description: "增設站區地下水位監測井 6 口", amountAfter: 3_346_800_000, daysChanged: 30, approvedDate: new Date("2025-11-10"), docNo: "新捷工字第1140218號" },
      { projectId: bridge.id, sequence: 1, description: "基樁遭遇卵礫石層，改採全套管施工", amountAfter: 1_043_600_000, daysChanged: 45, approvedDate: new Date("2025-09-22"), docNo: "中工字第1140338號" },
      { projectId: bridge.id, sequence: 2, description: "凱米颱風災損修復及工期展延", amountAfter: 1_068_200_000, daysChanged: 32, approvedDate: new Date("2026-05-14"), docNo: "中工字第1150127號" },
    ],
  });

  /*
    履約事項與合約標的已隨專案一併建立（見 seeds/projects.ts），
    分項也在那裡就掛好了 obligationId —— 不必再回頭 update 一次。
  */

  await prisma.paymentNode.createMany({
    data: [
      { projectId: metro.id, name: "第 8 期估驗計價", amount: 214_800_000, plannedDate: new Date("2026-07-25"), status: "INVOICED" },
      { projectId: metro.id, name: "第 7 期估驗計價", amount: 186_400_000, plannedDate: new Date("2026-06-25"), paidDate: new Date("2026-07-08"), status: "PAID" },
      { projectId: bridge.id, name: "第 5 期估驗計價", amount: 68_200_000, plannedDate: new Date("2026-08-10"), status: "PENDING" },
      { projectId: supervision.id, name: "第 3 期服務費", amount: 5_120_000, plannedDate: new Date("2026-07-31"), status: "PENDING" },
      { projectId: supervision.id, name: "第 2 期服務費", amount: 4_960_000, plannedDate: new Date("2026-06-30"), paidDate: new Date("2026-07-10"), status: "PAID" },
    ],
  });

  
  // PMIS-03 Project documents (契約與文件)
  await prisma.projectDocument.createMany({
    data: [
      { projectId: metro.id, category: "CONTRACT", name: "捷運環狀線南環段 CQ801 標工程契約", fileNo: "CQ801-C-1150012", issuedDate: new Date("2025-01-20") },
      { projectId: metro.id, category: "AMENDMENT", name: "第 1 次契約變更協議書", fileNo: "A-1140012", issuedDate: new Date("2025-11-10") },
      { projectId: metro.id, category: "DRAWING", name: "車站區連續壁及支撐設計圖說", fileNo: "D-CQ801-001", issuedDate: new Date("2025-02-25") },
      { projectId: metro.id, category: "REPORT", name: "站區地質鑽探及地下水位調查報告", fileNo: "R-2025-018", issuedDate: new Date("2025-03-12") },
      { projectId: metro.id, category: "PERMIT", name: "施工圍籬使用許可", fileNo: "P-2025-044", issuedDate: new Date("2025-03-25") },
      { projectId: bridge.id, category: "CONTRACT", name: "後龍溪橋改建工程契約", fileNo: "WCH-115-BR-024", issuedDate: new Date("2024-11-08") },
      { projectId: bridge.id, category: "AMENDMENT", name: "第 2 次契約變更協議書（颱風災損展延）", fileNo: "A-1150127", issuedDate: new Date("2026-05-14") },
      { projectId: bridge.id, category: "REPORT", name: "橋址河床地質鑽探報告", fileNo: "R-2024-091", issuedDate: new Date("2024-12-20") },
      { projectId: supervision.id, category: "CONTRACT", name: "烏日水資中心擴建監造技術服務契約", fileNo: "TCWR-115-S-007", issuedDate: new Date("2026-02-26") },
      { projectId: supervision.id, category: "REPORT", name: "115 年 6 月監造月報", fileNo: "SR-115-06", issuedDate: new Date("2026-07-08") },
    ],
  });

  // PMIS-01 Reminders — spread across week / month / quarter / year for the
  // calendar view. Status is derived from the due date relative to "today".
  const today = new Date("2026-07-19");
  const statusFor = (due: Date, done = false): ReminderStatus => {
    if (done) return "DONE";
    const days = (due.getTime() - today.getTime()) / 86_400_000;
    if (days < 0) return "OVERDUE";
    if (days <= 7) return "DUE_SOON";
    return "UPCOMING";
  };

  const projectKey = {
    metro: metro.id,
    bridge: bridge.id,
    supervision: supervision.id,
  };
  const reminderSpecs: [
    keyof typeof projectKey,
    string,
    string,
    ReminderCategory,
    boolean?,
  ][] = [
    // 過去（已完成 / 逾期）
    ["metro", "第 4 期估驗計價完成", "2026-06-25", "DEADLINE", true],
    ["metro", "6 月月報送審", "2026-07-05", "SUBMITTAL", true],
    ["bridge", "混凝土強度不足缺失改善期限", "2026-07-16", "IMPROVEMENT"],
    ["metro", "止水材型錄補件期限", "2026-07-17", "SUBMITTAL"],
    // 本週（2026-07-13 ~ 07-19 起算後續）
    ["metro", "月工務會議", "2026-07-22", "MEETING"],
    ["metro", "第 5 期估驗計價送件期限", "2026-07-25", "DEADLINE"],
    ["bridge", "交維計畫審查會議", "2026-07-23", "MEETING"],
    ["metro", "隧道通風量複測回報", "2026-07-20", "IMPROVEMENT"],
    // 本月稍後
    ["metro", "隧道環片滲水改善完成期限", "2026-07-30", "IMPROVEMENT"],
    ["bridge", "預力鋼腱送審", "2026-07-28", "SUBMITTAL"],
    ["metro", "職安衛月稽核", "2026-07-31", "AUDIT"],
    // 本季（Q3：8、9 月）
    ["bridge", "上級機關工程查核", "2026-08-06", "AUDIT"],
    ["metro", "主體結構開工前會議", "2026-08-12", "MEETING"],
    ["metro", "第 6 期估驗計價", "2026-08-25", "DEADLINE"],
    ["bridge", "P3 墩柱鑽心複驗計畫審查", "2026-08-18", "SUBMITTAL"],
    ["metro", "8 月安衛環保稽核", "2026-08-29", "AUDIT"],
    ["bridge", "颱風季防災整備會議", "2026-09-02", "MEETING"],
    ["metro", "潛盾隧道環片抽驗", "2026-09-15", "AUDIT"],
    ["bridge", "橋面版預鑄件送審", "2026-09-22", "SUBMITTAL"],
    ["metro", "第 7 期估驗計價", "2026-09-25", "DEADLINE"],
    // Q4 2026
    ["supervision", "每季履約督導會議", "2026-09-30", "MEETING"],
    ["bridge", "橋墩帽梁完成查核", "2026-10-15", "AUDIT"],
    ["metro", "車站主體結構開工", "2026-11-01", "DEADLINE"],
    ["bridge", "年度履約檢討會議", "2026-11-20", "MEETING"],
    ["metro", "第 4 季安衛稽核", "2026-12-05", "AUDIT"],
    ["metro", "年度工程結算會議", "2026-12-18", "MEETING"],
    ["bridge", "年終工程查核", "2026-12-28", "AUDIT"],
    // 明年（year 視圖）
    ["bridge", "橋面版吊裝送審", "2027-01-15", "SUBMITTAL"],
    ["metro", "潛盾隧道貫通履約事項", "2027-02-20", "DEADLINE"],
    ["bridge", "主橋段合龍會議", "2027-03-10", "MEETING"],
    ["metro", "第 1 季安衛稽核", "2027-03-28", "AUDIT"],
    ["bridge", "橋面鋪裝送審", "2027-04-18", "SUBMITTAL"],
    ["bridge", "後龍溪橋通車前初驗", "2027-05-31", "AUDIT"],
    ["metro", "潛盾隧道貫通履約期限", "2027-10-31", "DEADLINE"],
  ];

  await prisma.reminderEvent.createMany({
    data: reminderSpecs.map(([key, title, date, category, done]) => {
      const dueDate = new Date(date);
      return {
        projectId: projectKey[key],
        title,
        category,
        dueDate,
        status: statusFor(dueDate, done),
      };
    }),
  });

  // PMIS-02 Todos
  // 系統通知：含細節、前往連結與釘選
  await prisma.notification.createMany({
    data: [
      {
        projectId: bridge.id,
        title: "P3 墩柱混凝土強度不足，需提送複驗計畫",
        detail:
          "第 8 節柱身試體 28 天強度僅達設計值 85%，已開立 NCR。請於期限前提送複驗計畫與補強方案，並安排監造會同取樣。",
        link: "/quality",
        unit: "麗明營造",
        assignee: "工地主任",
        source: "缺失改善",
        dueDate: new Date("2026-07-16"),
        status: "OVERDUE",
        // 逾期且影響結構安全，預設釘選
        pinnedAt: new Date("2026-07-17"),
      },
      {
        projectId: metro.id,
        title: "止水膨脹材送審退件，請補送型錄",
        detail:
          "送審文件缺少材料型錄與試驗報告，經審查退件。請補齊後重新提送，避免影響環片安裝進度。",
        link: "/submittals",
        unit: "施工廠商",
        source: "送審退件",
        dueDate: new Date("2026-07-24"),
        status: "IN_PROGRESS",
      },
      {
        projectId: metro.id,
        title: "隧道通風量複測並回報",
        detail:
          "K12 段查驗結果為有條件通過，需複測通風量並回報數值；未達標準前不得進行後續作業。",
        link: "/quality",
        unit: "監造單位",
        assignee: "李工程師",
        source: "查驗待複核",
        dueDate: new Date("2026-07-20"),
        status: "PENDING",
      },
      {
        projectId: metro.id,
        title: "CAM-02 料場攝影機離線",
        detail:
          "現地攝影機離線超過 10 分鐘，已觸發預警規則。請派員檢查供電與網路，必要時報修。",
        link: "/monitoring",
        unit: "資訊",
        source: "設備異常",
        status: "PENDING",
      },
      {
        projectId: metro.id,
        title: "圍籬修復完成確認",
        detail: "工區北側圍籬受風災損壞已修復完成，經巡查確認符合要求。",
        link: "/ehs",
        unit: "施工廠商",
        source: "缺失改善",
        status: "DONE",
        // 已處理完成，設為已讀
        readAt: new Date("2026-07-13"),
      },
    ],
  });

  // PMIS-05 EHS audits
  await prisma.ehsAudit.createMany({
    data: [
      { projectId: metro.id, type: "SAFETY", auditedAt: new Date("2026-07-14"), inspector: "職安人員", location: "隧道工作井", result: "FAIL", findings: "臨邊防護欄杆高度不足。", dueDate: new Date("2026-07-19") },
      { projectId: metro.id, type: "ENVIRONMENT", auditedAt: new Date("2026-07-11"), inspector: "環保人員", location: "洗車台", result: "PASS", findings: "沖洗設施運作正常。" },
      { projectId: bridge.id, type: "TRAFFIC", auditedAt: new Date("2026-07-13"), inspector: "交維人員", location: "台2線便橋", result: "IMPROVING", findings: "夜間導引標誌需增設。", dueDate: new Date("2026-07-21") },
    ],
  });

  // PMIS-06 Submittals
  await prisma.submittal.createMany({
    data: [
      { projectId: metro.id, category: "MATERIAL", name: "止水膨脹材送審", materialName: "遇水膨脹止水條", plannedSubmitDate: new Date("2026-07-08"), actualSubmitDate: new Date("2026-07-09"), reviewResult: "REJECTED", status: "RETURNED", note: "缺型錄與試驗報告。" },
      { projectId: metro.id, category: "TEST_REPORT", name: "環片背填灌漿試驗報告", plannedSubmitDate: new Date("2026-07-12"), actualSubmitDate: new Date("2026-07-12"), reviewDate: new Date("2026-07-15"), reviewResult: "APPROVED", status: "APPROVED", fileNo: "M-2026-0142" },
      { projectId: bridge.id, category: "CONSTRUCTION", name: "帽梁支撐架施工計畫", plannedSubmitDate: new Date("2026-07-20"), status: "UNDER_REVIEW", reviewResult: "PENDING" },
      { projectId: bridge.id, category: "MATERIAL", name: "預力鋼腱送審", materialName: "低鬆弛預力鋼絞線", plannedSubmitDate: new Date("2026-07-28"), status: "DRAFT", reviewResult: "PENDING" },
    ],
  });

  // PMIS-08 Media + supervision reports
  await prisma.mediaAsset.createMany({
    data: [
      { projectId: metro.id, title: "K12+340 環片滲水現況", type: "PHOTO", category: "缺失照片", fileSizeKb: 3120, uploadedBy: "王監造", capturedAt: new Date("2026-07-10") },
      { projectId: metro.id, title: "潛盾機推進作業縮時", type: "VIDEO", category: "施工影片", fileSizeKb: 154200, uploadedBy: "張哲維", capturedAt: new Date("2026-07-09") },
      { projectId: metro.id, title: "CJ302 竣工圖-B2層", type: "DRAWING", category: "圖說", fileSizeKb: 8600, uploadedBy: "設計單位" },
      { projectId: bridge.id, title: "P3 墩柱混凝土試體報告", type: "REPORT", category: "試驗報告", fileSizeKb: 720, uploadedBy: "陳世昌", capturedAt: new Date("2026-07-18") },
    ],
  });
  await prisma.supervisionReport.createMany({
    data: [
      { projectId: metro.id, reportDate: new Date("2026-07-18"), weather: "晴", summary: "潛盾推進至 K2+380，環片組裝 1120 環累計完成。", manpower: "現場 62 人", equipment: "潛盾機 1、吊車 2", keyNotes: "工作井通風量複測待回報。", filedBy: "大陸工程", status: "SUBMITTED" },
      { projectId: metro.id, reportDate: new Date("2026-07-17"), weather: "多雲", summary: "環片運輸進場 40 環；背填灌漿作業。", manpower: "現場 58 人", equipment: "吊車 2", filedBy: "大陸工程", status: "APPROVED" },
      { projectId: bridge.id, reportDate: new Date("2026-07-18"), weather: "陰", summary: "P3 墩柱第 2 節模板組立；混凝土試體送驗。", manpower: "現場 40 人", equipment: "塔吊 1", keyNotes: "強度不足缺失待改善。", filedBy: "麗明營造", status: "DRAFT" },
      { projectId: supervision.id, reportDate: new Date("2026-07-18"), weather: "晴", summary: "擴建區 A 池鋼筋查驗；審核第 3 期估驗計價數量。", manpower: "監造 3 人", equipment: "—", keyNotes: "計價數量爭議待釐清。", filedBy: "亞新工程顧問", status: "SUBMITTED" },
    ],
  });

  // ── 人員管理：完整工程公司組織架構 ──────────────────────
  const org = async (name: string, code: string, parentId?: string) =>
    prisma.orgUnit.create({ data: { name, code, parentId } });

  // 公司 → 各部 → 各組
  const company = await org("中興監造工程顧問股份有限公司", "CO");
  const exec = await org("總經理室", "EXEC", company.id);
  const sup = await org("監造事業部", "SUP", company.id);
  const des = await org("設計部", "DES", company.id);
  const pmo = await org("專案管理部", "PMO", company.id);
  const qaDept = await org("品保稽核部", "QA", company.id);
  const admDept = await org("行政管理部", "ADM", company.id);

  const supSt = await org("結構監造組", "SUP-ST", sup.id);
  const supGe = await org("大地監造組", "SUP-GE", sup.id);
  const supHy = await org("水利監造組", "SUP-HY", sup.id);
  const supTr = await org("交通監造組", "SUP-TR", sup.id);
  const supQc = await org("品管組", "SUP-QC", sup.id);
  const supEhs = await org("環安衛組", "SUP-EHS", sup.id);
  const supSv = await org("測量組", "SUP-SV", sup.id);

  const desCv = await org("土木設計組", "DES-CV", des.id);
  const desMe = await org("機電設計組", "DES-ME", des.id);
  const desAr = await org("建築設計組", "DES-AR", des.id);

  const admHr = await org("人力資源組", "ADM-HR", admDept.id);
  const admFi = await org("財務會計組", "ADM-FI", admDept.id);
  const admIt = await org("資訊組", "ADM-IT", admDept.id);
  const admGa = await org("總務組", "ADM-GA", admDept.id);

  // 職位
  const pos = async (name: string, rank: number) =>
    prisma.position.create({ data: { name, rank } });
  const posChair = await pos("董事長", 0);
  const posGm = await pos("總經理", 1);
  const posVp = await pos("協理", 2);
  const posMgr = await pos("部經理", 3);
  const posLead = await pos("組長", 4);
  const posChief = await pos("主任工程師", 5);
  const posSenior = await pos("資深工程師", 6);
  const posEng = await pos("工程師", 7);
  const posSpec = await pos("專員", 7);
  const posAsst = await pos("助理工程師", 8);
  const posClerk = await pos("行政助理", 9);

  // 職位模組權限（PMIS-14）：主管全可編輯、其餘檢視、人員管理僅高階可編輯（raw SQL）
  const ALL_MODULES = [
    "/calendar", "/notifications", "/projects", "/schedule", "/ehs", "/submittals",
    "/quality", "/finance", "/carbon", "/monitoring", "/logs", "/gis",
    "/documents", "/people",
  ];
  const permJson = (
    level: "VIEW" | "EDIT",
    peopleLevel: "NONE" | "VIEW" | "EDIT" = level,
  ) =>
    JSON.stringify(
      Object.fromEntries(
        ALL_MODULES.map((m) => [m, m === "/people" ? peopleLevel : level]),
      ),
    );
  const setPerm = (id: string, json: string) =>
    prisma.$executeRawUnsafe(
      'UPDATE "Position" SET "modulePermissions"=? WHERE "id"=?',
      json,
      id,
    );
  for (const id of [posChair.id, posGm.id, posVp.id, posMgr.id])
    await setPerm(id, permJson("EDIT"));
  for (const id of [posLead.id, posChief.id, posSenior.id, posEng.id])
    await setPerm(id, permJson("EDIT", "NONE"));
  for (const id of [posSpec.id, posAsst.id, posClerk.id])
    await setPerm(id, permJson("VIEW", "NONE"));

  await prisma.account.createMany({
    data: [
      // 總經理室
      { name: "王承德", email: "chairman@cafeca.com.tw", role: "MANAGER", status: "ACTIVE", orgUnitId: exec.id, positionId: posChair.id },
      { name: "林國棟", email: "gm@cafeca.com.tw", role: "MANAGER", status: "ACTIVE", orgUnitId: exec.id, positionId: posGm.id },
      { name: "陳明輝", email: "mh.chen@cafeca.com.tw", role: "MANAGER", status: "ACTIVE", orgUnitId: exec.id, positionId: posVp.id },
      // 監造事業部
      { name: "張志偉", email: "zw.zhang@cafeca.com.tw", role: "MANAGER", status: "ACTIVE", orgUnitId: sup.id, positionId: posMgr.id },
      { name: "李文彬", email: "wb.li@cafeca.com.tw", role: "MANAGER", status: "ACTIVE", orgUnitId: supSt.id, positionId: posLead.id },
      { name: "吳建宏", email: "jh.wu@cafeca.com.tw", role: "MEMBER", status: "ACTIVE", orgUnitId: supSt.id, positionId: posChief.id },
      { name: "黃俊傑", email: "jj.huang@cafeca.com.tw", role: "MEMBER", status: "ACTIVE", orgUnitId: supSt.id, positionId: posSenior.id },
      { name: "蔡宜庭", email: "yt.tsai@cafeca.com.tw", role: "MEMBER", status: "ACTIVE", orgUnitId: supSt.id, positionId: posEng.id },
      { name: "鄭凱文", email: "kw.zheng@cafeca.com.tw", role: "MANAGER", status: "ACTIVE", orgUnitId: supGe.id, positionId: posLead.id },
      { name: "許雅婷", email: "yt.hsu@cafeca.com.tw", role: "MEMBER", status: "ACTIVE", orgUnitId: supGe.id, positionId: posEng.id },
      { name: "劉建志", email: "jz.liu@cafeca.com.tw", role: "MANAGER", status: "ACTIVE", orgUnitId: supHy.id, positionId: posLead.id },
      { name: "楊承翰", email: "ch.yang@cafeca.com.tw", role: "MEMBER", status: "ACTIVE", orgUnitId: supHy.id, positionId: posEng.id },
      { name: "周世昌", email: "sc.zhou@cafeca.com.tw", role: "MANAGER", status: "ACTIVE", orgUnitId: supTr.id, positionId: posLead.id },
      { name: "賴怡君", email: "yj.lai@cafeca.com.tw", role: "MEMBER", status: "ACTIVE", orgUnitId: supTr.id, positionId: posEng.id },
      { name: "洪敏華", email: "mh.hong@cafeca.com.tw", role: "MANAGER", status: "ACTIVE", orgUnitId: supQc.id, positionId: posLead.id },
      { name: "曾國峰", email: "gf.zeng@cafeca.com.tw", role: "MEMBER", status: "ACTIVE", orgUnitId: supQc.id, positionId: posChief.id },
      { name: "邱淑貞", email: "sz.qiu@cafeca.com.tw", role: "MEMBER", status: "ACTIVE", orgUnitId: supQc.id, positionId: posEng.id },
      { name: "高志鵬", email: "zp.gao@cafeca.com.tw", role: "MANAGER", status: "ACTIVE", orgUnitId: supEhs.id, positionId: posLead.id },
      { name: "范振宇", email: "zy.fan@cafeca.com.tw", role: "MEMBER", status: "ACTIVE", orgUnitId: supEhs.id, positionId: posEng.id },
      { name: "潘冠廷", email: "gt.pan@cafeca.com.tw", role: "MANAGER", status: "ACTIVE", orgUnitId: supSv.id, positionId: posLead.id },
      { name: "蕭雅文", email: "yw.xiao@cafeca.com.tw", role: "MEMBER", status: "ACTIVE", orgUnitId: supSv.id, positionId: posAsst.id },
      // 設計部
      { name: "徐嘉玲", email: "jl.hsu@cafeca.com.tw", role: "MANAGER", status: "ACTIVE", orgUnitId: des.id, positionId: posMgr.id },
      { name: "郭柏勳", email: "bx.guo@cafeca.com.tw", role: "MANAGER", status: "ACTIVE", orgUnitId: desCv.id, positionId: posLead.id },
      { name: "何佩珊", email: "ps.he@cafeca.com.tw", role: "MEMBER", status: "ACTIVE", orgUnitId: desCv.id, positionId: posEng.id },
      { name: "呂昆霖", email: "kl.lu@cafeca.com.tw", role: "MANAGER", status: "ACTIVE", orgUnitId: desMe.id, positionId: posLead.id },
      { name: "葉宗翰", email: "zh.ye@cafeca.com.tw", role: "MEMBER", status: "ACTIVE", orgUnitId: desMe.id, positionId: posEng.id },
      { name: "江宛儒", email: "wr.jiang@cafeca.com.tw", role: "MANAGER", status: "ACTIVE", orgUnitId: desAr.id, positionId: posLead.id },
      { name: "蘇冠宇", email: "gy.su@cafeca.com.tw", role: "MEMBER", status: "ACTIVE", orgUnitId: desAr.id, positionId: posEng.id },
      // 專案管理部
      { name: "馮士軒", email: "sx.feng@cafeca.com.tw", role: "MANAGER", status: "ACTIVE", orgUnitId: pmo.id, positionId: posMgr.id },
      { name: "董雅琪", email: "yq.dong@cafeca.com.tw", role: "MANAGER", status: "ACTIVE", orgUnitId: pmo.id, positionId: posChief.id },
      { name: "石承恩", email: "ce.shi@cafeca.com.tw", role: "MEMBER", status: "ACTIVE", orgUnitId: pmo.id, positionId: posSpec.id },
      // 品保稽核部
      { name: "溫國華", email: "gh.wen@cafeca.com.tw", role: "MANAGER", status: "ACTIVE", orgUnitId: qaDept.id, positionId: posMgr.id },
      { name: "尤靜怡", email: "jy.you@cafeca.com.tw", role: "MEMBER", status: "ACTIVE", orgUnitId: qaDept.id, positionId: posEng.id },
      // 行政管理部
      { name: "田美惠", email: "mh.tian@cafeca.com.tw", role: "MANAGER", status: "ACTIVE", orgUnitId: admDept.id, positionId: posMgr.id },
      { name: "白詩涵", email: "sh.bai@cafeca.com.tw", role: "MEMBER", status: "ACTIVE", orgUnitId: admHr.id, positionId: posSpec.id },
      { name: "孔令儀", email: "ly.kong@cafeca.com.tw", role: "MEMBER", status: "ACTIVE", orgUnitId: admFi.id, positionId: posSpec.id },
      { name: "秦子軒", email: "zx.qin@cafeca.com.tw", role: "ADMIN", status: "ACTIVE", orgUnitId: admIt.id, positionId: posEng.id },
      { name: "龔志明", email: "zm.gong@cafeca.com.tw", role: "MEMBER", status: "ACTIVE", orgUnitId: admGa.id, positionId: posClerk.id },
      { name: "系統管理員", email: "admin@cafeca.com.tw", role: "ADMIN", status: "ACTIVE", orgUnitId: admIt.id, positionId: posEng.id },
    ],
  });

  // 專案人力配置（決定各帳號可見的專案）
  const seededAccounts = await prisma.account.findMany({
    select: { id: true, email: true },
  });
  const accountId = (email: string) => {
    const a = seededAccounts.find((x) => x.email === email);
    if (!a) throw new Error(`Seed: account not found for ${email}`);
    return a.id;
  };
  await prisma.projectMember.createMany({
    data: [
      // 捷運環狀線南環段 CQ801 標
      { projectId: metro.id, accountId: accountId("wb.li@cafeca.com.tw"), role: "SUPERVISOR" },
      { projectId: metro.id, accountId: accountId("jh.wu@cafeca.com.tw"), role: "MEMBER" },
      { projectId: metro.id, accountId: accountId("yt.tsai@cafeca.com.tw"), role: "MEMBER" },
      { projectId: metro.id, accountId: accountId("gf.zeng@cafeca.com.tw"), role: "INSPECTOR" },
      // 後龍溪橋改建
      { projectId: bridge.id, accountId: accountId("kw.zheng@cafeca.com.tw"), role: "MANAGER" },
      { projectId: bridge.id, accountId: accountId("yt.hsu@cafeca.com.tw"), role: "MEMBER" },
      { projectId: bridge.id, accountId: accountId("sz.qiu@cafeca.com.tw"), role: "INSPECTOR" },
      // 烏日水資中心擴建監造服務
      { projectId: supervision.id, accountId: accountId("wb.li@cafeca.com.tw"), role: "MANAGER" },
      { projectId: supervision.id, accountId: accountId("yt.hsu@cafeca.com.tw"), role: "SUPERVISOR" },
    ],
  });

  // ── PMIS-10 碳盤查：係數版本 + 係數庫 + 範例盤查 ────────────
  // 兩個並存版本，示範多版本切換（示意值，實作前需以環境部完整版校正）
  const set2026 = await prisma.emissionFactorSet.create({
    data: {
      name: "環境部排放係數管理表 6.0.4",
      version: "6.0.4",
      year: 2026,
      gwpSet: "AR5",
      source: "環境部",
      isDefault: true,
    },
  });
  const set2024 = await prisma.emissionFactorSet.create({
    data: {
      name: "環境部排放係數管理表 6.0.3",
      version: "6.0.3",
      year: 2024,
      gwpSet: "AR5",
      source: "環境部",
    },
  });

  const catDefs: {
    key: string;
    scope: CarbonScope;
    name: string;
    unit: string;
    v2026: number;
    v2024: number;
  }[] = [
    { key: "diesel", scope: "SCOPE_1", name: "柴油", unit: "L", v2026: 2.606, v2024: 2.615 },
    { key: "gasoline", scope: "SCOPE_1", name: "汽油", unit: "L", v2026: 2.263, v2024: 2.271 },
    { key: "lpg", scope: "SCOPE_1", name: "液化石油氣", unit: "kg", v2026: 3.0, v2024: 3.02 },
    { key: "natgas", scope: "SCOPE_1", name: "天然氣", unit: "m³", v2026: 1.879, v2024: 1.883 },
    { key: "acetylene", scope: "SCOPE_1", name: "乙炔（動火）", unit: "kg", v2026: 3.38, v2024: 3.38 },
    { key: "elec", scope: "SCOPE_2", name: "外購電力", unit: "kWh", v2026: 0.474, v2024: 0.494 },
    { key: "concrete", scope: "SCOPE_3", name: "常態混凝土", unit: "m³", v2026: 265, v2024: 270 },
    { key: "rebar", scope: "SCOPE_3", name: "鋼筋", unit: "t", v2026: 1900, v2024: 1950 },
    { key: "cement", scope: "SCOPE_3", name: "水泥", unit: "t", v2026: 830, v2024: 850 },
    { key: "asphalt", scope: "SCOPE_3", name: "瀝青混凝土", unit: "t", v2026: 55, v2024: 57 },
    { key: "transport", scope: "SCOPE_3", name: "材料運輸", unit: "t-km", v2026: 0.11, v2024: 0.12 },
    { key: "waste", scope: "SCOPE_3", name: "營建廢棄物", unit: "t", v2026: 20, v2024: 21 },
  ];

  const category: Record<string, { id: string }> = {};
  const factor2026: Record<string, { id: string; value: number }> = {};
  for (const d of catDefs) {
    const c = await prisma.emissionCategory.create({
      data: { scope: d.scope, name: d.name, unit: d.unit },
    });
    const f = await prisma.emissionFactor.create({
      data: { setId: set2026.id, categoryId: c.id, value: d.v2026, unit: d.unit },
    });
    await prisma.emissionFactor.create({
      data: { setId: set2024.id, categoryId: c.id, value: d.v2024, unit: d.unit },
    });
    category[d.key] = c;
    factor2026[d.key] = { id: f.id, value: d.v2026 };
  }

  const mkEntry = (
    scope: CarbonScope,
    key: string,
    qty: number,
    unit: string,
    opts: {
      aiExtracted?: boolean;
      status?: "DRAFT" | "CONFIRMED" | "VERIFIED";
    } = {},
  ) => {
    const f = factor2026[key];
    return {
      scope,
      categoryId: category[key].id,
      factorId: f.id,
      activityQty: qty,
      activityUnit: unit,
      factorValue: f.value,
      co2e: f.value * qty, // kgCO₂e
      status: opts.status ?? "CONFIRMED",
      aiExtracted: opts.aiExtracted ?? false,
      occurredAt: new Date("2026-06-30"),
    };
  };

  const carbonInv = await prisma.carbonInventory.create({
    data: {
      projectId: metro.id,
      factorSetId: set2026.id,
      name: "2026 年度盤查",
      periodStart: new Date("2026-01-01"),
      periodEnd: new Date("2026-12-31"),
      baselineCo2e: 1200,
      targetCo2e: 1000,
      intensityBasis: "CONTRACT_AMOUNT",
      entries: {
        create: [
          mkEntry("SCOPE_1", "diesel", 42000, "L"),
          mkEntry("SCOPE_2", "elec", 380000, "kWh", { aiExtracted: true }),
          mkEntry("SCOPE_3", "concrete", 5200, "m³", { status: "VERIFIED" }),
          mkEntry("SCOPE_3", "rebar", 860, "t"),
        ],
      },
    },
  });

  // 稽核軌跡範例
  await prisma.carbonAuditLog.createMany({
    data: [
      {
        inventoryId: carbonInv.id,
        action: "CREATE",
        actorName: "系統種子",
        detail: "建立 2026 年度盤查",
      },
      {
        inventoryId: carbonInv.id,
        action: "VERIFY",
        actorName: "第三方查證機構",
        toStatus: "VERIFIED",
        detail: "混凝土用量經查證",
      },
    ],
  });

  // ── PMIS-08 財務管理：範例會計傳票 ──────────────────────────
  await prisma.financialVoucher.createMany({
    data: [
      { projectId: metro.id, voucherNo: "R-2026-001", date: new Date("2026-02-15"), direction: "INCOME", category: "工程估驗款", amount: 320_000_000, counterparty: "交通部捷運工程局", summary: "第一期估驗計價", status: "CONFIRMED" },
      { projectId: metro.id, voucherNo: "R-2026-002", date: new Date("2026-05-20"), direction: "INCOME", category: "工程估驗款", amount: 285_000_000, counterparty: "交通部捷運工程局", summary: "第二期估驗計價", status: "CONFIRMED" },
      { projectId: metro.id, voucherNo: "P-2026-014", date: new Date("2026-03-05"), direction: "EXPENSE", category: "材料", amount: 96_000_000, counterparty: "台灣鋼鐵", summary: "鋼筋進料", status: "CONFIRMED", aiExtracted: true },
      { projectId: metro.id, voucherNo: "P-2026-021", date: new Date("2026-04-10"), direction: "EXPENSE", category: "材料", amount: 58_000_000, counterparty: "國產建材", summary: "預拌混凝土", status: "CONFIRMED" },
      { projectId: metro.id, voucherNo: "P-2026-030", date: new Date("2026-04-28"), direction: "EXPENSE", category: "人工", amount: 42_000_000, counterparty: "勞務承攬", summary: "四月工資", status: "CONFIRMED" },
      { projectId: metro.id, voucherNo: "P-2026-038", date: new Date("2026-05-12"), direction: "EXPENSE", category: "機具", amount: 24_500_000, counterparty: "營建機械租賃", summary: "潛盾機租金", status: "CONFIRMED" },
      { projectId: metro.id, voucherNo: "P-2026-045", date: new Date("2026-06-18"), direction: "EXPENSE", category: "管理費", amount: 8_600_000, counterparty: "—", summary: "現場管理費", status: "DRAFT" },
    ],
  });

  // 簽核流程範本
  const wf1 = await prisma.approvalWorkflow.create({
    data: {
      name: "施工計畫審核流程",
      description: "施工廠商提送施工計畫，經組長、部經理、總經理三級簽核。",
      steps: {
        create: [
          { order: 0, positionId: posLead.id },
          { order: 1, positionId: posMgr.id },
          { order: 2, positionId: posGm.id },
        ],
      },
    },
    include: { steps: { orderBy: { order: "asc" } } },
  });
  const wf2 = await prisma.approvalWorkflow.create({
    data: {
      name: "材料送審流程",
      description: "材料設備送審，經主任工程師與組長簽核。",
      steps: {
        create: [
          { order: 0, positionId: posChief.id },
          { order: 1, positionId: posLead.id },
        ],
      },
    },
    include: { steps: { orderBy: { order: "asc" } } },
  });

  // 簽核文件範例（供展示）
  const allAccounts = await prisma.account.findMany({
    select: { id: true, email: true },
  });
  const aid = (email: string) =>
    allAccounts.find((a) => a.email === email)?.id ?? allAccounts[0].id;

  const mkDoc = (opts: {
    title: string;
    applicant: string;
    status: ApprovalStatus;
    currentStep: number;
    decisions: StepDecision[];
    signer?: string;
  }) =>
    prisma.approvalDocument.create({
      data: {
        title: opts.title,
        applicantId: aid(opts.applicant),
        workflowId: wf1.id,
        status: opts.status,
        currentStep: opts.currentStep,
        steps: {
          create: wf1.steps.map((s, i) => {
            const decision = opts.decisions[i] ?? "PENDING";
            const done = decision !== "PENDING";
            return {
              order: s.order,
              positionId: s.positionId,
              decision,
              signedById: done ? aid(opts.signer ?? "zw.zhang@cafeca.com.tw") : null,
              signedAt: done ? new Date() : null,
            };
          }),
        },
      },
    });

  await mkDoc({ title: "CQ801 連續壁及支撐施工計畫", applicant: "jh.wu@cafeca.com.tw", status: "PENDING", currentStep: 1, decisions: ["APPROVED", "PENDING", "PENDING"] });
  await mkDoc({ title: "潛盾隧道施工計畫", applicant: "zw.zhang@cafeca.com.tw", status: "APPROVED", currentStep: 3, decisions: ["APPROVED", "APPROVED", "APPROVED"] });
  await mkDoc({ title: "車站主體施工計畫（退回修正）", applicant: "yt.tsai@cafeca.com.tw", status: "REJECTED", currentStep: 1, decisions: ["APPROVED", "REJECTED", "PENDING"] });
  await mkDoc({ title: "假設工程施工計畫", applicant: "yt.tsai@cafeca.com.tw", status: "PENDING", currentStep: 0, decisions: ["PENDING", "PENDING", "PENDING"] });
  await mkDoc({ title: "交通維持計畫書", applicant: "zw.zhang@cafeca.com.tw", status: "PENDING", currentStep: 2, decisions: ["APPROVED", "APPROVED", "PENDING"] });

  await prisma.approvalDocument.create({
    data: {
      title: "鋼筋材料送審",
      applicantId: aid("yt.tsai@cafeca.com.tw"),
      workflowId: wf2.id,
      status: "PENDING",
      currentStep: 0,
      steps: {
        create: wf2.steps.map((s) => ({ order: s.order, positionId: s.positionId })),
      },
    },
  });

  // ── PMIS-12 GIS 地圖（圖層目錄 + 專案座標 + 範例自訂圖徵）───────────
  // Info: 以 raw SQL 寫入，避免相依於需重新產生的 Prisma model。
  await prisma.$executeRawUnsafe('DELETE FROM "GisFeature"');
  await prisma.$executeRawUnsafe('DELETE FROM "GisLayerSeed"');

  const gisLayers: [string, string, string, string, string | null, string, number, string | null, number, number, number, number][] = [
    // id, category, title, source, wmtsCode, format, year, color, opacity, sortOrder, isBase, isDefault
    ["gl_osm", "BASE", "OpenStreetMap 白底", "OSM", null, "png", 2026, null, 100, 0, 1, 1],
    ["gl_emapx99", "BASE", "臺灣通用電子地圖(無文字)", "NLSC", "EMAPX99", "jpeg", 2026, null, 100, 1, 1, 0],
    ["gl_photo2", "BASE", "正射影像(通用)", "NLSC", "PHOTO2", "jpeg", 2026, null, 100, 2, 1, 0],
    ["gl_soil", "RISK", "土壤液化潛勢", "NLSC", "SoilLiquefaction", "png", 2024, "#dc2626", 55, 10, 0, 1],
    ["gl_geo2", "RISK", "地質敏感區(山崩與地滑)", "NLSC", "GeoSensitive2", "png", 2024, "#b45309", 55, 11, 0, 1],
    ["gl_geo", "RISK", "地質敏感區(含活動斷層)", "NLSC", "GeoSensitive", "png", 2024, "#92400e", 55, 12, 0, 0],
    ["gl_school", "FACILITY", "各級學校範圍圖", "NLSC", "SCHOOL", "png", 2026, "#059669", 70, 20, 0, 1],
    ["gl_shelter", "FACILITY", "避難收容所", "NLSC", "SHELTERS", "png", 2026, "#0891b2", 85, 21, 0, 0],
    ["gl_fire", "FACILITY", "消防栓", "NLSC", "fireplug", "png", 2026, "#ef4444", 85, 22, 0, 0],
    ["gl_road", "TRANSPORT", "道路路網", "NLSC", "ROAD", "png", 2026, "#475569", 70, 30, 0, 0],
    ["gl_landsect", "LAND", "地段外圍圖(段籍圖)", "NLSC", "LANDSECT", "png", 2026, "#6b7280", 60, 40, 0, 0],
    ["gl_landpub", "LAND", "公有土地地籍圖", "NLSC", "LAND_OPENDATA", "png", 2026, "#7c3aed", 55, 41, 0, 0],
    ["gl_nurban1", "LAND", "非都市土地使用分區圖", "NLSC", "nURBAN1", "png", 2026, "#ca8a04", 55, 42, 0, 0],
    ["gl_village", "ADMIN", "村里界", "NLSC", "Village", "png", 2026, "#94a3b8", 60, 50, 0, 0],
    ["gl_stats_pop", "STATS", "村里人口統計(示範)", "SEGIS", null, "geojson", 2024, "#2563eb", 60, 60, 0, 0],
  ];
  for (const [id, category, title, source, wmtsCode, format, year, color, opacity, sortOrder, isBase, isDefault] of gisLayers) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "GisLayerSeed" ("id","category","title","source","wmtsCode","format","year","srs","color","opacity","sortOrder","isBase","isDefault","active")
       VALUES (?,?,?,?,?,?,?, 'EPSG:3857', ?,?,?,?,?,1)`,
      id, category, title, source, wmtsCode, format, year, color, opacity, sortOrder, isBase, isDefault,
    );
  }

  // 向量示範 seed（供周邊風險摘要空間查詢）
  const gisVectorPaths: [string, string][] = [
    ["gl_soil", "prisma/seeds/gis/soil_liquefaction_demo.geojson"],
    ["gl_geo2", "prisma/seeds/gis/geo_sensitive_demo.geojson"],
    ["gl_school", "prisma/seeds/gis/school_demo.geojson"],
    ["gl_shelter", "prisma/seeds/gis/shelter_demo.geojson"],
    ["gl_fire", "prisma/seeds/gis/fire_hydrant_demo.geojson"],
    ["gl_stats_pop", "prisma/seeds/gis/village_stats_demo.geojson"],
  ];
  for (const [id, filePath] of gisVectorPaths) {
    await prisma.$executeRawUnsafe('UPDATE "GisLayerSeed" SET "filePath"=? WHERE "id"=?', filePath, id);
  }

  // 專案工地座標 (WGS84)
  /*
    座標已於 seeds/projects.ts 隨專案一併寫入，此處不再覆寫 ——
    先前這兩行會把新的座標蓋成舊專案的位置，而地圖上看起來只是「位置怪」。
  */

  // 範例自訂圖徵（捷運環狀線站區工地）
  const gisFeatures: [string, string, string, string, string, string][] = [
    /*
      座標須落在專案座標（板橋站區 121.4628, 25.0128）附近。
      先前這組留在舊專案的位置，地圖上圖徵會離工地十幾公里 ——
      而症狀只是「位置看起來怪」，沒有人會想到是 seed 沒跟著改。
    */
    ["gf_gate", "MARKER", "工地大門(門禁)", "#2563eb", "車輛進出管制，7:00-18:00", JSON.stringify({ type: "Point", coordinates: [121.4631, 25.0131] })],
    ["gf_fence", "AREA", "施工圍籬範圍", "#7c3aed", "主要施工區警戒範圍", JSON.stringify({ type: "Polygon", coordinates: [[[121.4619, 25.0122], [121.4639, 25.0122], [121.4639, 25.0134], [121.4619, 25.0134], [121.4619, 25.0122]]] })],
    ["gf_haul", "ROUTE", "工程車便道", "#ea580c", "進場動線，避開學校路段", JSON.stringify({ type: "LineString", coordinates: [[121.4608, 25.0116], [121.4621, 25.0124], [121.4631, 25.0131]] })],
  ];
  for (const [id, type, name, color, note, geojson] of gisFeatures) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "GisFeature" ("id","projectId","name","type","geojson","color","note","visible","createdBy","updatedAt")
       VALUES (?,?,?,?,?,?,?,1,'seed', datetime('now'))`,
      id, metro.id, name, type, geojson, color, note,
    );
  }

  // ── 行事曆與預警：監測設備與預警規則 ───────────────────────────
  const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);
  await prisma.monitoringDevice.createMany({
    data: [
      {
        projectId: metro.id,
        code: "CAM-01",
        name: "東側大門",
        type: "CCTV",
        location: "工區入口",
        status: "ONLINE",
        lastHeartbeat: minutesAgo(1),
      },
      {
        projectId: metro.id,
        code: "CAM-02",
        name: "料場全景",
        type: "CCTV",
        location: "材料堆置區",
        status: "OFFLINE",
        // 離線 25 分鐘 → 會觸發「離線超過 10 分鐘」規則
        lastHeartbeat: minutesAgo(25),
      },
      {
        projectId: metro.id,
        code: "SEN-01",
        name: "沉陷觀測點",
        type: "SENSOR",
        location: "連續壁 A 區",
        status: "ONLINE",
        lastHeartbeat: minutesAgo(2),
      },
      {
        projectId: bridge.id,
        code: "CAM-11",
        name: "橋台施工面",
        type: "CCTV",
        location: "P1 橋台",
        status: "MAINTENANCE",
        lastHeartbeat: minutesAgo(600),
      },
    ],
  });

  await prisma.alertRule.createMany({
    data: [
      {
        name: "進度落後預警",
        description: "全案上捲進度落後預定達 5% 時，啟動趕工機制。",
        kind: "CONDITION",
        module: "/schedule",
        severity: "CRITICAL",
        metric: "SCHEDULE_LAG",
        operator: "GTE",
        threshold: 5,
        unit: "%",
        action: "建立趕工計畫與每週檢討會",
        notify: "專案經理,監造單位",
        enabled: true,
      },
      {
        name: "文件期限預警",
        description: "送審文件預定提送日前 7 天提醒承辦與專案經理。",
        kind: "RELATIVE_DATE",
        module: "/submittals",
        severity: "WARNING",
        anchor: "DOCUMENT_DUE",
        offsetDays: 7,
        action: "確認文件備齊並如期提送",
        notify: "承辦,專案經理",
        enabled: true,
      },
      {
        name: "材料試驗不合格",
        description: "查驗結果為不合格時，開立 NCR 並追蹤複查。",
        kind: "CONDITION",
        module: "/quality",
        severity: "CRITICAL",
        metric: "INSPECTION_FAILED",
        operator: "GTE",
        threshold: 1,
        unit: "件",
        action: "建立 NCR 及複查追蹤",
        notify: "品管,監造單位",
        enabled: true,
      },
      {
        name: "CCTV 離線預警",
        description: "現地攝影機離線超過 10 分鐘，通知資訊與現場人員排除。",
        kind: "CONDITION",
        module: "/monitoring",
        severity: "WARNING",
        metric: "DEVICE_OFFLINE_MINUTES",
        operator: "GT",
        threshold: 10,
        unit: "分鐘",
        action: "派員檢查供電與網路，必要時報修",
        notify: "資訊,現場人員",
        enabled: true,
      },
      {
        name: "缺失改善期限預警",
        description: "缺失改善期限前 3 天提醒，逾期一併列出。",
        kind: "RELATIVE_DATE",
        module: "/quality",
        severity: "WARNING",
        anchor: "DEFECT_DUE",
        offsetDays: 3,
        action: "追蹤改善進度並回報",
        notify: "工地主任",
        enabled: true,
      },
      {
        name: "履約期限屆至",
        description: "契約完工日前 30 天提醒辦理竣工與驗收準備。",
        kind: "RELATIVE_DATE",
        module: "/projects",
        severity: "INFO",
        anchor: "CONTRACT_END",
        offsetDays: 30,
        action: "確認竣工文件與驗收排程",
        notify: "專案經理",
        enabled: true,
      },
      {
        name: "年度稽核日",
        description: "範例：固定日期規則，預設停用。",
        kind: "FIXED_DATE",
        module: "/calendar",
        severity: "INFO",
        fixedDate: new Date(`${new Date().getFullYear()}-12-15`),
        action: "準備年度稽核資料",
        notify: "專案經理",
        enabled: false,
      },
    ],
  });

  const counts = {
    專案: await prisma.project.count(),
    預警規則: await prisma.alertRule.count(),
    監測設備: await prisma.monitoringDevice.count(),
    工程分項: await prisma.workItem.count(),
    查驗: await prisma.inspection.count(),
    缺失: await prisma.defect.count(),
    契約變更: await prisma.contractChange.count(),
    專案文件: await prisma.projectDocument.count(),
    合約標的: await prisma.contractScopeItem.count(),
    履約事項: await prisma.contractObligation.count(),
    付款節點: await prisma.paymentNode.count(),
    行事曆: await prisma.reminderEvent.count(),
    系統通知: await prisma.notification.count(),
    環安衛: await prisma.ehsAudit.count(),
    送審: await prisma.submittal.count(),
    媒體: await prisma.mediaAsset.count(),
    監造報表: await prisma.supervisionReport.count(),
    組織: await prisma.orgUnit.count(),
    職位: await prisma.position.count(),
    帳號: await prisma.account.count(),
    專案成員: await prisma.projectMember.count(),
    碳盤查: await prisma.carbonInventory.count(),
    碳排記錄: await prisma.carbonEntry.count(),
    會計傳票: await prisma.financialVoucher.count(),
    簽核文件: await prisma.approvalDocument.count(),
    簽核流程: await prisma.approvalWorkflow.count(),
  };
  console.log("✅ Seed complete:", counts);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
