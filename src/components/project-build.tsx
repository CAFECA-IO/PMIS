"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  X,
  Check,
  AlertTriangle,
  ExternalLink,
  CircleDashed,
  Loader2,
  ArrowLeft,
  ArrowRight,
  Plus,
  Trash2,
  Flag,
  Sparkles,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  useAiAssistant,
  type AiEventOutcome,
} from "@/components/ai-assistant-context";
import { useFaithOffer } from "@/components/use-faith-offer";
import { WIZARD_DOC_ACCEPT } from "@/constant/ai";
import { projectStatusOptions, projectStatusMeta } from "@/constant/pmis";
import {
  obligationRiskOptions,
  obligationStageOptions,
} from "@/constant/obligation";
import type { ProjectStatus } from "@/generated/prisma/enums";
import type { WizardScopeItem } from "@/service/faith.service";
import {
  applyProgress,
  describeStep,
  initialProgress,
  isSettled,
  type StepProgress,
  type WizardStepId,
} from "@/service/wizard-steps";
import { summarizeRun } from "@/service/wizard-summary";
import {
  applyImport,
  buildReview,
  effectiveSelection,
  importSummary,
  type Proposal,
  type ProposedFields,
  type ProposedObligation,
  type ProposedScopeItem,
  type ReviewSection,
} from "@/service/wizard-review";
import {
  AnalysisOverlay,
  AnalysisReview,
} from "@/components/wizard-analysis";
import {
  createProjectViaWizard,
  lookupDuplicateProjects,
  type WizardProfile,
} from "@/app/projects/actions";
import {
  duplicateWarning,
  hasBlocking,
  type DuplicateMatch,
} from "@/service/project-duplicate";
import { useConfirm } from "@/components/ui/confirm-provider";
import { withProject } from "@/lib/project-link";
import { FormActionBar } from "@/components/ui/form-action-bar";
import { useNotification } from "@/components/ui/notification";

type Fields = WizardProfile;

// Info: 精靈草稿中的履約事項。以 rid 作為 React key，送出前剔除。
/*
  建置階段收「這件事叫什麼、出自契約哪一條、屬哪個階段、風險、期限、權重」。

  契約依據是刻意留下的 —— 它與事項本身出自同一次閱讀，
  此刻不記下來，日後要查證某項管制的來由就得重讀整份契約。

  不收的是觸發方式、責任單位／責任人與試運轉：它們各自需要另一份依據
  （工期表、組織分工、驗收條件），在還沒有專案的當下要求使用者決定只會逼他亂填，
  而亂填的值看起來與已確認的資料無法區分。這三者於履約事項細節頁設定，
  那裡有觸發方式的專用輸入。
*/
type ObligationRow = {
  rid: string;
  code: string;
  title: string;
  contractBasis: string;
  stage: string;
  risk: string;
  dueDate: string;
  weight: string;
};

const AI_TASK_ID = "project-wizard";

const AI_SUGGESTIONS = [
  "請依工程類型建議應納管的履約事項",
  "這是一件道路拓寬工程，工期兩年",
];

let ridSeq = 0;
const nextRid = () => `r${++ridSeq}`;

const emptyObligation = (): ObligationRow => ({
  rid: nextRid(),
  code: "",
  title: "",
  contractBasis: "",
  stage: "CONSTRUCTION",
  risk: "GREEN",
  dueDate: "",
  weight: "1",
});

// Info: 精靈需蒐集的欄位清單（總覽用），required 為建立專案必填。
const FIELD_DEFS: { key: keyof Fields; label: string; required?: boolean }[] = [
  { key: "code", label: "專案編號", required: true },
  { key: "name", label: "專案名稱", required: true },
  // 契約編號與專案編號分開：同一紙契約重複建案，靠它認得出來
  { key: "contractNo", label: "契約編號" },
  { key: "location", label: "工程地點" },
  { key: "client", label: "業主／主辦機關" },
  { key: "contractor", label: "承包商" },
  { key: "supervisor", label: "監造單位" },
  { key: "budget", label: "預算 (TWD)" },
  { key: "startDate", label: "開工日" },
  { key: "endDate", label: "完工日" },
  { key: "status", label: "狀態" },
  { key: "description", label: "工程摘要" },
  // 影響「如何施工」的契約條件。記錄下來，後續產生施工設計與 3D 數位孿生
  // 動畫時才有依據 —— 否則模型只能照工項名稱猜施工方式。
  { key: "keyRequirements", label: "關鍵要求重點" },
];

/**
 * 把費思提議的履約事項轉成草稿列。
 *
 * 未提供的欄位落回與手動新增相同的預設值，使用者看不出哪一列是模型帶進來的
 * —— 匯入之後它就是使用者自己的草稿，沒有理由再區分。
 */
function toObligationRow(o: ProposedObligation): ObligationRow {
  return {
    rid: nextRid(),
    code: o.code ?? "",
    title: o.title,
    contractBasis: o.contractBasis ?? "",
    stage: o.stage ?? "CONSTRUCTION",
    risk: o.risk ?? "GREEN",
    dueDate: o.dueDate ?? "",
    weight: o.weight != null ? String(o.weight) : "1",
  };
}

// Info: 送出／回填 AI 前，將列資料轉為不含 rid 的乾淨物件
function toObligationPayload(m: ObligationRow) {
  return {
    code: m.code.trim() || undefined,
    title: m.title.trim(),
    contractBasis: m.contractBasis.trim() || undefined,
    stage: m.stage || undefined,
    risk: m.risk || undefined,
    dueDate: m.dueDate || undefined,
    weight: m.weight ? Number(m.weight) : undefined,
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
  const { task, startTask, endTask } = useAiAssistant();
  const { notify } = useNotification();
  const confirm = useConfirm();
  const [step, setStep] = useState<1 | 2>(1);
  const [fields, setFields] = useState<Fields>({});
  const [obligations, setObligations] = useState<ObligationRow[]>([]);
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
  const fieldsRef = useRef<Fields>({});


  /*
    費思的提議。刻意與表單分開存放 ——
    解析途中直接寫進欄位，使用者就分不清哪個值是自己填的、哪個是模型填的，
    也無從拒絕讀錯的項目。故先收在這裡，解析結束後由檢視清單勾選匯入。
  */
  const proposalRef = useRef<Proposal>({});
  const [proposal, setProposal] = useState<Proposal>({});
  /** 檢視清單是否開著；捨棄或匯入後關閉。 */
  const [reviewing, setReviewing] = useState(false);
  /** 使用者動過勾選的段落（其餘段落一律預設全選）。 */
  const [touched, setTouched] = useState<Set<WizardStepId>>(new Set());
  const [picked, setPicked] = useState<Set<string>>(new Set());
  /** 正在重新解析的段落。單段重試時不蓋整張表單，只在該段轉圈。 */
  const [busyStep, setBusyStep] = useState<WizardStepId | null>(null);
  /*
    可能重複的既有專案。
    專案編號有 unique 約束，所以真正會漏掉的是「換了編號又建一次同一件工程」——
    那種重複沒有任何資料庫約束擋得住，事後也無法合併，只能在建立前問。
  */
  const [duplicates, setDuplicates] = useState<DuplicateMatch[]>([]);
  const [checkingDup, setCheckingDup] = useState(false);
  /*
    各段的附註。ref 供串流閉包在總結時取用；另存一份 state 供檢視清單顯示
    —— render 期間讀 ref 為 React 所禁（讀到舊值也不會重繪）。
  */
  const [notes, setNotes] = useState<Partial<Record<WizardStepId, string>>>({});

  /**
   * 向伺服器查詢可能重複的專案。
   *
   * 比對必須在伺服器端做 —— 重複的另一半在資料庫裡，前端只有自己畫面上的資料。
   * 查詢失敗時靜默略過：這是提醒而非把關，真正的把關在建立時由伺服器重查。
   */
  async function refreshDuplicates(next: Fields) {
    const code = (next.code ?? "").trim();
    const name = (next.name ?? "").trim();
    if (!code && !name) {
      setDuplicates([]);
      return;
    }
    setCheckingDup(true);
    try {
      const found = await lookupDuplicateProjects({
        code,
        name,
        contractNo: (next.contractNo ?? "").trim(),
        client: (next.client ?? "").trim(),
        startDate: (next.startDate ?? "").trim(),
        endDate: (next.endDate ?? "").trim(),
        fileNames: fileNameRef.current ? [fileNameRef.current] : [],
      });
      setDuplicates(found);
    } catch {
      setDuplicates([]);
    } finally {
      setCheckingDup(false);
    }
  }

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
    setCreating(false);
    setError(null);
    setProgress(initialProgress());
    progressRef.current = initialProgress();
    notesRef.current = {};
    setNotes({});
    fileNameRef.current = null;
    onlyRef.current = undefined;
    uploadIdsRef.current = [];
    scopeRef.current = [];
    proposalRef.current = {};
    setProposal({});
    setReviewing(false);
    setTouched(new Set());
    setPicked(new Set());
    setBusyStep(null);
    setDuplicates([]);
    setCheckingDup(false);
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
   * 採分段串流：後端把四段解析逐段回報。
   * 本元件只「收集」提議，不寫進表單 —— 解析中直接改動使用者眼前的欄位，
   * 使用者無從分辨哪個值是自己填的，也無從拒絕讀錯的項目。
   * 全部跑完後由 AnalysisReview 讓使用者勾選要匯入哪些。
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
    if (!retrying) {
      notesRef.current = {};
      setNotes({});
    }
    /*
      單段重試沿用已開著的檢視清單（只在該段轉圈）；
      整份重跑則收起清單，改由覆蓋層顯示進度。
    */
    setBusyStep(retrying && only!.length === 1 ? only![0]! : null);
    if (retrying) {
      /*
        重新解析的段落自「使用者動過」名單移除，其新內容會回到預設全選。
        沿用舊的勾選集合會讓重新解析的結果一項都沒被勾 ——
        而按下「重新解析此段」的人正是想要那些新結果。
      */
      setTouched((prev) => {
        const next = new Set(prev);
        for (const id of only!) next.delete(id);
        return next;
      });
    } else {
      setReviewing(false);
      proposalRef.current = {};
      setProposal({});
      setTouched(new Set());
      setPicked(new Set());
    }

    startTask({
      id: AI_TASK_ID,
      title: "專案建置",
      greeting:
        "好的，我來協助您建立新專案。您可以：\n\n- 上傳**契約書／決標公告／工期表／預算書**（支援 PDF、Word、Excel、PowerPoint、圖片）\n- 或直接用文字告訴我專案資訊\n\n我會分四段解析：**專案基本資料** → **契約履約標的** → **履約事項** → **責任分工與契約依據**。\n\n每一段只做一件事：先**照抄**契約的履約標的，再由標的**推導**應辦事項與期限，最後回填責任分工與契約依據。上游沒有結果時下游會直接略過，不會憑常識自行編造。\n\n解析完成後會列出各段結果，**由您勾選要匯入哪些**，我不會直接改動您的表單。工程分項於專案建立後在專案頁或估驗台帳維護（那裡才有數量與單價欄位）。",
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
          // 單獨重試「履約事項」時履約標的那段不會重跑，需回傳同一份清單，
          // 否則該段會因「沒有標的」而被略過
          scopeItems: scopeRef.current,
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
        setNotes({ ...notesRef.current });
      }
      return { kind: "activity", text: describeStep(p) };
    }

    if (event.type === "data") {
      /*
        只收集，不寫入表單。
        提議累積在 proposalRef，解析結束後才由檢視清單交給使用者勾選。
      */
      if (Array.isArray(event.scopeItems)) {
        scopeRef.current = event.scopeItems as WizardScopeItem[];
        proposalRef.current.scopeItems = event.scopeItems as ProposedScopeItem[];
      }
      if (event.fields && typeof event.fields === "object") {
        proposalRef.current.fields = {
          ...proposalRef.current.fields,
          ...(event.fields as ProposedFields),
        };
      }
      if (Array.isArray(event.obligations)) {
        // 責任分工那段回傳的是「補齊後的整份清單」，直接取代即可
        proposalRef.current.obligations = event.obligations as ProposedObligation[];
      }
      setProposal({ ...proposalRef.current });
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
      /*
        解析結束才把結果攤開讓使用者處理。
        重試的那一段回來後仍留在同一份清單裡，不必從頭再看一次。
      */
      setBusyStep(null);
      setReviewing(true);
      return text ? { kind: "message", text } : { kind: "ignore" };
    }

    if (event.type === "error") {
      return { kind: "message", text: `解析中斷：${String(event.error ?? "原因不明")}` };
    }

    return { kind: "ignore" };
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

  function removeObligation(rid: string) {
    setObligations((prev) => prev.filter((m) => m.rid !== rid));
  }

  const namedObligations = obligations.filter((m) => m.title.trim()).length;
  /*
    缺契約依據的項數。不阻擋建立 —— 使用者可能就是要先建骨架；
    但要說出來，否則這些事項日後沒有人查得出它為什麼被列管。
  */
  const missingBasis = obligations.filter(
    (m) => m.title.trim() && !m.contractBasis.trim(),
  ).length;

  /*
    檢視清單。純函式算出來，故「哪些會覆蓋既有值」「哪一段值得重試」
    這些判斷有測試釘住，而不是散在畫面裡。
  */
  const sections = useMemo<ReviewSection[]>(
    () =>
      buildReview({
        progress,
        proposal,
        current: {
          fields: fields as ProposedFields,
          obligationTitles: obligations.map((m) => m.title),
        },
        notes,
        fieldLabels: FIELD_DEFS,
      }),
    [progress, proposal, fields, obligations, notes],
  );
  const selected = useMemo(
    () => effectiveSelection(sections, touched, picked),
    [sections, touched, picked],
  );

  /** 解析中：整份重跑時蓋住表單；單段重試只在清單內轉圈。 */
  const analysing =
    progress.some((p) => p.state !== "pending") &&
    !isSettled(progress) &&
    busyStep == null;
  const showReview = reviewing && sections.length > 0;

  /** 依勾選把提議寫進表單。這是模型的結果進到表單的唯一路徑。 */
  function importSelected() {
    const result = applyImport({
      sections,
      selected,
      proposal,
      current: {
        fields: fields as ProposedFields,
        obligationTitles: obligations.map((m) => m.title),
      },
    });

    const merged: Fields = { ...fieldsRef.current, ...(result.fields as Fields) };
    commitFields(merged);
    /*
      匯入完立刻查一次重複。
      在使用者開始逐項核對履約事項之前就告訴他「這件可能已經建過了」——
      等他核對完 28 項才被擋下，那些工都白做了。
    */
    void refreshDuplicates(merged);

    setObligations((prev) => {
      // 同名事項補欄位而非再新增一列；且只補空的，不動使用者填過的
      const patched = prev.map((m) => {
        const patch = result.patches.find((x) => x.title === m.title.trim());
        if (!patch) return m;
        return {
          ...m,
          code: m.code || patch.code || "",
          contractBasis: m.contractBasis || patch.contractBasis || "",
          stage: m.stage || patch.stage || "CONSTRUCTION",
          dueDate: m.dueDate || patch.dueDate || "",
        };
      });
      return [...patched, ...result.newObligations.map(toObligationRow)];
    });

    // 匯入的履約標的隨專案一起建立，供日後溯源到契約條次
    scopeRef.current = result.scopeItems as WizardScopeItem[];

    setReviewing(false);
    notify({ title: "已匯入解析結果", description: importSummary(result) });
  }

  function discardReview() {
    setReviewing(false);
    proposalRef.current = {};
    setProposal({});
    setTouched(new Set());
    setPicked(new Set());
  }

  /**
   * 確認「即使可能重複也要建立」。
   *
   * 只在有非阻擋的重複時才問。編號撞號不問 —— 那是資料庫的 unique 約束，
   * 問了也建不出來，問等於給一個假的選擇。
   */
  async function confirmDuplicate(matches: DuplicateMatch[]) {
    return confirm({
      title: "可能是重複的專案",
      danger: true,
      confirmLabel: "仍要建立",
      cancelLabel: "返回修改",
      description: (
        <div className="space-y-2">
          <p>{duplicateWarning(matches)}</p>
          <ul className="space-y-1.5">
            {matches.map((m) => (
              <li key={m.project.id} className="rounded-md border px-2.5 py-1.5">
                <span className="block text-xs font-medium text-foreground">
                  {m.project.name}
                </span>
                <span className="block text-[11px]">
                  {m.project.code}
                  {"　"}
                  {m.reasons
                    .map((r) => (r.detail ? `${r.label}（${r.detail}）` : r.label))
                    .join("、")}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ),
    });
  }

  /**
   * 建立專案。
   *
   * @param allowDuplicate 使用者已同意「即使可能重複也要建立」。
   *   遞迴只會發生一次：伺服器查到前端還不知道的重複時，問過後以 true 重送，
   *   而 true 的那一輪不會再問。
   */
  async function create(allowDuplicate = false) {
    if (!requiredReady || creating) return;

    /*
      先問過再送。
      伺服器仍會重查（前端可被跳過，兩次檢查之間也可能有人剛建了同名專案），
      這裡問是為了讓使用者在同一個畫面上看到重複是哪些、並保有「就是要建」的選擇。
    */
    if (!allowDuplicate && duplicates.length > 0 && !hasBlocking(duplicates)) {
      if (!(await confirmDuplicate(duplicates))) return;
      allowDuplicate = true;
    }

    setCreating(true);
    setError(null);
    try {
      const result = await createProjectViaWizard(
        fields,
        obligations.filter((m) => m.title.trim()).map(toObligationPayload),
        /*
          建置階段不處理工程分項：分項要有數量、單價與預定起訖才有意義，
          那些資料來自預算書與施工排程，不在簽約當下的契約裡。
          專案建立後於專案頁與估驗台帳維護（或由「3D 工程視覺」定案加入）。
        */
        [],
        uploadIdsRef.current,
        scopeRef.current,
        allowDuplicate,
        fileNameRef.current ? [fileNameRef.current] : [],
      );
      if (!result.ok) {
        /*
          伺服器查到的重複，前端可能還沒查過（使用者直接按建立，
          或這段時間內有人剛建了同名專案）。把結果收下並就地問一次，
          同意就立刻重送 —— 否則使用者會看到一句「請確認後再建立」，
          卻沒有任何可以確認的地方。
        */
        if (result.duplicates?.length) {
          setDuplicates(result.duplicates);
          if (!hasBlocking(result.duplicates) && !allowDuplicate) {
            setCreating(false);
            if (await confirmDuplicate(result.duplicates)) await create(true);
            return;
          }
        }
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
      router.push(withProject(`/projects/${id}?created=1`, id));
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "建立專案失敗。");
    } finally {
      setCreating(false);
    }
  }

  /*
    邀請與右下角入口交由共用 hook：註冊入口、每次進入本頁邀請一次、
    離開後重置（放棄建置再回來會重新提議）、被接手後撤回通知。
  */
  useFaithOffer({
    taskId: AI_TASK_ID,
    title: "專案建置",
    active: true,
    accepted: aiActive,
    start: askFase,
    invitation: {
      title: "需要費思協助建立此專案嗎？",
      description: "上傳契約書或決標公告，我會分階段判讀並填入左側表單。",
    },
  });



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
            {step === 1 ? "專案基本資料" : "履約事項"}
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

                  {/*
                    履約事項蒐集狀況。
                    解析進度不再列在這裡 —— 進行中的事情放在畫面角落，
                    使用者得一邊填表一邊分神看它；改為在解析期間直接蓋住表單。
                  */}
                  <div className="mt-2 flex items-center gap-2 rounded-md border-t px-2 pb-1.5 pt-3">
                    {namedObligations > 0 ? (
                      <Check className="size-3.5 shrink-0 text-success" />
                    ) : (
                      <CircleDashed className="size-3.5 shrink-0 text-muted-foreground/50" />
                    )}
                    <Flag className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="text-xs font-medium">履約事項</span>
                    <span
                      className={cn(
                        "ml-auto text-xs tabular-nums",
                        namedObligations > 0
                          ? "text-foreground/80"
                          : "text-muted-foreground/60",
                      )}
                    >
                      {namedObligations > 0 ? `${namedObligations} 項` : "待補"}
                    </span>
                  </div>
                </div>
              </aside>

              {/* 右：Step 1 基本資料 / Step 2 履約事項 */}
              {/*
                relative：解析中的進度層與解析後的檢視清單都蓋在這一欄之上，
                而非蓋住整個視窗 —— 左側清單與右下角的費思仍要看得見、點得到。
              */}
              <section className="relative flex min-h-0 flex-col">
                {aiActive ? (
                  <div className="animate-bubble-in mx-4 mt-4 flex items-start gap-2 rounded-lg border border-primary/40 bg-primary/5 p-3 text-sm">
                    <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
                    <div>
                      <span className="font-medium text-primary">
                        費思正在協助建立此專案
                      </span>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        請在右下角的費思對話框上傳文件或描述專案。解析完成後會列出結果，由您勾選要匯入哪些。
                      </p>
                    </div>
                  </div>
                ) : null}

                {/*
                  可能重複的既有專案。
                  放在表單上方而非只在送出時彈窗 —— 使用者需要能先點進去看看
                  那個專案是不是真的同一件，再決定要不要繼續。
                */}
                {duplicates.length > 0 ? (
                  <div
                    className={cn(
                      "mx-4 mt-4 rounded-lg border p-3",
                      hasBlocking(duplicates)
                        ? "border-destructive/40 bg-destructive/10"
                        : "border-warning/50 bg-warning-soft",
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <AlertTriangle
                        className={cn(
                          "mt-0.5 size-4 shrink-0",
                          hasBlocking(duplicates)
                            ? "text-destructive"
                            : "text-warning",
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">
                          {hasBlocking(duplicates)
                            ? "專案編號已被使用"
                            : "系統中可能已有這個專案"}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {duplicateWarning(duplicates)}
                        </p>
                        <ul className="mt-2 space-y-1.5">
                          {duplicates.map((m) => (
                            <li key={m.project.id}>
                              <a
                                href={withProject(
                                  `/projects/${m.project.id}`,
                                  m.project.id,
                                )}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-start gap-1.5 text-xs hover:underline"
                              >
                                <ExternalLink className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                                <span className="min-w-0">
                                  <span className="font-medium">
                                    {m.project.name}
                                  </span>
                                  <span className="text-muted-foreground">
                                    {"　"}
                                    {m.project.code}
                                  </span>
                                  <span className="block text-[11px] text-muted-foreground">
                                    {m.reasons
                                      .map((r) =>
                                        r.detail
                                          ? `${r.label}（${r.detail}）`
                                          : r.label,
                                      )
                                      .join("、")}
                                  </span>
                                </span>
                              </a>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                ) : null}

                {step === 1 ? (
                  <div className="min-h-0 flex-1 overflow-y-auto p-4">
                    <p className="mb-3 text-sm text-muted-foreground">
                      請專案經理人核對專案基本資料，可直接修改。
                    </p>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {FIELD_DEFS.filter(
                        (f) =>
                          f.key !== "status" &&
                          f.key !== "description" &&
                          f.key !== "keyRequirements",
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
                      <div className="space-y-1.5 sm:col-span-2">
                        <Label htmlFor="w-keyRequirements">關鍵要求重點</Label>
                        <Textarea
                          id="w-keyRequirements"
                          rows={4}
                          placeholder="影響施工方式的契約／規範條件，一行一項，例如：&#10;・汛期（5–11 月）不得於河道內施工&#10;・護岸自下游往上游分兩段施工&#10;・鄰接民宅側須設置擋土支撐與沉陷監測"
                          value={String(fields.keyRequirements ?? "")}
                          onChange={(e) =>
                            setField("keyRequirements", e.target.value)
                          }
                        />
                        <p className="text-xs text-muted-foreground">
                          這些條件會作為產生施工設計與 3D 數位孿生動畫的依據。
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-4">
                    <p className="text-sm text-muted-foreground">
                      請核對履約事項，可新增、刪除或修改。留空名稱的列不會建立。工程分項於專案建立後維護。
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
                          {/*
                            min-w 必須等於各欄寬度加間距的總和：
                            固定欄 132+124+104+148+68+36＝612，7 個 8px 間距＝56，
                            兩個彈性欄的最小值 200（事項）＋150（契約依據）＝350。
                            少算會把最後一欄擠出容器 —— 這是先前實際發生過的版面異常。
                          */}
                          <div className="space-y-2 sm:min-w-[1018px]">
                            <div className={cn(
                              "hidden gap-2 whitespace-nowrap px-1 text-[11px] font-medium text-muted-foreground sm:grid",
                              "sm:grid-cols-[132px_minmax(200px,1.4fr)_minmax(150px,1fr)_124px_104px_148px_68px_36px]",
                            )}>
                              <span>管制編號</span>
                              <span>履約事項</span>
                              <span>契約依據</span>
                              <span>階段</span>
                              <span>風險</span>
                              <span>期限</span>
                              <span>權重</span>
                              <span />
                            </div>
                            {obligations.map((m) => (
                            <div
                              key={m.rid}
                              className={cn(
                                "grid grid-cols-1 gap-2 rounded-md border p-2 sm:items-center sm:border-0 sm:p-0",
                                "sm:grid-cols-[132px_minmax(200px,1.4fr)_minmax(150px,1fr)_124px_104px_148px_68px_36px]",
                              )}
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
                                  setObligation(m.rid, "title", e.target.value)
                                }
                              />
                              <Input
                                aria-label="契約依據"
                                placeholder="如 契約第五條第二款"
                                value={m.contractBasis}
                                onChange={(e) =>
                                  setObligation(
                                    m.rid,
                                    "contractBasis",
                                    e.target.value,
                                  )
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
                              <Input
                                aria-label="期限"
                                type="date"
                                value={m.dueDate}
                                onChange={(e) =>
                                  setObligation(m.rid, "dueDate", e.target.value)
                                }
                              />
                              <Input
                                aria-label="權重"
                                type="number"
                                min={1}
                                value={m.weight}
                                onChange={(e) =>
                                  setObligation(m.rid, "weight", e.target.value)
                                }
                              />
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
                  </div>
                )}


                {/*
                  解析中蓋住表單。這時去改欄位，稍後匯入會與模型的提議衝突，
                  而使用者不會記得自己改了什麼。
                */}
                {analysing ? <AnalysisOverlay progress={progress} /> : null}

                {/*
                  解析完成：結果不進表單，先攤在這裡讓使用者勾選。
                  蓋在表單之上而非塞進表單裡 —— 兩份「基本資料」並排會分不清
                  哪一份才是即將建立的內容。
                */}
                {showReview ? (
                  <div className="absolute inset-0 z-20 flex flex-col bg-background">
                    <AnalysisReview
                      sections={sections}
                      selected={selected}
                      onSelectedChange={(next, section) => {
                        setPicked(next);
                        setTouched((prev) => new Set(prev).add(section.id));
                      }}
                      onRetry={(id) => askFase([id])}
                      onImport={importSelected}
                      onDiscard={discardReview}
                      busyStep={busyStep}
                    />
                  </div>
                ) : null}

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
                <FormActionBar
                  hint={
                    <>
                      <span className="block">
                        {aiActive
                          ? "費思正在協助此專案，可於右下角查看狀態"
                          : "點右下角的費思即可開始 AI 協助建置"}
                      </span>
                      {/*
                        送出前的確認資訊放在左側提示區，不再插在兩顆按鈕之間 ——
                        夾在按鈕中央會把「返回」與「建立」推開，讀起來也像按鈕的一部分。
                      */}
                      {checkingDup ? (
                        <span className="block">正在比對是否已有相同專案…</span>
                      ) : null}
                      <span className="block">
                        {step === 1
                          ? requiredReady
                            ? "必填欄位已備齊"
                            : "請至少提供專案編號與名稱"
                          : missingBasis > 0
                            ? `將建立 ${namedObligations} 項履約事項，其中 ${missingBasis} 項未填契約依據`
                            : `將建立 ${namedObligations} 項履約事項`}
                      </span>
                    </>
                  }
                >
                  {step === 1 ? (
                    <Button
                      type="button"
                      onClick={() => {
                        setStep(2);
                        // 使用者可能手改了編號或名稱，離開這一步時重查
                        void refreshDuplicates(fieldsRef.current);
                      }}
                      disabled={!requiredReady}
                    >
                      下一步：履約事項
                      <ArrowRight className="size-4" />
                    </Button>
                  ) : (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setStep(1)}
                        disabled={creating}
                      >
                        <ArrowLeft className="size-4" />
                        返回基本資料
                      </Button>
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
                    </>
                  )}
                </FormActionBar>
              </section>
      </div>
    </div>
  );
}
