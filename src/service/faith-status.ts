/**
 * 右下角費思狀態的文案（純函式，無 I/O，便於單元測試）。
 *
 * 為何需要這個狀態顯示 ——
 * 費思收合時原本只是一顆機器人圖示，看不出它在做什麼。
 * 各功能頁因此各自放一顆「AI 協助…」按鈕來表達「有沒有在協助」，
 * 造成同一件事有兩個入口、兩種說法，且按鈕散落各頁難以一致。
 * 改由單一的狀態顯示負責：它同時是入口、也是唯一的狀態來源。
 */

export type FaithState = "idle" | "offer" | "task" | "working";

export type FaithStatusInput = {
  /** 目前進行中的任務標題；null 為一般問答模式。 */
  taskTitle: string | null;
  /** 費思是否正在處理。 */
  working: boolean;
  /** 工作指示（如「正在解析履約事項…」）。 */
  activity: string | null;
  /**
   * 目前畫面上的建置表單所提供的協助標題；null 表示沒有可接手的表單。
   *
   * 有 offer 時右下角不只是入口，點下去等同啟動該表單的 AI 協助，
   * 因此要展開並說出可以幫什麼 —— 否則使用者不會知道按了會發生什麼事。
   */
  offerTitle?: string | null;
};

export type FaithStatus = {
  state: FaithState;
  /** 主要文字。 */
  label: string;
  /** 次要說明；idle 時為 null（收合成圓鈕，不需贅述）。 */
  detail: string | null;
  /** 無障礙標籤。 */
  ariaLabel: string;
};

/** 狀態顯示上的文字長度上限，避免長任務名稱把版面撐開。 */
export const MAX_STATUS_CHARS = 18;

function clamp(text: string): string {
  const t = text.trim();
  return t.length <= MAX_STATUS_CHARS ? t : `${t.slice(0, MAX_STATUS_CHARS)}…`;
}

/**
 * 由費思目前的狀況推出顯示內容。
 *
 * 三種狀態刻意分明：
 *  - working：正在處理，必須看得出「還在動」，否則使用者會以為當掉。
 *  - task：已接手某項任務但在等使用者輸入，要說出接手的是哪一項。
 *  - idle：一般問答，收合為圓鈕即可。
 */
export function faithStatus(input: FaithStatusInput): FaithStatus {
  const title = input.taskTitle?.trim() ?? "";

  if (input.working) {
    const detail = input.activity?.trim() || "正在處理…";
    return {
      state: "working",
      label: title ? clamp(title) : "費思工作中",
      detail: clamp(detail),
      ariaLabel: `費思工作中：${detail}${title ? `（${title}）` : ""}`,
    };
  }

  if (title) {
    return {
      state: "task",
      label: clamp(title),
      detail: "等待您的文件或說明",
      ariaLabel: `費思正在協助「${title}」，點擊開啟對話`,
    };
  }

  const offer = input.offerTitle?.trim() ?? "";
  if (offer) {
    return {
      state: "offer",
      label: "費思可協助",
      detail: clamp(`填寫「${offer}」`),
      ariaLabel: `點擊讓費思協助填寫「${offer}」`,
    };
  }

  return {
    state: "idle",
    label: "費思",
    detail: null,
    ariaLabel: "開啟費思 AI 助理",
  };
}

/**
 * 狀態顯示是否需要展開為長條。
 *
 * 只有 task 與 working 展開 —— 那兩者是「費思正在做什麼」，是真的狀態，
 * 值得占位置。offer 維持圓鈕：同一時間已有一則彈出通知在說「需要協助嗎」
 * 並附上接受按鈕，把按鈕也展開成膠囊等於同一件事說兩次，
 * 而那個膠囊寬約 320px，正好蓋住頁面右下角的主要動作。
 */
export function isExpandedStatus(state: FaithState): boolean {
  return state === "task" || state === "working";
}

/** 判斷是否要在建置畫面出現時直接接手的輸入。 */
export type AutoAssistInput = {
  /** 費思面板是否已展開。 */
  expanded: boolean;
  /** 目前是否已有任務在進行。 */
  hasTask: boolean;
  /** 費思是否正在處理中。 */
  working: boolean;
};

/**
 * 進入建置畫面時是否直接接手（而非只顯示邀請）。
 *
 * 判準是「使用者是否已表態要 AI 參與」：
 * 費思開著就是已表態，此時還要他再點一次才開始協助是多餘的一步；
 * 費思收合著則不擅自接手 —— 突然彈出並清空對話會打斷他。
 *
 * 兩個例外不接手：
 *  - 已有任務在進行：不搶走使用者正在做的事。
 *  - 正在處理中：中途換任務會讓進行中的解析結果無處可去。
 */
export function shouldAutoAssist(input: AutoAssistInput): boolean {
  if (!input.expanded) return false;
  if (input.hasTask) return false;
  if (input.working) return false;
  return true;
}
