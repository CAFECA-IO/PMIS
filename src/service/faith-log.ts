/**
 * 費思互動紀錄的資料塑形（純函式，無 I/O，便於單元測試）。
 *
 * 目的是「可追蹤、可除錯」：每一次與模型的往返、以及使用者對回答的評價，
 * 都以一行 JSON 落地到專屬資料夾。寫檔本身在 faithLog.service。
 *
 * 兩個必須在此處理的現實問題：
 *  1. 提示詞可能極長（一份契約全文近 6 萬字），原文全存會讓紀錄檔迅速膨脹，
 *     因此逐欄截斷並保留原始長度，仍足以判斷「模型看到了什麼」。
 *  2. 紀錄含專案資料，只寫入 gitignore 的 storage/，不得混入版控。
 */

/** 單一欄位保留的字元數上限。 */
export const MAX_FIELD_CHARS = 2000;
/** 對話最多保留幾則訊息（取最後幾則，較近的較有除錯價值）。 */
export const MAX_MESSAGES = 12;

export type LogRole = "user" | "assistant";

export type LogMessage = { role: LogRole; text: string; chars?: number };

/** 呼叫模型的紀錄。 */
export type InteractionEntry = {
  kind: "interaction";
  ts: string;
  /** 同一個對話（面板一次開啟）的識別。 */
  conversationId?: string;
  /** 同一次送出（一問一答）的識別；一次送出可能觸發多次模型呼叫。 */
  turnId?: string;
  /** 呼叫來源，如 /api/chat、project-wizard:obligations。 */
  task?: string;
  route?: string;
  userId?: string;
  userName?: string;
  model?: string;
  latencyMs?: number;
  ok: boolean;
  error?: string;
  /** 送出的對話（截斷後）。 */
  messages?: LogMessage[];
  /** 文字上下文（如已轉文字的文件）截斷後內容與原始長度。 */
  context?: { text: string; chars: number; truncated: boolean };
  attachment?: { name?: string; mimeType?: string; bytes?: number };
  /** 模型回覆（截斷後）。 */
  response?: { text: string; chars: number; truncated: boolean };
  maxOutputTokens?: number;
  /**
   * 模型為何停止輸出（STOP／MAX_TOKENS／SAFETY…）。
   *
   * 缺這個欄位曾讓一次真實故障無法從紀錄判定原因：輸出被長度上限切斷，
   * 但截斷的 JSON 被修補成合法物件，看起來像「成功但沒資料」。
   */
  finishReason?: string;
  /**
   * token 用量。thoughts 是思考 token —— 它與輸出共用 maxOutputTokens，
   * 思考吃掉預算時輸出會在中途被切斷，這是唯一能看出來的欄位。
   */
  usage?: {
    prompt?: number;
    candidates?: number;
    thoughts?: number;
    total?: number;
  };
};

/** 使用者對某則回答的評價。 */
export type FeedbackEntry = {
  kind: "feedback";
  ts: string;
  conversationId?: string;
  turnId?: string;
  userId?: string;
  userName?: string;
  rating: "up" | "down";
  /** 使用者補充說明（多為負評時填寫）。 */
  comment?: string;
  /** 被評價的回答內容（截斷），讓紀錄本身即可判讀。 */
  answer?: { text: string; chars: number; truncated: boolean };
  /** 對應的畫面路徑，便於重現。 */
  path?: string;
};

/**
 * 非模型呼叫的過程紀錄。
 *
 * 由對話檢索引入：模型呼叫本身已被 InteractionEntry 記下，
 * 但「規劃結果如何被解讀」（挑了哪幾份、哪些代號是模型編的、實際注入幾段）
 * 不屬於任何一次呼叫，卻正是挑錯檔時唯一能追的線索。
 * 硬塞進 interaction 會汙染延遲與 token 的統計，故獨立一類。
 */
export type NoteEntry = {
  kind: "note";
  ts: string;
  conversationId?: string;
  turnId?: string;
  route?: string;
  userId?: string;
  userName?: string;
  /** 事件標籤，如 chat:retrieval。 */
  topic: string;
  text: string;
};

export type LogEntry = InteractionEntry | FeedbackEntry | NoteEntry;

/** 截斷長文字，回傳截斷後內容與原始長度。 */
export function clip(
  text: string | undefined | null,
  max = MAX_FIELD_CHARS,
): { text: string; chars: number; truncated: boolean } {
  const s = text ?? "";
  if (s.length <= max) return { text: s, chars: s.length, truncated: false };
  return {
    text: `${s.slice(0, max)}…（截斷，原長 ${s.length}）`,
    chars: s.length,
    truncated: true,
  };
}

/**
 * 對話只保留最後 MAX_MESSAGES 則並逐則截斷。
 * 較早的訊息對除錯價值遞減，且開頭常是冗長的草稿脈絡。
 */
export function clipMessages(
  messages: { role: string; text: string }[] | undefined,
  max = MAX_MESSAGES,
): LogMessage[] {
  if (!messages?.length) return [];
  const tail = messages.slice(-max);
  return tail.map((m) => {
    const c = clip(m.text);
    return {
      role: m.role === "assistant" ? "assistant" : "user",
      text: c.text,
      ...(c.truncated ? { chars: c.chars } : {}),
    };
  });
}

/** 依日期決定紀錄檔名（每日一檔，便於依時間追蹤與輪替）。 */
export function logFileName(date: Date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}.jsonl`;
}

/**
 * 序列化為單行 JSON（JSONL）。
 * 換行字元會被 JSON.stringify 轉義，故不會破壞逐行格式。
 */
export function toJsonLine(entry: LogEntry): string {
  return `${JSON.stringify(entry)}\n`;
}

/** 解析一行紀錄；格式錯誤回 null（讀取工具用）。 */
export function parseJsonLine(line: string): LogEntry | null {
  const t = line.trim();
  if (!t) return null;
  try {
    const v = JSON.parse(t) as LogEntry;
    return v.kind === "interaction" || v.kind === "feedback" ? v : null;
  } catch {
    return null;
  }
}
