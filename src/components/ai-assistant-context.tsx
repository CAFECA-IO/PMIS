"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { shouldAutoAssist } from "@/service/faith-status";

/**
 * Info: (20260721 - Luphia)
 * 浮動 AI 助理（費思）的開合狀態共享，讓其他 UI（如通知氣泡）可依助理卡是否展開而調整。
 *
 * Info: 另提供「AI 任務」機制——各功能模組（專案建置、預警規則…）不再自建對話框，
 * 一律呼叫 startTask() 把任務交給費思執行，費思取得結構化結果後再回呼給功能端填入表單。
 */

export type AiChatMessage = { role: "user" | "assistant"; text: string };
export type AiAttachment = { mimeType: string; data: string; name: string };

export type AiTaskRequest = {
  messages: AiChatMessage[];
  attachment?: AiAttachment;
};

/** 串流事件：型別由各任務自行判讀，此處僅約定必有 type。 */
export type AiStreamEvent = { type: string } & Record<string, unknown>;

/**
/**
 * 通用「多步驟進度」的單一步驟。
 *
 * 任何串流任務都可把耗時工作拆成數個小步驟，於對話中以進度卡呈現：
 * 目前進行到哪一步、各步驟花了多久。狀態機刻意極簡（active／done），
 * pending 由呈現端依既有清單推得，任務只需回報「開始／完成」。
 */
export type FaithStep = {
  /** 穩定鍵，用於對應同一步驟的 start/done。 */
  key: string;
  /** 顯示名稱，如「規劃工程分項」。 */
  label: string;
  status: "active" | "done";
  /** 開始時間（ms）；供呈現端計算進行中步驟的即時耗時。 */
  startedAt?: number;
  /** 完成耗時（ms）；done 時填入。 */
  elapsedMs?: number;
  /** 補充說明，如完成數量。 */
  detail?: string;
};

/**
 * 事件的去向。刻意區分「暫時的工作狀態」與「留在對話中的訊息」：
 *  - activity：顯示於工作指示區，隨下一則狀態覆蓋，結束後消失，不進對話紀錄
 *  - steps：以「多步驟進度卡」呈現（通用元件）；每次回報整份最新快照，結束後消失
 *  - message：寫入對話，永久保留（如最後的執行結果總結）
 *  - ignore：不呈現（如純資料事件）
 */
export type AiEventOutcome =
  | { kind: "activity"; text: string }
  | { kind: "steps"; steps: FaithStep[] }
  | { kind: "message"; text: string }
  | { kind: "ignore" };

/** 任務回應：reply 顯示於對話中，其餘欄位由 onResult 交還功能端。 */
export type AiTaskResponse = { reply?: string; error?: string } & Record<
  string,
  unknown
>;

export type AiTask = {
  /** 任務識別，用於避免重複啟動 */
  id: string;
  /** 顯示於費思標題列，如「專案建置」 */
  title: string;
  /** 進入任務時的開場白（Markdown） */
  greeting: string;
  /** 任務專用 API 路徑 */
  endpoint: string;
  /** 組出送往 endpoint 的 body，可帶入目前草稿作為上下文 */
  /**
   * 組出任務 API 的請求主體。回傳物件型別（而非 unknown），
   * 讓面板能再併入通用欄位（如目前鎖定的 projectId）。
   */
  buildBody: (req: AiTaskRequest) => Record<string, unknown>;
  /**
   * 收到成功回應時交還功能端，用於填入表單。
   *
   * 可回傳字串以取代顯示於對話中的 reply：功能端才知道實際填了哪些欄位、
   * 哪些因已填而保留，這份說明比模型自己的 reply 精確得多。
   */
  onResult: (data: AiTaskResponse) => void | string;
  /**
   * 以 NDJSON 串流回應（每行一個事件）。
   * 用於分段解析這類耗時工作，讓費思能邊做邊回報，
   * 而非等到全部結束才一次交付。
   */
  stream?: boolean;
  /**
   * 串流模式下每收到一個事件即呼叫，由任務決定該事件的去向。
   * 進度類事件應回 activity（不留存），最終結果回 message（留在對話）。
   */
  onEvent?: (event: AiStreamEvent) => AiEventOutcome;
  /** 可上傳的檔案格式（<input accept>），未指定則不顯示上傳 */
  accept?: string;
  /** 快速提示詞 */
  suggestions?: string[];
};

type Ctx = {
  expanded: boolean;
  setExpanded: (v: boolean) => void;
  /** 目前進行中的 AI 任務，null 代表一般問答模式 */
  task: AiTask | null;
  /** 啟動任務並自動展開費思 */
  startTask: (task: AiTask) => void;
  /** 結束任務，回到一般問答 */
  endTask: () => void;
  /**
   * 費思是否正在處理。
   *
   * 放在 context 而非面板內部，是為了讓交出表單的功能端也能反應：
   * 判讀期間表單應淡化並停止輸入，避免使用者與 AI 同時寫入同一欄位。
   */
  working: boolean;
  setWorking: (v: boolean) => void;
  /**
   * 目前畫面上的建置表單提供的協助入口。
   *
   * 讓右下角的費思在建置畫面上「點下去就等於啟動 AI 協助」，
   * 而不是開啟一個與眼前表單無關的一般問答。
   */
  offer: AiAssistOffer | null;
  /** 註冊協助入口，回傳解除註冊的函式（供元件卸載時呼叫）。 */
  registerOffer: (offer: AiAssistOffer) => () => void;
};

/** 建置表單交給費思的協助入口。 */
export type AiAssistOffer = {
  /** 對應的任務 id，用於判斷是否已在進行中。 */
  taskId: string;
  /** 表單標題，顯示於右下角。 */
  title: string;
  /** 啟動協助。 */
  start: () => void;
};

const AiAssistantContext = createContext<Ctx | null>(null);

export function useAiAssistant() {
  const ctx = useContext(AiAssistantContext);
  if (!ctx) {
    throw new Error("useAiAssistant 必須在 AiAssistantProvider 內使用");
  }
  return ctx;
}

export function AiAssistantProvider({ children }: { children: ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  const [task, setTask] = useState<AiTask | null>(null);
  const [working, setWorking] = useState(false);
  const [offer, setOffer] = useState<AiAssistOffer | null>(null);

  /*
    以 ref 讀取當下狀態，讓 registerOffer 的識別保持穩定 ——
    否則它每次改變都會使各表單的註冊 effect 重跑。
  */
  const expandedRef = useRef(expanded);
  const taskRef = useRef<AiTask | null>(task);
  const workingRef = useRef(working);
  useEffect(() => {
    expandedRef.current = expanded;
  }, [expanded]);
  useEffect(() => {
    taskRef.current = task;
  }, [task]);
  useEffect(() => {
    workingRef.current = working;
  }, [working]);

  /*
    後註冊者覆蓋先前者：同一時間畫面上通常只有一張建置表單，
    解除時只清掉自己註冊的那一份，避免後開的表單被先關的表單清掉。
  */
  const registerOffer = useCallback((next: AiAssistOffer) => {
    setOffer(next);

    // 費思已開啟＝使用者已表態要 AI 參與，此時直接接手（判準見 shouldAutoAssist）
    if (
      shouldAutoAssist({
        expanded: expandedRef.current,
        hasTask: taskRef.current != null,
        working: workingRef.current,
      })
    ) {
      next.start();
    }

    return () => {
      setOffer((current) => (current?.taskId === next.taskId ? null : current));
    };
  }, []);

  const startTask = useCallback((next: AiTask) => {
    setTask(next);
    setExpanded(true);
  }, []);

  const endTask = useCallback(() => {
    setTask(null);
    // 結束任務時一併解除工作中狀態，否則交出表單的一方會永遠停在鎖定
    setWorking(false);
  }, []);

  const value = useMemo(
    () => ({
      expanded,
      setExpanded,
      task,
      startTask,
      endTask,
      working,
      setWorking,
      offer,
      registerOffer,
    }),
    [expanded, task, startTask, endTask, working, offer, registerOffer],
  );

  return (
    <AiAssistantContext.Provider value={value}>
      {children}
    </AiAssistantContext.Provider>
  );
}
