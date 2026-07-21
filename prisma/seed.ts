import "dotenv/config";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../src/generated/prisma/client";
import type {
  ReminderCategory,
  ReminderStatus,
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
  await prisma.account.deleteMany();
  await prisma.position.deleteMany();
  await prisma.orgUnit.updateMany({ data: { parentId: null } });
  await prisma.orgUnit.deleteMany();
  await prisma.projectDocument.deleteMany();
  await prisma.supervisionReport.deleteMany();
  await prisma.mediaAsset.deleteMany();
  await prisma.submittal.deleteMany();
  await prisma.ehsAudit.deleteMany();
  await prisma.todoItem.deleteMany();
  await prisma.reminderEvent.deleteMany();
  await prisma.paymentNode.deleteMany();
  await prisma.milestone.deleteMany();
  await prisma.contractChange.deleteMany();
  await prisma.defect.deleteMany();
  await prisma.inspection.deleteMany();
  await prisma.workItem.deleteMany();
  await prisma.project.deleteMany();

  const metro = await prisma.project.create({
    data: {
      code: "PMIS-2026-001",
      name: "捷運藍線 CJ302 標土建工程",
      description: "地下車站與潛盾隧道土建工程監造",
      location: "新北市中和區",
      contractNo: "CJ302-C-1140001",
      client: "交通部捷運工程局",
      contractor: "大陸工程股份有限公司",
      supervisor: "台灣世曦工程顧問",
      budget: 4_850_000_000,
      startDate: new Date("2025-03-01"),
      endDate: new Date("2029-12-31"),
      status: "ACTIVE",
      workItems: {
        create: [
          { code: "WI-001", name: "連續壁施工", category: "結構", progress: 78, status: "IN_PROGRESS", plannedStart: new Date("2025-04-01"), plannedEnd: new Date("2026-10-31"), actualStart: new Date("2025-04-08") },
          { code: "WI-002", name: "潛盾隧道推進", category: "隧道", progress: 42, status: "IN_PROGRESS", plannedStart: new Date("2025-09-01"), plannedEnd: new Date("2028-06-30"), actualStart: new Date("2025-09-15") },
          { code: "WI-003", name: "車站主體結構", category: "結構", progress: 0, status: "NOT_STARTED", plannedStart: new Date("2026-11-01"), plannedEnd: new Date("2029-03-31") },
        ],
      },
    },
    include: { workItems: true },
  });

  const bridge = await prisma.project.create({
    data: {
      code: "PMIS-2026-002",
      name: "淡江大橋主橋段工程",
      description: "斜張橋主塔與橋面版施工監造",
      location: "新北市淡水區",
      contractNo: "TSK-2024-BR-018",
      client: "交通部公路局",
      contractor: "麗明營造",
      supervisor: "中興工程顧問",
      budget: 2_300_000_000,
      startDate: new Date("2024-06-01"),
      endDate: new Date("2027-08-31"),
      status: "ACTIVE",
      workItems: {
        create: [
          { code: "WI-101", name: "主塔基礎", category: "基礎", progress: 100, status: "COMPLETED", actualEnd: new Date("2025-05-20") },
          { code: "WI-102", name: "主塔柱身爬升", category: "結構", progress: 65, status: "DELAYED", plannedEnd: new Date("2026-06-30") },
        ],
      },
    },
    include: { workItems: true },
  });

  await prisma.project.create({
    data: {
      code: "PMIS-2026-003",
      name: "市立醫院新建工程",
      description: "地下 3 層、地上 12 層醫療大樓",
      location: "桃園市中壢區",
      client: "桃園市政府",
      contractor: "根基營造",
      supervisor: "亞新工程顧問",
      budget: 1_650_000_000,
      startDate: new Date("2026-09-01"),
      status: "PLANNING",
    },
  });

  // PMIS-07 Inspections + Defects
  const insp1 = await prisma.inspection.create({
    data: { projectId: metro.id, workItemId: metro.workItems[0].id, type: "PROCESS", scheduledAt: new Date("2026-07-10T09:00:00"), inspector: "王監造", result: "PASSED", location: "B2 連續壁 P12", notes: "連續壁槽溝垂直度符合規範。" },
  });
  await prisma.inspection.create({
    data: { projectId: metro.id, workItemId: metro.workItems[1].id, type: "SAFETY", scheduledAt: new Date("2026-07-15T14:00:00"), inspector: "李工程師", result: "CONDITIONAL", location: "隧道 K12", notes: "隧道通風量需複測。" },
  });
  const insp3 = await prisma.inspection.create({
    data: { projectId: bridge.id, workItemId: bridge.workItems[1].id, type: "ACCEPTANCE", scheduledAt: new Date("2026-07-18T10:30:00"), inspector: "陳主任", result: "FAILED", location: "主塔第 8 節", notes: "混凝土強度試體未達設計值。" },
  });

  await prisma.defect.createMany({
    data: [
      { projectId: metro.id, workItemId: metro.workItems[1].id, inspectionId: insp1.id, title: "隧道環片滲水", description: "K12+340 環片接縫輕微滲水，需注漿處理。", severity: "MEDIUM", status: "IN_PROGRESS", reportedBy: "王監造", assignedTo: "施工廠商", dueDate: new Date("2026-07-30") },
      { projectId: bridge.id, workItemId: bridge.workItems[1].id, inspectionId: insp3.id, title: "主塔混凝土強度不足", description: "第 8 節柱身試體 28 天強度僅達 85%。", severity: "CRITICAL", status: "OPEN", reportedBy: "陳主任", assignedTo: "麗明營造", dueDate: new Date("2026-08-05") },
      { projectId: metro.id, title: "施工圍籬破損", description: "工區北側圍籬受風災損壞。", severity: "LOW", status: "RESOLVED", reportedBy: "巡查員", resolvedAt: new Date("2026-07-12") },
    ],
  });

  // PMIS-03 Contract changes / milestones / payment nodes
  await prisma.contractChange.createMany({
    data: [
      { projectId: metro.id, sequence: 1, description: "增設連續壁監測井", amountAfter: 4_920_000_000, daysChanged: 30, approvedDate: new Date("2025-11-10"), docNo: "捷工字第1140012號" },
      { projectId: bridge.id, sequence: 1, description: "主塔鋼構介面變更", amountAfter: 2_360_000_000, daysChanged: 45, approvedDate: new Date("2025-08-22"), docNo: "公路字第1140338號" },
    ],
  });
  await prisma.milestone.createMany({
    data: [
      // 捷運：權重型里程碑（部分已達成，用於整體進度/差距）
      { projectId: metro.id, name: "開工", type: "MILESTONE", weight: 10, plannedDate: new Date("2025-03-01"), actualDate: new Date("2025-03-01") },
      { projectId: metro.id, name: "供電系統試送電", type: "MILESTONE", weight: 5, plannedDate: new Date("2026-07-01"), actualDate: new Date("2026-07-05"), commissioning: true },
      { projectId: metro.id, name: "連續壁完成", type: "MILESTONE", weight: 25, plannedDate: new Date("2026-06-30"), actualDate: new Date("2026-07-10") },
      { projectId: metro.id, name: "潛盾隧道貫通", type: "MILESTONE", weight: 25, plannedDate: new Date("2026-07-15") },
      { projectId: metro.id, name: "車站主體結構完成", type: "MILESTONE", weight: 20, plannedDate: new Date("2028-06-30") },
      { projectId: metro.id, name: "機電設備安裝完成", type: "MILESTONE", weight: 15, plannedDate: new Date("2029-06-30"), commissioning: true },
      { projectId: metro.id, name: "試運轉完成", type: "MILESTONE", weight: 5, plannedDate: new Date("2029-12-31"), commissioning: true },
      // 淡江大橋
      { projectId: bridge.id, name: "主塔基礎完成", type: "MILESTONE", weight: 20, plannedDate: new Date("2025-05-20"), actualDate: new Date("2025-05-20") },
      { projectId: bridge.id, name: "主塔柱身完成", type: "MILESTONE", weight: 30, plannedDate: new Date("2026-06-30") },
      { projectId: bridge.id, name: "橋面版吊裝完成", type: "MILESTONE", weight: 30, plannedDate: new Date("2027-03-31") },
      { projectId: bridge.id, name: "通車前試運轉", type: "MILESTONE", weight: 20, plannedDate: new Date("2027-08-15"), commissioning: true },
      { projectId: bridge.id, name: "颱風災損展延", type: "EXTENSION", plannedDate: new Date("2027-10-15"), docNo: "公路字第1150087號", note: "因梅花颱風停工 45 天展延。" },
    ],
  });
  await prisma.paymentNode.createMany({
    data: [
      { projectId: metro.id, name: "第 5 期估驗計價", amount: 320_000_000, plannedDate: new Date("2026-07-25"), status: "INVOICED" },
      { projectId: metro.id, name: "第 4 期估驗計價", amount: 298_000_000, plannedDate: new Date("2026-06-25"), paidDate: new Date("2026-07-05"), status: "PAID" },
      { projectId: bridge.id, name: "主塔基礎完成款", amount: 180_000_000, plannedDate: new Date("2026-08-10"), status: "PENDING" },
    ],
  });

  // PMIS-03 Project documents (契約與文件)
  await prisma.projectDocument.createMany({
    data: [
      { projectId: metro.id, category: "CONTRACT", name: "工程契約書", fileNo: "C-1140001", issuedDate: new Date("2025-02-20") },
      { projectId: metro.id, category: "AMENDMENT", name: "第 1 次契約變更協議書", fileNo: "A-1140012", issuedDate: new Date("2025-11-10") },
      { projectId: metro.id, category: "DRAWING", name: "連續壁設計圖說", fileNo: "D-CJ302-001", issuedDate: new Date("2025-03-15") },
      { projectId: metro.id, category: "PERMIT", name: "施工圍籬使用許可", fileNo: "P-2025-044", issuedDate: new Date("2025-03-25") },
      { projectId: bridge.id, category: "CONTRACT", name: "淡江大橋主橋段工程契約", fileNo: "BR-018", issuedDate: new Date("2024-05-28") },
      { projectId: bridge.id, category: "REPORT", name: "主塔基礎地質鑽探報告", fileNo: "R-2024-076", issuedDate: new Date("2024-07-02") },
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

  const projectKey = { metro: metro.id, bridge: bridge.id };
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
    ["bridge", "主塔爬模施工計畫審查", "2026-08-18", "SUBMITTAL"],
    ["metro", "8 月安衛環保稽核", "2026-08-29", "AUDIT"],
    ["bridge", "颱風季防災整備會議", "2026-09-02", "MEETING"],
    ["metro", "連續壁完成查驗", "2026-09-15", "AUDIT"],
    ["bridge", "橋面版預鑄件送審", "2026-09-22", "SUBMITTAL"],
    ["metro", "第 7 期估驗計價", "2026-09-25", "DEADLINE"],
    // Q4 2026
    ["metro", "連續壁里程碑期限", "2026-10-31", "DEADLINE"],
    ["bridge", "主塔柱身完成查核", "2026-10-15", "AUDIT"],
    ["metro", "車站主體結構開工", "2026-11-01", "DEADLINE"],
    ["bridge", "年度履約檢討會議", "2026-11-20", "MEETING"],
    ["metro", "第 4 季安衛稽核", "2026-12-05", "AUDIT"],
    ["metro", "年度工程結算會議", "2026-12-18", "MEETING"],
    ["bridge", "年終工程查核", "2026-12-28", "AUDIT"],
    // 明年（year 視圖）
    ["bridge", "橋面版吊裝送審", "2027-01-15", "SUBMITTAL"],
    ["metro", "潛盾隧道貫通里程碑", "2027-02-20", "DEADLINE"],
    ["bridge", "主橋段合龍會議", "2027-03-10", "MEETING"],
    ["metro", "第 1 季安衛稽核", "2027-03-28", "AUDIT"],
    ["bridge", "橋面鋪裝送審", "2027-04-18", "SUBMITTAL"],
    ["bridge", "淡江大橋完工查驗", "2027-08-15", "AUDIT"],
    ["metro", "捷運藍線全案完工里程碑", "2027-12-31", "DEADLINE"],
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
  await prisma.todoItem.createMany({
    data: [
      { projectId: bridge.id, title: "提送混凝土複驗計畫", unit: "麗明營造", assignee: "工地主任", source: "缺失改善", dueDate: new Date("2026-07-16"), status: "OVERDUE" },
      { projectId: metro.id, title: "補送環片止水材型錄", unit: "施工廠商", source: "送審退件", dueDate: new Date("2026-07-24"), status: "IN_PROGRESS" },
      { projectId: metro.id, title: "通風量複測並回報", unit: "監造單位", assignee: "李工程師", source: "查驗待複核", dueDate: new Date("2026-07-20"), status: "PENDING" },
      { projectId: metro.id, title: "圍籬修復完成確認", unit: "施工廠商", source: "缺失改善", status: "DONE" },
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
      { projectId: metro.id, category: "TEST_REPORT", name: "連續壁混凝土 28 天強度報告", plannedSubmitDate: new Date("2026-07-12"), actualSubmitDate: new Date("2026-07-12"), reviewDate: new Date("2026-07-15"), reviewResult: "APPROVED", status: "APPROVED", fileNo: "M-2026-0142" },
      { projectId: bridge.id, category: "CONSTRUCTION", name: "主塔爬模施工計畫", plannedSubmitDate: new Date("2026-07-20"), status: "UNDER_REVIEW", reviewResult: "PENDING" },
      { projectId: bridge.id, category: "MATERIAL", name: "預力鋼腱送審", materialName: "低鬆弛預力鋼絞線", plannedSubmitDate: new Date("2026-07-28"), status: "DRAFT", reviewResult: "PENDING" },
    ],
  });

  // PMIS-08 Media + supervision reports
  await prisma.mediaAsset.createMany({
    data: [
      { projectId: metro.id, title: "K12+340 環片滲水現況", type: "PHOTO", category: "缺失照片", fileSizeKb: 3120, uploadedBy: "王監造", capturedAt: new Date("2026-07-10") },
      { projectId: metro.id, title: "連續壁灌漿作業縮時", type: "VIDEO", category: "施工影片", fileSizeKb: 154200, uploadedBy: "現場工程師", capturedAt: new Date("2026-07-09") },
      { projectId: metro.id, title: "CJ302 竣工圖-B2層", type: "DRAWING", category: "圖說", fileSizeKb: 8600, uploadedBy: "設計單位" },
      { projectId: bridge.id, title: "主塔混凝土試體報告", type: "REPORT", category: "試驗報告", fileSizeKb: 720, uploadedBy: "陳主任", capturedAt: new Date("2026-07-18") },
    ],
  });
  await prisma.supervisionReport.createMany({
    data: [
      { projectId: metro.id, reportDate: new Date("2026-07-18"), weather: "晴", summary: "連續壁 P13~P15 灌漿；隧道推進至 K12+360。", manpower: "現場 62 人", equipment: "潛盾機 1、吊車 2", keyNotes: "通風量複測待回報。", filedBy: "施工廠商", status: "SUBMITTED" },
      { projectId: metro.id, reportDate: new Date("2026-07-17"), weather: "多雲", summary: "連續壁鋼筋籠吊放；環片運輸進場。", manpower: "現場 58 人", equipment: "吊車 2", filedBy: "施工廠商", status: "APPROVED" },
      { projectId: bridge.id, reportDate: new Date("2026-07-18"), weather: "陰", summary: "主塔第 8 節鋼構組立；混凝土試體送驗。", manpower: "現場 40 人", equipment: "塔吊 1", keyNotes: "強度不足缺失待改善。", filedBy: "麗明營造", status: "DRAFT" },
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

  await prisma.account.createMany({
    data: [
      // 總經理室
      { name: "王承德", email: "chairman@cafeca.com.tw", role: "MANAGER", status: "ACTIVE", orgUnitId: exec.id, positionId: posChair.id },
      { name: "林國棟", email: "gm@cafeca.com.tw", role: "MANAGER", status: "ACTIVE", orgUnitId: exec.id, positionId: posGm.id },
      { name: "陳明輝", email: "mh.chen@cafeca.com.tw", role: "MANAGER", status: "ACTIVE", orgUnitId: exec.id, positionId: posVp.id },
      // 監造事業部
      { name: "張志偉", email: "zw.zhang@cafeca.com.tw", role: "MANAGER", status: "ACTIVE", orgUnitId: sup.id, positionId: posMgr.id },
      { name: "李文彬", email: "wb.li@cafeca.com.tw", role: "MANAGER", status: "ACTIVE", orgUnitId: supSt.id, positionId: posLead.id },
      { name: "吳建宏", email: "jh.wu@cafeca.com.tw", role: "ENGINEER", status: "ACTIVE", orgUnitId: supSt.id, positionId: posChief.id },
      { name: "黃俊傑", email: "jj.huang@cafeca.com.tw", role: "ENGINEER", status: "ACTIVE", orgUnitId: supSt.id, positionId: posSenior.id },
      { name: "蔡宜庭", email: "yt.tsai@cafeca.com.tw", role: "ENGINEER", status: "ACTIVE", orgUnitId: supSt.id, positionId: posEng.id },
      { name: "鄭凱文", email: "kw.zheng@cafeca.com.tw", role: "MANAGER", status: "ACTIVE", orgUnitId: supGe.id, positionId: posLead.id },
      { name: "許雅婷", email: "yt.hsu@cafeca.com.tw", role: "ENGINEER", status: "ACTIVE", orgUnitId: supGe.id, positionId: posEng.id },
      { name: "劉建志", email: "jz.liu@cafeca.com.tw", role: "MANAGER", status: "ACTIVE", orgUnitId: supHy.id, positionId: posLead.id },
      { name: "楊承翰", email: "ch.yang@cafeca.com.tw", role: "ENGINEER", status: "ACTIVE", orgUnitId: supHy.id, positionId: posEng.id },
      { name: "周世昌", email: "sc.zhou@cafeca.com.tw", role: "MANAGER", status: "ACTIVE", orgUnitId: supTr.id, positionId: posLead.id },
      { name: "賴怡君", email: "yj.lai@cafeca.com.tw", role: "ENGINEER", status: "ACTIVE", orgUnitId: supTr.id, positionId: posEng.id },
      { name: "洪敏華", email: "mh.hong@cafeca.com.tw", role: "MANAGER", status: "ACTIVE", orgUnitId: supQc.id, positionId: posLead.id },
      { name: "曾國峰", email: "gf.zeng@cafeca.com.tw", role: "INSPECTOR", status: "ACTIVE", orgUnitId: supQc.id, positionId: posChief.id },
      { name: "邱淑貞", email: "sz.qiu@cafeca.com.tw", role: "INSPECTOR", status: "ACTIVE", orgUnitId: supQc.id, positionId: posEng.id },
      { name: "高志鵬", email: "zp.gao@cafeca.com.tw", role: "MANAGER", status: "ACTIVE", orgUnitId: supEhs.id, positionId: posLead.id },
      { name: "范振宇", email: "zy.fan@cafeca.com.tw", role: "INSPECTOR", status: "ACTIVE", orgUnitId: supEhs.id, positionId: posEng.id },
      { name: "潘冠廷", email: "gt.pan@cafeca.com.tw", role: "MANAGER", status: "ACTIVE", orgUnitId: supSv.id, positionId: posLead.id },
      { name: "蕭雅文", email: "yw.xiao@cafeca.com.tw", role: "ENGINEER", status: "ACTIVE", orgUnitId: supSv.id, positionId: posAsst.id },
      // 設計部
      { name: "徐嘉玲", email: "jl.hsu@cafeca.com.tw", role: "MANAGER", status: "ACTIVE", orgUnitId: des.id, positionId: posMgr.id },
      { name: "郭柏勳", email: "bx.guo@cafeca.com.tw", role: "MANAGER", status: "ACTIVE", orgUnitId: desCv.id, positionId: posLead.id },
      { name: "何佩珊", email: "ps.he@cafeca.com.tw", role: "ENGINEER", status: "ACTIVE", orgUnitId: desCv.id, positionId: posEng.id },
      { name: "呂昆霖", email: "kl.lu@cafeca.com.tw", role: "MANAGER", status: "ACTIVE", orgUnitId: desMe.id, positionId: posLead.id },
      { name: "葉宗翰", email: "zh.ye@cafeca.com.tw", role: "ENGINEER", status: "ACTIVE", orgUnitId: desMe.id, positionId: posEng.id },
      { name: "江宛儒", email: "wr.jiang@cafeca.com.tw", role: "MANAGER", status: "ACTIVE", orgUnitId: desAr.id, positionId: posLead.id },
      { name: "蘇冠宇", email: "gy.su@cafeca.com.tw", role: "ENGINEER", status: "ACTIVE", orgUnitId: desAr.id, positionId: posEng.id },
      // 專案管理部
      { name: "馮士軒", email: "sx.feng@cafeca.com.tw", role: "MANAGER", status: "ACTIVE", orgUnitId: pmo.id, positionId: posMgr.id },
      { name: "董雅琪", email: "yq.dong@cafeca.com.tw", role: "MANAGER", status: "ACTIVE", orgUnitId: pmo.id, positionId: posChief.id },
      { name: "石承恩", email: "ce.shi@cafeca.com.tw", role: "VIEWER", status: "ACTIVE", orgUnitId: pmo.id, positionId: posSpec.id },
      // 品保稽核部
      { name: "溫國華", email: "gh.wen@cafeca.com.tw", role: "MANAGER", status: "ACTIVE", orgUnitId: qaDept.id, positionId: posMgr.id },
      { name: "尤靜怡", email: "jy.you@cafeca.com.tw", role: "INSPECTOR", status: "ACTIVE", orgUnitId: qaDept.id, positionId: posEng.id },
      // 行政管理部
      { name: "田美惠", email: "mh.tian@cafeca.com.tw", role: "MANAGER", status: "ACTIVE", orgUnitId: admDept.id, positionId: posMgr.id },
      { name: "白詩涵", email: "sh.bai@cafeca.com.tw", role: "VIEWER", status: "ACTIVE", orgUnitId: admHr.id, positionId: posSpec.id },
      { name: "孔令儀", email: "ly.kong@cafeca.com.tw", role: "VIEWER", status: "ACTIVE", orgUnitId: admFi.id, positionId: posSpec.id },
      { name: "秦子軒", email: "zx.qin@cafeca.com.tw", role: "ADMIN", status: "ACTIVE", orgUnitId: admIt.id, positionId: posEng.id },
      { name: "龔志明", email: "zm.gong@cafeca.com.tw", role: "VIEWER", status: "ACTIVE", orgUnitId: admGa.id, positionId: posClerk.id },
      { name: "系統管理員", email: "admin@cafeca.com.tw", role: "ADMIN", status: "ACTIVE", orgUnitId: admIt.id, positionId: posEng.id },
    ],
  });

  // 簽核流程範本
  await prisma.approvalWorkflow.create({
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
  });
  await prisma.approvalWorkflow.create({
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
  });

  const counts = {
    專案: await prisma.project.count(),
    工項: await prisma.workItem.count(),
    查驗: await prisma.inspection.count(),
    缺失: await prisma.defect.count(),
    契約變更: await prisma.contractChange.count(),
    專案文件: await prisma.projectDocument.count(),
    里程碑: await prisma.milestone.count(),
    付款節點: await prisma.paymentNode.count(),
    行事曆: await prisma.reminderEvent.count(),
    待辦: await prisma.todoItem.count(),
    環安衛: await prisma.ehsAudit.count(),
    送審: await prisma.submittal.count(),
    媒體: await prisma.mediaAsset.count(),
    監造報表: await prisma.supervisionReport.count(),
    組織: await prisma.orgUnit.count(),
    職位: await prisma.position.count(),
    帳號: await prisma.account.count(),
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
