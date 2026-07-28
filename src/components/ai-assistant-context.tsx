"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

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
 * 事件的去向。刻意區分「暫時的工作狀態」與「留在對話中的訊息」：
 *  - activity：顯示於工作指示區，隨下一則狀態覆蓋，結束後消失，不進對話紀錄
 *  - message：寫入對話，永久保留（如最後的執行結果總結）
 *  - ignore：不呈現（如純資料事件）
 */
export type AiEventOutcome =
  | { kind: "activity"; text: string }
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
  /** 收到成功回應時交還功能端，用於填入表單 */
  onResult: (data: AiTaskResponse) => void;
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

  const startTask = useCallback((next: AiTask) => {
    setTask(next);
    setExpanded(true);
  }, []);

  const endTask = useCallback(() => setTask(null), []);

  const value = useMemo(
    () => ({ expanded, setExpanded, task, startTask, endTask }),
    [expanded, task, startTask, endTask],
  );

  return (
    <AiAssistantContext.Provider value={value}>
      {children}
    </AiAssistantContext.Provider>
  );
}
