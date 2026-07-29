import {
  obligationRiskOptions,
  obligationStageOptions,
  obligationStatusOptions,
  obligationTriggerOptions,
} from "./obligation";
import { projectStatusOptions } from "./pmis";
import type { FormAssistSpec } from "@/service/form-assist";

/**
 * 各建置表單的欄位規格（表單助手用）。
 *
 * 為何集中在此、且由伺服器端依 id 查表：
 * 若讓前端把整份 schema 送上來，等於開放使用者自訂送進模型的結構與說明。
 * 前端只送 specId，規格由伺服器決定，這裡就是唯一的來源。
 *
 * 刻意不納入的欄位：
 *  - 隱藏欄位（如 projectId）—— 由表單自己帶入，不需 AI 判讀。
 *  - 指向其他紀錄的下拉（如 workItemId、obligationId、applicantId）——
 *    選項是執行期才知道的資料庫 id，模型無從判讀，硬填只會產生錯誤關聯。
 *    這些欄位仍由使用者自行選擇。
 */

/** 可判讀的文件型別；與費思上傳的支援範圍一致。 */
const DOC_ACCEPT =
  ".pdf,.png,.jpg,.jpeg,.webp,.docx,.xlsx,.pptx,.txt,.md,.csv";

const SPECS: FormAssistSpec[] = [
  {
    id: "project",
    title: "新增專案",
    purpose: "建立工程專案的基本資料，來源通常是契約書或決標公告。",
    accept: DOC_ACCEPT,
    fields: [
      { name: "code", label: "專案編號", kind: "text", hint: "如標案案號" },
      { name: "name", label: "專案名稱", kind: "text", hint: "工程名稱全稱" },
      { name: "location", label: "工程地點", kind: "text" },
      { name: "status", label: "狀態", kind: "select", options: projectStatusOptions },
      { name: "client", label: "業主／主辦機關", kind: "text" },
      { name: "contractor", label: "承包商", kind: "text" },
      { name: "supervisor", label: "監造單位", kind: "text" },
      { name: "budget", label: "契約金額", kind: "number", hint: "新台幣元" },
      { name: "startDate", label: "開工日", kind: "date" },
      { name: "endDate", label: "完工日", kind: "date" },
      { name: "description", label: "工程摘要", kind: "textarea", hint: "兩三句說明工程性質與主要工項" },
    ],
  },
  {
    id: "obligation",
    title: "新增履約事項",
    purpose:
      "建立一項契約應辦事項並管制其期限，來源通常是契約的履約標的或履約管理條次。",
    accept: DOC_ACCEPT,
    fields: [
      { name: "code", label: "管制編號", kind: "text", hint: "契約或管制表的項次" },
      { name: "title", label: "履約事項", kind: "text", hint: "把週期或期限寫進名稱，如「每月10日前提送月報」" },
      { name: "stage", label: "階段", kind: "select", options: obligationStageOptions },
      { name: "risk", label: "風險", kind: "select", options: obligationRiskOptions },
      { name: "triggerType", label: "觸發方式", kind: "select", options: obligationTriggerOptions },
      { name: "status", label: "狀態", kind: "select", options: obligationStatusOptions },
      { name: "dueDate", label: "期限", kind: "date" },
      { name: "ownerUnit", label: "責任單位", kind: "text" },
      { name: "ownerName", label: "責任人", kind: "text" },
      { name: "contractBasis", label: "契約依據", kind: "text", hint: "如 契約第五條第二款" },
      { name: "weight", label: "進度權重", kind: "number", hint: "正整數，依工作量給不同權重" },
    ],
  },
  {
    id: "work-item",
    title: "新增工程分項",
    purpose: "建立契約範圍內實際執行的工作項目。",
    accept: DOC_ACCEPT,
    fields: [
      { name: "name", label: "分項名稱", kind: "text", hint: "沿用契約用語" },
      { name: "category", label: "工種／類別", kind: "text" },
      { name: "progress", label: "進度", kind: "number", hint: "0 到 100 的百分比" },
      { name: "plannedStart", label: "預定開始", kind: "date" },
      { name: "plannedEnd", label: "預定完成", kind: "date" },
      { name: "actualStart", label: "實際開始", kind: "date" },
      { name: "actualEnd", label: "實際完成", kind: "date" },
    ],
  },
  {
    id: "inspection",
    title: "新增查驗",
    purpose: "建立一筆施工查驗紀錄，來源可能是查驗表單或現場照片。",
    accept: DOC_ACCEPT,
    fields: [
      {
        name: "type",
        label: "查驗類別",
        kind: "select",
        options: [
          { value: "MATERIAL", label: "材料" },
          { value: "PROCESS", label: "施工" },
          { value: "ACCEPTANCE", label: "驗收" },
          { value: "SAFETY", label: "安全" },
        ],
      },
      { name: "scheduledAt", label: "查驗日期", kind: "date" },
      {
        name: "result",
        label: "結果",
        kind: "select",
        options: [
          { value: "PENDING", label: "待查驗" },
          { value: "PASSED", label: "合格" },
          { value: "FAILED", label: "不合格" },
          { value: "CONDITIONAL", label: "限期改善" },
        ],
      },
      { name: "location", label: "部位", kind: "text", hint: "如 B2 連續壁 P12" },
      { name: "inspector", label: "查驗人", kind: "text" },
      { name: "notes", label: "備註", kind: "text" },
    ],
  },
  {
    id: "defect",
    title: "新增缺失",
    purpose: "建立一筆品質或安衛缺失，來源可能是稽核報告或現場照片。",
    accept: DOC_ACCEPT,
    fields: [
      { name: "title", label: "缺失標題", kind: "text" },
      {
        name: "severity",
        label: "嚴重度",
        kind: "select",
        options: [
          { value: "LOW", label: "低" },
          { value: "MEDIUM", label: "中" },
          { value: "HIGH", label: "高" },
          { value: "CRITICAL", label: "嚴重" },
        ],
      },
      {
        name: "status",
        label: "狀態",
        kind: "select",
        options: [
          { value: "OPEN", label: "待處理" },
          { value: "IN_PROGRESS", label: "改善中" },
          { value: "RESOLVED", label: "已改善" },
          { value: "CLOSED", label: "結案" },
        ],
      },
      { name: "dueDate", label: "改善期限", kind: "date" },
      { name: "assignedTo", label: "負責", kind: "text" },
      { name: "description", label: "說明", kind: "textarea" },
    ],
  },
  {
    id: "contract-change",
    title: "新增契約變更",
    purpose: "登錄一次契約變更，來源通常是變更設計核准函或變更契約書。",
    accept: DOC_ACCEPT,
    fields: [
      { name: "sequence", label: "變更次數", kind: "number", hint: "留空則自動遞增" },
      { name: "approvedDate", label: "核准日期", kind: "date" },
      { name: "description", label: "變更內容", kind: "textarea" },
      { name: "amountAfter", label: "變更後金額", kind: "number", hint: "新台幣元" },
      { name: "daysChanged", label: "變更天數", kind: "number", hint: "展延為正、縮短為負" },
      { name: "docNo", label: "核准文號", kind: "text" },
    ],
  },
  {
    id: "project-document",
    title: "新增契約文件",
    purpose: "登錄一份契約或工程文件的索引資料。",
    accept: DOC_ACCEPT,
    fields: [
      {
        name: "category",
        label: "文件類別",
        kind: "select",
        options: [
          { value: "CONTRACT", label: "契約" },
          { value: "DRAWING", label: "圖說" },
          { value: "SPEC", label: "規範" },
          { value: "PERMIT", label: "許可" },
          { value: "OTHER", label: "其他" },
        ],
      },
      { name: "name", label: "文件名稱", kind: "text" },
      { name: "fileNo", label: "歸檔編號", kind: "text" },
      { name: "issuedDate", label: "核發日期", kind: "date" },
      { name: "note", label: "備註", kind: "text" },
    ],
  },
  {
    id: "approval-document",
    title: "新增簽核文件",
    purpose: "建立一份待簽核的送審文件。",
    accept: DOC_ACCEPT,
    fields: [
      { name: "title", label: "文件標題", kind: "text" },
      { name: "description", label: "說明", kind: "textarea" },
    ],
  },
];

/** 依 id 查表；找不到回 null（呼叫端須據此拒絕請求）。 */
export const FORM_ASSIST_SPECS: Record<string, FormAssistSpec> =
  Object.fromEntries(SPECS.map((s) => [s.id, s]));

export function findAssistSpec(id: string | undefined | null) {
  if (!id) return null;
  return FORM_ASSIST_SPECS[id] ?? null;
}

/** 供元件標註的 id 型別，寫錯 id 時編譯期就會報錯。 */
export type FormAssistId =
  | "project"
  | "obligation"
  | "work-item"
  | "inspection"
  | "defect"
  | "contract-change"
  | "project-document"
  | "approval-document";
