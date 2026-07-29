"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  X,
  Check,
  CircleDashed,
  Loader2,
  ArrowLeft,
  ArrowRight,
  Plus,
  Trash2,
  Flag,
  Hammer,
  Sparkles,
  AlertCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useNotification } from "@/components/ui/notification";
import { cn } from "@/lib/utils";
import {
  useAiAssistant,
  type AiEventOutcome,
} from "@/components/ai-assistant-context";
import { WIZARD_DOC_ACCEPT } from "@/constant/ai";
import { projectStatusOptions, projectStatusMeta } from "@/constant/pmis";
import {
  obligationRiskOptions,
  obligationStageOptions,
  obligationTriggerOptions,
} from "@/constant/obligation";
import type { ProjectStatus } from "@/generated/prisma/enums";
import type {
  WizardScopeItem,
  WizardWorkPackage,
} from "@/service/faith.service";
import {
  WIZARD_STEPS,
  applyProgress,
  describeStep,
  initialProgress,
  type StepProgress,
  type WizardStepId,
} from "@/service/wizard-steps";
import { summarizeRun, verdictOf } from "@/service/wizard-summary";
import {
  createProjectViaWizard,
  type WizardProfile,
} from "@/app/projects/actions";

type Fields = WizardProfile;

// Info: 精靈草稿中的履約事項／工程分項。以 rid 作為 React key，送出前剔除。
type ObligationRow = {
  rid: string;
  code: string;
  title: string;
  stage: string;
  risk: string;
  triggerType: string;
  dueDate: string;
  ownerUnit: string;
  ownerName: string;
  contractBasis: string;
  weight: string;
  commissioning: boolean;
};
type WorkItemRow = {
  rid: string;
  code: string;
  name: string;
  category: string;
  obligation: string;
  plannedStart: string;
  plannedEnd: string;
};

const AI_TASK_ID = "project-wizard";

/**
 * 本次瀏覽期間已詢問過要不要費思協助的頁面。
 *
 * 放模組層級：元件卸載即重置的話，來回切換頁面會被反覆詢問。
 * 用 Set 而非 let：重新指派模組層級變數會被視為 render 期間的副作用，
 * 集合的變更則不受此限（與各建置對話框採同一作法）。
 */
const assistAsked = new Set<string>();

const AI_SUGGESTIONS = [
  "請依工程類型建議常見的履約事項與工程分項",
  "這是一件道路拓寬工程，工期兩年",
];

let ridSeq = 0;
const nextRid = () => `r${++ridSeq}`;

const emptyObligation = (): ObligationRow => ({
  rid: nextRid(),
  code: "",
  title: "",
  stage: "CONSTRUCTION",
  risk: "GREEN",
  triggerType: "FIXED_DATE",
  dueDate: "",
  ownerUnit: "",
  ownerName: "",
  contractBasis: "",
  weight: "1",
  commissioning: false,
});

const emptyWorkItem = (): WorkItemRow => ({
  rid: nextRid(),
  code: "",
  name: "",
  category: "",
  obligation: "",
  plannedStart: "",
  plannedEnd: "",
});

// Info: 精靈需蒐集的欄位清單（總覽用），required 為建立專案必填。
const FIELD_DEFS: { key: keyof Fields; label: string; required?: boolean }[] = [
  { key: "code", label: "專案編號", required: true },
  { key: "name", label: "專案名稱", required: true },
  { key: "location", label: "工程地點" },
  { key: "client", label: "業主／主辦機關" },
  { key: "contractor", label: "承包商" },
  { key: "supervisor", label: "監造單位" },
  { key: "budget", label: "預算 (TWD)" },
  { key: "startDate", label: "開工日" },
  { key: "endDate", label: "完工日" },
  { key: "status", label: "狀態" },
  { key: "description", label: "工程摘要" },
];

// Info: 送出／回填 AI 前，將列資料轉為不含 rid 的乾淨物件
function toObligationPayload(m: ObligationRow) {
  return {
    code: m.code.trim() || undefined,
    title: m.title.trim(),
    stage: m.stage || undefined,
    risk: m.risk || undefined,
    triggerType: m.triggerType || undefined,
    dueDate: m.dueDate || undefined,
    ownerUnit: m.ownerUnit.trim() || undefined,
    ownerName: m.ownerName.trim() || undefined,
    contractBasis: m.contractBasis.trim() || undefined,
    weight: m.weight ? Number(m.weight) : undefined,
    commissioning: m.commissioning,
  };
}

function toWorkItemPayload(w: WorkItemRow) {
  return {
    code: w.code.trim() || undefined,
    name: w.name.trim(),
    category: w.category.trim() || undefined,
    obligation: w.obligation.trim() || undefined,
    plannedStart: w.plannedStart || undefined,
    plannedEnd: w.plannedEnd || undefined,
  };
}

function displayValue(key: keyof Fields, value: unknown): string {
  if (value == null || value === "") return "";
  if (key === "status") {
    return projectStatusMeta[value as ProjectStatus]?.label ?? String(value);
  }
  if (key === "budget") {
    const n = Number(value);
    return Number.isNaN(n) ? String(value) : `NT$ ${n.toLocaleString()}`;
  }
  return String(value);
}

/**
 * 專案建置。
 *
 * 以「頁面」而非彈窗呈現：費思展開時會從工作區右側分割一欄，
 * 彈窗會與該分欄互相遮擋；改為頁面後兩者自然並存，
 * 未完成的草稿也有網址可回。
 */
export function ProjectBuild() {
  const router = useRouter();
  const { task, startTask, endTask, registerOffer } = useAiAssistant();
  const { notify } = useNotification();
  const [step, setStep] = useState<1 | 2>(1);
  const [fields, setFields] = useState<Fields>({});
  const [obligations, setObligations] = useState<ObligationRow[]>([]);
  const [workItems, setWorkItems] = useState<WorkItemRow[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 四段解析的進度；由費思串流回報的事件驅動
  const [progress, setProgress] = useState<StepProgress[]>(initialProgress());
  /*
    事件處理器是 startTask 當下建立的閉包，直接讀 state 會拿到過期值，
    因此進度、附註與欄位另以 ref 保存，供總結時取得最新內容。
  */
  const progressRef = useRef<StepProgress[]>(initialProgress());
  const notesRef = useRef<Partial<Record<WizardStepId, string>>>({});
  const fileNameRef = useRef<string | null>(null);
  const onlyRef = useRef<WizardStepId[] | undefined>(undefined);
  /*
    建置過程費思歸檔的檔案 id。建案時尚無專案，這些檔案先歸為「未指派」，
    專案建立成功後再一併改歸該專案，使用者不需回檔案管理手動補指派。
  */
  const uploadIdsRef = useRef<string[]>([]);
  // 契約履約標的（階段一）與工程項目（階段二）：
  // 各階段的上游輸入，單獨重試下游時必須回傳，否則該段會因缺上游而略過
  const scopeRef = useRef<WizardScopeItem[]>([]);
  const packagesRef = useRef<WizardWorkPackage[]>([]);
  const fieldsRef = useRef<Fields>({});

  /**
   * 更新專案欄位。同時寫入 ref，讓串流事件處理器（閉包）能讀到最新值；
   * 不在 render 期間同步 ref（react-hooks/refs 禁止）。
   */
  function commitFields(next: Fields | ((prev: Fields) => Fields)) {
    const value = typeof next === "function" ? next(fieldsRef.current) : next;
    fieldsRef.current = value;
    setFields(value);
  }
  const aiActive = task?.id === AI_TASK_ID;

  const filledCount = FIELD_DEFS.filter(
    (f) => (fields[f.key] ?? "") !== "",
  ).length;
  const requiredReady = FIELD_DEFS.filter((f) => f.required).every(
    (f) => (fields[f.key] ?? "") !== "",
  );
  const pct = Math.round((filledCount / FIELD_DEFS.length) * 100);

  function reset() {
    setStep(1);
    commitFields({});
    setObligations([]);
    setWorkItems([]);
    setCreating(false);
    setError(null);
    setProgress(initialProgress());
    progressRef.current = initialProgress();
    notesRef.current = {};
    fileNameRef.current = null;
    onlyRef.current = undefined;
    uploadIdsRef.current = [];
    scopeRef.current = [];
    packagesRef.current = [];
  }

  /** 放棄建置：結束費思任務並回到專案列表。 */
  function cancel() {
    if (aiActive) endTask();
    reset();
    router.push("/projects");
  }

  /**
   * 把「解析文件並填寫專案資料」交給費思執行。
   *
   * 採分段串流：後端把四段解析（基本資料／履約事項／責任分工／工程分項）
   * 逐段回報，本元件收到 data 事件即時併入草稿，使用者能邊看邊確認，
   * 而非等到全部結束才一次跳出結果。
   *
   * @param only 僅重跑指定段落（單段重試）；未給則全跑。
   */
  function askFase(only?: WizardStepId[]) {
    const retrying = Boolean(only?.length);
    // 重試單段時只重設該段狀態，其他段的成果保留
    const next = retrying
      ? progressRef.current.map((x) =>
          only!.includes(x.id)
            ? ({ id: x.id, state: "pending" } as StepProgress)
            : x,
        )
      : initialProgress();
    progressRef.current = next;
    setProgress(next);
    onlyRef.current = only;
    if (!retrying) notesRef.current = {};

    startTask({
      id: AI_TASK_ID,
      title: "專案建置",
      greeting:
        "好的，我來協助您建立新專案。您可以：\n\n- 上傳**契約書／決標公告／工期表／預算書**（支援 PDF、Word、Excel、PowerPoint、圖片）\n- 或直接用文字告訴我專案資訊\n\n我會分階段解析並隨時回報進度：**專案基本資料** → **契約履約標的** → **履約事項** → **責任分工與契約依據** → **工程項目** → **工程分項**。\n\n每一段只做一件事：先**照抄**契約履約標的，再由標的**推導**應辦期限、**規劃**具體工程項目，最後把項目**細分**為可排程的工程分項。上游沒有結果時下游會直接略過，不會憑常識自行編造。某一段失敗也不影響其他段已擷取的內容。",
      endpoint: "/api/projects/wizard",
      accept: WIZARD_DOC_ACCEPT,
      suggestions: AI_SUGGESTIONS,
      stream: true,
      buildBody: ({ messages, attachment }) => {
        // 記下檔名，供結束時的總結引用
        if (attachment?.name) fileNameRef.current = attachment.name;
        return {
        messages,
        attachment,
        only,
        /*
          帶回本次已歸檔的檔案 id。
          契約全文只存在於上傳那一次的請求裡；補資料與單段重試都不帶附件，
          伺服器需據此重讀契約，否則依賴契約的段落會憑空編造內容。
        */
        documentUploadIds: uploadIdsRef.current,
        known: {
          fields,
          obligations: obligations.map(toObligationPayload),
          workItems: workItems.map(toWorkItemPayload),
          // 單獨重試「工程分項」時第二段不會重跑，需回傳同一份履約標的，
          // 否則分項會失去來源依據而改由模型自行想像
          scopeItems: scopeRef.current,
        packages: packagesRef.current,
        },
        };
      },
      // 串流模式不使用 onResult（由 onEvent 處理），此處僅為滿足型別
      onResult: () => {},
      onEvent: (event) => handleWizardEvent(event),
    });
  }

  /**
   * 處理一個串流事件並決定其去向。
   *
   * 進度類事件回 activity —— 只在工作指示區暫時顯示，不留在對話中；
   * done 事件回 message —— 由費思以一則總結說明整體執行結果。
   */
  function handleWizardEvent(event: {
    type: string;
    [k: string]: unknown;
  }): AiEventOutcome {
    if (event.type === "archived") {
      const archived = event.archived as { id?: string } | undefined;
      if (archived?.id) uploadIdsRef.current.push(archived.id);
      return { kind: "ignore" };
    }

    if (event.type === "status") {
      const p: StepProgress = {
        id: event.step as WizardStepId,
        state: event.state as StepProgress["state"],
        count: typeof event.count === "number" ? event.count : undefined,
        total: typeof event.total === "number" ? event.total : undefined,
        error:
          typeof event.error === "string"
            ? event.error
            : typeof event.reason === "string"
              ? event.reason
              : undefined,
      };
      // 進度寫入元件狀態（左側清單持續可見、可重試），
      // 同時把當下動作交給工作指示區顯示
      progressRef.current = applyProgress(progressRef.current, p);
      setProgress(progressRef.current);

      if (typeof event.note === "string" && event.note.trim()) {
        notesRef.current[p.id] = event.note.trim();
      }
      return { kind: "activity", text: describeStep(p) };
    }

    if (event.type === "data") {
      if (Array.isArray(event.scopeItems)) {
        scopeRef.current = event.scopeItems as WizardScopeItem[];
      }
      if (Array.isArray(event.packages)) {
        packagesRef.current = event.packages as WizardWorkPackage[];
      }
      applyIncoming(event);
      return { kind: "ignore" };
    }

    if (event.type === "done") {
      // 唯一留在對話中的訊息：整體執行結果
      const empty = FIELD_DEFS.filter(
        (f) => (fieldsRef.current[f.key] ?? "") === "",
      );
      const text = summarizeRun({
        progress: progressRef.current,
        notes: notesRef.current,
        missingRequired: empty.filter((f) => f.required).map((f) => f.label),
        missingFields: empty.map((f) => f.label),
        fileName: fileNameRef.current,
        only: onlyRef.current,
      });
      return text ? { kind: "message", text } : { kind: "ignore" };
    }

    if (event.type === "error") {
      return { kind: "message", text: `解析中斷：${String(event.error ?? "原因不明")}` };
    }

    return { kind: "ignore" };
  }

  /** 把 data 事件的內容併入草稿。 */
  function applyIncoming(event: Record<string, unknown>) {
    const incomingFields = event.fields as Fields | undefined;
    if (incomingFields) {
      // 不覆蓋使用者已確認的非空值
      commitFields((prev) => {
        const merged: Fields = { ...prev };
        for (const [k, v] of Object.entries(incomingFields)) {
          if (v == null || v === "") continue;
          if ((merged[k as keyof Fields] ?? "") === "") {
            (merged as Record<string, unknown>)[k] = v;
          }
        }
        return merged;
      });
    }

    const incomingObligations = event.obligations as
      | {
          code?: string;
          title?: string;
          stage?: string;
          risk?: string;
          triggerType?: string;
          dueDate?: string;
          ownerUnit?: string;
          ownerName?: string;
          contractBasis?: string;
          weight?: number;
          commissioning?: boolean;
        }[]
      | undefined;
    if (incomingObligations?.length) {
      setObligations((prev) => {
        const byTitle = new Map(prev.map((m) => [m.title.trim(), m]));
        const out: ObligationRow[] = [];
        for (const m of incomingObligations) {
          const title = m.title?.trim();
          if (!title) continue;
          const existing = byTitle.get(title);
          if (existing) {
            // 責任分工段會回填既有事項，故以「補空欄位」方式更新
            out.push({
              ...existing,
              ownerUnit: existing.ownerUnit || (m.ownerUnit ?? ""),
              ownerName: existing.ownerName || (m.ownerName ?? ""),
              contractBasis: existing.contractBasis || (m.contractBasis ?? ""),
              dueDate: existing.dueDate || (m.dueDate ?? ""),
              code: existing.code || (m.code ?? ""),
            });
            byTitle.delete(title);
          } else {
            out.push({
              rid: nextRid(),
              code: m.code ?? "",
              title,
              stage: m.stage ?? "CONSTRUCTION",
              risk: m.risk ?? "GREEN",
              triggerType: m.triggerType ?? "FIXED_DATE",
              dueDate: m.dueDate ?? "",
              ownerUnit: m.ownerUnit ?? "",
              ownerName: m.ownerName ?? "",
              contractBasis: m.contractBasis ?? "",
              weight: m.weight != null ? String(m.weight) : "1",
              commissioning: m.commissioning === true,
            });
          }
        }
        // 保留使用者自行新增、模型未提及的列
        return [...out, ...byTitle.values()];
      });
    }

    const incomingWorkItems = event.workItems as
      | {
          code?: string;
          name?: string;
          category?: string;
          obligation?: string;
          plannedStart?: string;
          plannedEnd?: string;
        }[]
      | undefined;
    if (incomingWorkItems?.length) {
      setWorkItems((prev) => {
        const seen = new Set(prev.map((w) => w.name.trim()));
        const added = incomingWorkItems
          .filter((w) => w.name?.trim() && !seen.has(w.name!.trim()))
          .map((w) => ({
            rid: nextRid(),
            code: w.code ?? "",
            name: w.name!.trim(),
            category: w.category ?? "",
            obligation: w.obligation ?? "",
            plannedStart: w.plannedStart ?? "",
            plannedEnd: w.plannedEnd ?? "",
          }));
        return [...prev, ...added];
      });
    }
  }

  function setField(key: keyof Fields, value: string) {
    commitFields((prev) => ({ ...prev, [key]: value }));
  }

  function setObligation<K extends keyof ObligationRow>(
    rid: string,
    key: K,
    value: ObligationRow[K],
  ) {
    setObligations((prev) =>
      prev.map((m) => (m.rid === rid ? { ...m, [key]: value } : m)),
    );
  }

  function setWorkItem<K extends keyof WorkItemRow>(
    rid: string,
    key: K,
    value: WorkItemRow[K],
  ) {
    setWorkItems((prev) =>
      prev.map((w) => (w.rid === rid ? { ...w, [key]: value } : w)),
    );
  }

  // Info: 履約事項更名時，同步更新引用該名稱的工程分項，維持關聯
  function renameObligation(rid: string, value: string) {
    const before = obligations.find((m) => m.rid === rid)?.title ?? "";
    setObligation(rid, "title", value);
    if (before) {
      setWorkItems((prev) =>
        prev.map((w) =>
          w.obligation === before ? { ...w, obligation: value } : w,
        ),
      );
    }
  }

  function removeObligation(rid: string) {
    const name = obligations.find((m) => m.rid === rid)?.title ?? "";
    setObligations((prev) => prev.filter((m) => m.rid !== rid));
    if (name) {
      setWorkItems((prev) =>
        prev.map((w) => (w.obligation === name ? { ...w, obligation: "" } : w)),
      );
    }
  }

  const obligationTitles = obligations
    .map((m) => m.title.trim())
    .filter((n) => n !== "");
  const namedObligations = obligations.filter((m) => m.title.trim()).length;
  const namedWorkItems = workItems.filter((w) => w.name.trim()).length;
  // 只要有任一段脫離「待處理」，就顯示解析進度區塊
  const anyParsing = progress.some((p) => p.state !== "pending");

  async function create() {
    if (!requiredReady || creating) return;
    setCreating(true);
    setError(null);
    try {
      const result = await createProjectViaWizard(
        fields,
        obligations.filter((m) => m.title.trim()).map(toObligationPayload),
        workItems.filter((w) => w.name.trim()).map(toWorkItemPayload),
        uploadIdsRef.current,
        scopeRef.current,
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const id = result.id;
      /*
        建立成功後結束費思任務並清空草稿。
        先前此處誤呼叫 close()，它其實解析到 window.close（TypeScript 不會報錯），
        瀏覽器多半直接忽略，草稿也就沒有被清掉。
      */
      if (aiActive) endTask();
      reset();
      /*
        切換至新專案：側邊欄的「目前專案」讀 ?project=，
        帶上此參數才會鎖定到剛建立的案子，而非停留在「全部專案」。
      */
      // created=1 觸發「是否一併歸入未指派檔案」的提示
      router.push(`/projects/${id}?project=${id}&created=1`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "建立專案失敗。");
    } finally {
      setCreating(false);
    }
  }

  /*
    向右下角的費思註冊協助入口：在本頁點擊費思等同啟動 AI 協助建置，
    而不是開啟一個與眼前表單無關的一般問答。離開頁面時解除註冊。
  */
  useEffect(() => {
    return registerOffer({
      taskId: AI_TASK_ID,
      title: "專案建置",
      start: () => askFase(),
    });
    // askFase 在本元件生命週期內穩定
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registerOffer]);

  /*
    開啟建置頁時主動詢問是否要費思協助。
    取代原本的「AI 協助建置」按鈕：入口統一為右下角的狀態顯示，
    這裡只負責提出邀請。與各建置對話框的行為一致。
    本次瀏覽期間只問一次，避免來回切換頁面被反覆打擾。
  */
  useEffect(() => {
    // 費思已開啟而自動接手時不必再問，否則會在剛接手後立刻跳出邀請
    if (aiActive) return;
    if (assistAsked.has(AI_TASK_ID)) return;
    assistAsked.add(AI_TASK_ID);
    notify({
      title: "需要費思協助建立此專案嗎？",
      description:
        "上傳契約書或決標公告，我會分階段判讀並填入左側表單。",
      variant: "info",
      actionLabel: "好，交給費思",
      actionIcon: "sparkles",
      onAction: () => askFase(),
      duration: 12000,
    });
    // askFase 與 notify 在本元件生命週期內穩定，僅需於進入頁面時觸發一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiActive]);


  return (
    /*
      以 container query 決定分欄：費思展開後工作區變窄，
      依「實際可用寬度」而非視窗寬度反應，左側進度欄才不會把表單壓爛。
    */
    <div className="@container flex min-h-0 flex-1 flex-col">
      {/* 步驟指示列 */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3 sm:px-8">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
            步驟 {step} / 2
          </span>
          <span className="text-sm font-medium">
            {step === 1 ? "專案基本資料" : "履約事項與工程分項"}
          </span>
        </div>
        <button
          type="button"
          onClick={cancel}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <X className="size-3.5" />
          放棄建置
        </button>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 @[880px]:grid-cols-[280px_1fr]">
              {/* 左：需蒐集資訊總覽與進度 */}
        <aside className="hidden min-h-0 flex-col border-r bg-muted/30 @[880px]:flex">
                <div className="border-b px-4 py-3">
                  <div className="mb-1 flex items-center justify-between text-xs font-medium text-muted-foreground">
                    <span>解析進度</span>
                    <span className="tabular-nums">
                      {filledCount} / {FIELD_DEFS.length}
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
                <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-3">
                  {FIELD_DEFS.map((f) => {
                    const val = displayValue(f.key, fields[f.key]);
                    const done = val !== "";
                    return (
                      <div
                        key={f.key}
                        className="flex items-start gap-2 rounded-md px-2 py-1.5"
                      >
                        {done ? (
                          <Check className="mt-0.5 size-3.5 shrink-0 text-success" />
                        ) : (
                          <CircleDashed className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/50" />
                        )}
                        <div className="min-w-0">
                          <div className="text-xs font-medium">
                            {f.label}
                            {f.required ? (
                              <span className="ml-0.5 text-destructive">*</span>
                            ) : null}
                          </div>
                          <div
                            className={cn(
                              "truncate text-xs",
                              done
                                ? "text-foreground/80"
                                : "text-muted-foreground/60",
                            )}
                          >
                            {done ? val : "待補"}
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {/* 履約事項與工程分項蒐集狀況 */}
                  <div className="mt-2 space-y-1 border-t pt-2">
                    {[
                      { icon: Flag, label: "履約事項", count: namedObligations },
                      { icon: Hammer, label: "工程分項", count: namedWorkItems },
                    ].map(({ icon: Icon, label, count }) => (
                      <div
                        key={label}
                        className="flex items-center gap-2 rounded-md px-2 py-1.5"
                      >
                        {count > 0 ? (
                          <Check className="size-3.5 shrink-0 text-success" />
                        ) : (
                          <CircleDashed className="size-3.5 shrink-0 text-muted-foreground/50" />
                        )}
                        <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                        <span className="text-xs font-medium">{label}</span>
                        <span
                          className={cn(
                            "ml-auto text-xs tabular-nums",
                            count > 0
                              ? "text-foreground/80"
                              : "text-muted-foreground/60",
                          )}
                        >
                          {count > 0 ? `${count} 項` : "待補"}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/*
                    分段解析進度。四段各自獨立，某段失敗時其他段的資料仍在，
                    因此提供單段重試而非整份重跑。
                  */}
                  {anyParsing ? (
                    <div className="mt-2 space-y-1 border-t pt-2">
                      <div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/60">
                        文件解析進度
                      </div>
                      {progress.map((p) => {
                        const meta = WIZARD_STEPS.find((x) => x.id === p.id);
                        // 與對話總結共用同一份判定，避免兩處說法不一致
                        const verdict = verdictOf(p);
                        const thin =
                          p.state === "done" &&
                          (verdict === "partial" || verdict === "empty");
                        return (
                          <div
                            key={p.id}
                            className="flex items-start gap-2 rounded-md px-2 py-1.5"
                          >
                            {p.state === "running" ? (
                              <Loader2 className="mt-0.5 size-3.5 shrink-0 animate-spin text-primary" />
                            ) : thin ? (
                              <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-warning" />
                            ) : p.state === "done" ? (
                              <Check className="mt-0.5 size-3.5 shrink-0 text-success" />
                            ) : p.state === "failed" ? (
                              <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-destructive" />
                            ) : (
                              <CircleDashed className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/50" />
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="flex items-baseline gap-2">
                                <span className="text-xs font-medium">
                                  {meta?.label ?? p.id}
                                </span>
                                <span
                                  className={cn(
                                    "ml-auto shrink-0 text-xs tabular-nums",
                                    thin ? "text-warning" : "text-muted-foreground",
                                  )}
                                >
                                  {p.state === "done"
                                    ? verdict === "empty"
                                      ? "未取得"
                                      : p.total != null
                                        ? `${p.count ?? 0}/${p.total}`
                                        : `${p.count ?? 0} 項`
                                    : p.state === "running"
                                      ? "解析中"
                                      : p.state === "failed"
                                        ? "失敗"
                                        : p.state === "skipped"
                                          ? "略過"
                                          : "待處理"}
                                </span>
                              </div>
                              {p.error ? (
                                <div className="mt-0.5 flex items-start gap-1.5">
                                  <span className="min-w-0 flex-1 break-words text-[11px] text-muted-foreground">
                                    {p.error}
                                  </span>
                                  {p.state === "failed" ? (
                                    <button
                                      type="button"
                                      onClick={() => askFase([p.id])}
                                      className="shrink-0 text-[11px] font-medium text-primary hover:underline"
                                    >
                                      重試
                                    </button>
                                  ) : null}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              </aside>

              {/* 右：Step 1 基本資料 / Step 2 履約事項與工程分項 */}
              <section className="flex min-h-0 flex-col">
                {aiActive ? (
                  <div className="animate-bubble-in mx-4 mt-4 flex items-start gap-2 rounded-lg border border-primary/40 bg-primary/5 p-3 text-sm">
                    <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
                    <div>
                      <span className="font-medium text-primary">
                        費思正在協助建立此專案
                      </span>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        請在右下角的費思對話框上傳文件或描述專案，判讀結果會自動填入。
                      </p>
                    </div>
                  </div>
                ) : null}

                {step === 1 ? (
                  <div className="min-h-0 flex-1 overflow-y-auto p-4">
                    <p className="mb-3 text-sm text-muted-foreground">
                      請專案經理人核對以下由精靈整理的專案基本資料，可直接修改。
                    </p>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {FIELD_DEFS.filter(
                        (f) => f.key !== "status" && f.key !== "description",
                      ).map((f) => (
                        <div key={f.key} className="space-y-1.5">
                          <Label htmlFor={`w-${f.key}`}>
                            {f.label}
                            {f.required ? (
                              <span className="ml-0.5 text-destructive">*</span>
                            ) : null}
                          </Label>
                          <Input
                            id={`w-${f.key}`}
                            type={
                              f.key === "startDate" || f.key === "endDate"
                                ? "date"
                                : f.key === "budget"
                                  ? "number"
                                  : "text"
                            }
                            value={String(fields[f.key] ?? "")}
                            onChange={(e) => setField(f.key, e.target.value)}
                          />
                        </div>
                      ))}
                      <div className="space-y-1.5">
                        <Label htmlFor="w-status">狀態</Label>
                        <Select
                          id="w-status"
                          // 未設定時保持空值：先前預設顯示「規劃中」，
                          // 會讓畫面看起來已填、左側清單卻標為待補而自相矛盾
                          value={String(fields.status ?? "")}
                          onChange={(e) => setField("status", e.target.value)}
                        >
                          <option value="">未指定</option>
                          {projectStatusOptions.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </Select>
                      </div>
                      <div className="space-y-1.5 sm:col-span-2">
                        <Label htmlFor="w-description">工程摘要</Label>
                        <Textarea
                          id="w-description"
                          rows={3}
                          value={String(fields.description ?? "")}
                          onChange={(e) =>
                            setField("description", e.target.value)
                          }
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-4">
                    <p className="text-sm text-muted-foreground">
                      請核對履約事項與工程分項，可新增、刪除或修改。留空名稱的列不會建立。
                    </p>

                    {/* 履約事項 */}
                    <section className="space-y-2">
                      <div className="flex items-center justify-between">
                        <h3 className="flex items-center gap-2 text-sm font-semibold">
                          <Flag className="size-4 text-primary" />
                          履約事項
                          <span className="text-xs font-normal text-muted-foreground">
                            （{namedObligations} 項）
                          </span>
                        </h3>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setObligations((p) => [...p, emptyObligation()])
                          }
                        >
                          <Plus className="size-4" />
                          新增履約事項
                        </Button>
                      </div>

                      {obligations.length === 0 ? (
                        <p className="rounded-md border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
                          尚無履約事項。可回上一步請精靈依工程類型建議範本，或手動新增。
                        </p>
                      ) : (
                        <div className="overflow-x-auto pb-1">
                          <div className="space-y-2 sm:min-w-[1080px]">
                            <div className="hidden gap-2 whitespace-nowrap px-1 text-[11px] font-medium text-muted-foreground sm:grid sm:grid-cols-[128px_minmax(180px,1fr)_116px_96px_116px_142px_136px_64px_60px_36px]">
                              <span>管制編號</span>
                              <span>履約事項</span>
                              <span>階段</span>
                              <span>風險</span>
                              <span>觸發方式</span>
                              <span>期限</span>
                              <span>責任單位／人</span>
                              <span>權重</span>
                              <span>試運轉</span>
                              <span />
                            </div>
                            {obligations.map((m) => (
                            <div
                              key={m.rid}
                              className="grid grid-cols-1 gap-2 rounded-md border p-2 sm:grid-cols-[128px_minmax(180px,1fr)_116px_96px_116px_142px_136px_64px_60px_36px] sm:items-center sm:border-0 sm:p-0"
                            >
                              <Input
                                aria-label="管制編號"
                                placeholder="自動編號"
                                value={m.code}
                                onChange={(e) =>
                                  setObligation(m.rid, "code", e.target.value)
                                }
                              />
                              <Input
                                aria-label="履約事項名稱"
                                placeholder="如 結構體完成"
                                value={m.title}
                                onChange={(e) =>
                                  renameObligation(m.rid, e.target.value)
                                }
                              />
                              <Select
                                aria-label="階段"
                                value={m.stage}
                                onChange={(e) =>
                                  setObligation(m.rid, "stage", e.target.value)
                                }
                              >
                                {obligationStageOptions.map((o) => (
                                  <option key={o.value} value={o.value}>
                                    {o.label}
                                  </option>
                                ))}
                              </Select>
                              <Select
                                aria-label="風險"
                                value={m.risk}
                                onChange={(e) =>
                                  setObligation(m.rid, "risk", e.target.value)
                                }
                              >
                                {obligationRiskOptions.map((o) => (
                                  <option key={o.value} value={o.value}>
                                    {o.label}
                                  </option>
                                ))}
                              </Select>
                              <Select
                                aria-label="觸發方式"
                                value={m.triggerType}
                                onChange={(e) =>
                                  setObligation(
                                    m.rid,
                                    "triggerType",
                                    e.target.value,
                                  )
                                }
                              >
                                {obligationTriggerOptions.map((o) => (
                                  <option key={o.value} value={o.value}>
                                    {o.label}
                                  </option>
                                ))}
                              </Select>
                              <Input
                                aria-label="期限"
                                type="date"
                                value={m.dueDate}
                                onChange={(e) =>
                                  setObligation(m.rid, "dueDate", e.target.value)
                                }
                              />
                              <div className="grid grid-cols-2 gap-1">
                                <Input
                                  aria-label="責任單位"
                                  placeholder="單位"
                                  value={m.ownerUnit}
                                  onChange={(e) =>
                                    setObligation(
                                      m.rid,
                                      "ownerUnit",
                                      e.target.value,
                                    )
                                  }
                                />
                                <Input
                                  aria-label="責任人"
                                  placeholder="責任人"
                                  value={m.ownerName}
                                  onChange={(e) =>
                                    setObligation(
                                      m.rid,
                                      "ownerName",
                                      e.target.value,
                                    )
                                  }
                                />
                              </div>
                              <Input
                                aria-label="權重"
                                type="number"
                                min={1}
                                value={m.weight}
                                onChange={(e) =>
                                  setObligation(m.rid, "weight", e.target.value)
                                }
                              />
                              <label className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                                <input
                                  type="checkbox"
                                  className="size-4 accent-[var(--primary)]"
                                  checked={m.commissioning}
                                  onChange={(e) =>
                                    setObligation(
                                      m.rid,
                                      "commissioning",
                                      e.target.checked,
                                    )
                                  }
                                />
                                <span className="sm:hidden">計入試運轉</span>
                              </label>
                              <button
                                type="button"
                                aria-label="刪除履約事項"
                                onClick={() => removeObligation(m.rid)}
                                className="flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                              >
                                <Trash2 className="size-4" />
                              </button>
                            </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </section>

                    {/* 工程分項 */}
                    <section className="space-y-2">
                      <div className="flex items-center justify-between">
                        <h3 className="flex items-center gap-2 text-sm font-semibold">
                          <Hammer className="size-4 text-primary" />
                          工程分項
                          <span className="text-xs font-normal text-muted-foreground">
                            （{namedWorkItems} 項）
                          </span>
                        </h3>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setWorkItems((p) => [...p, emptyWorkItem()])
                          }
                        >
                          <Plus className="size-4" />
                          新增工程分項
                        </Button>
                      </div>

                      {workItems.length === 0 ? (
                        <p className="rounded-md border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
                          尚無工程分項。可回上一步請精靈依工程類型建議範本，或手動新增。
                        </p>
                      ) : (
                        <div className="overflow-x-auto pb-1">
                          <div className="space-y-2 sm:min-w-[860px]">
                            <div className="hidden gap-2 whitespace-nowrap px-1 text-[11px] font-medium text-muted-foreground sm:grid sm:grid-cols-[84px_minmax(180px,1fr)_104px_150px_138px_138px_36px]">
                              <span>編號</span>
                              <span>名稱</span>
                              <span>類別</span>
                              <span>所屬履約事項</span>
                              <span>預定開始</span>
                              <span>預定完成</span>
                              <span />
                            </div>
                            {workItems.map((w) => (
                            <div
                              key={w.rid}
                              className="grid grid-cols-1 gap-2 rounded-md border p-2 sm:grid-cols-[84px_minmax(180px,1fr)_104px_150px_138px_138px_36px] sm:items-center sm:border-0 sm:p-0"
                            >
                              <Input
                                aria-label="工項編號"
                                placeholder="A-01"
                                value={w.code}
                                onChange={(e) =>
                                  setWorkItem(w.rid, "code", e.target.value)
                                }
                              />
                              <Input
                                aria-label="工程分項名稱"
                                placeholder="如 基礎開挖"
                                value={w.name}
                                onChange={(e) =>
                                  setWorkItem(w.rid, "name", e.target.value)
                                }
                              />
                              <Input
                                aria-label="類別"
                                placeholder="土方"
                                value={w.category}
                                onChange={(e) =>
                                  setWorkItem(w.rid, "category", e.target.value)
                                }
                              />
                              <Select
                                aria-label="所屬履約事項"
                                value={w.obligation}
                                onChange={(e) =>
                                  setWorkItem(
                                    w.rid,
                                    "obligation",
                                    e.target.value,
                                  )
                                }
                              >
                                <option value="">未指定</option>
                                {obligationTitles.map((n) => (
                                  <option key={n} value={n}>
                                    {n}
                                  </option>
                                ))}
                              </Select>
                              <Input
                                aria-label="預定開始"
                                type="date"
                                value={w.plannedStart}
                                onChange={(e) =>
                                  setWorkItem(
                                    w.rid,
                                    "plannedStart",
                                    e.target.value,
                                  )
                                }
                              />
                              <Input
                                aria-label="預定完成"
                                type="date"
                                value={w.plannedEnd}
                                onChange={(e) =>
                                  setWorkItem(
                                    w.rid,
                                    "plannedEnd",
                                    e.target.value,
                                  )
                                }
                              />
                              <button
                                type="button"
                                aria-label="刪除工程分項"
                                onClick={() =>
                                  setWorkItems((p) =>
                                    p.filter((x) => x.rid !== w.rid),
                                  )
                                }
                                className="flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                              >
                                <Trash2 className="size-4" />
                              </button>
                            </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </section>
                  </div>
                )}


                {error ? (
                  <div className="mx-4 mb-1 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {error}
                  </div>
                ) : null}

                {/*
                  Footer
                  不再放「AI 協助建置」按鈕：費思的狀態與入口統一在右下角的
                  狀態顯示，避免同一件事有兩個入口、兩種說法。
                */}
                <div className="flex items-center justify-between gap-2 border-t px-4 py-3">
                  <span className="text-xs text-muted-foreground">
                    {aiActive
                      ? "費思正在協助此專案，可於右下角查看狀態"
                      : "點右下角的費思即可開始 AI 協助建置"}
                  </span>

                  {step === 1 ? (
                    <div className="flex items-center gap-3">
                      <span className="hidden text-xs text-muted-foreground sm:inline">
                        {requiredReady
                          ? "必填欄位已備齊"
                          : "請至少提供專案編號與名稱"}
                      </span>
                      <Button
                        type="button"
                        onClick={() => setStep(2)}
                        disabled={!requiredReady}
                      >
                        下一步：履約事項與工程分項
                        <ArrowRight className="size-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setStep(1)}
                        disabled={creating}
                      >
                        <ArrowLeft className="size-4" />
                        返回基本資料
                      </Button>
                      <span className="hidden text-xs text-muted-foreground sm:inline">
                        將建立 {namedObligations} 項履約事項、{namedWorkItems} 項工程分項
                      </span>
                      <Button
                        type="button"
                        onClick={() => void create()}
                        disabled={!requiredReady || creating}
                      >
                        {creating ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Check className="size-4" />
                        )}
                        {creating ? "建立中…" : "確認並建立專案"}
                      </Button>
                    </div>
                  )}
                </div>
              </section>
      </div>
    </div>
  );
}
