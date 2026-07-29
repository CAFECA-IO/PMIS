import { appendFile, mkdir, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { AsyncLocalStorage } from "node:async_hooks";

import {
  clip,
  clipMessages,
  logFileName,
  parseJsonLine,
  toJsonLine,
  type FeedbackEntry,
  type InteractionEntry,
  type LogEntry,
} from "./faith-log";

/**
 * 費思互動紀錄的落地寫入。
 *
 * 所有與費思的往返（含各模組的 AI 任務）與使用者評價，都寫入專屬資料夾：
 *   storage/faith/YYYY-MM-DD.jsonl        （可用 FAITH_LOG_DIR 覆寫）
 * 一行一筆 JSON，便於 `grep`、`jq` 或匯入分析。
 *
 * 兩個原則：
 *  1. 寫紀錄絕不影響主流程 —— 任何失敗都只在伺服器日誌留痕，不向上拋。
 *  2. 呼叫端不需逐層傳遞識別資訊：以 AsyncLocalStorage 保存請求範圍的
 *     conversationId／turnId／使用者，模型閘道 (callGemini) 直接取用，
 *     因此四段解析等多次呼叫都會自動歸屬到同一次送出。
 */

const LOG_DIR =
  process.env.FAITH_LOG_DIR ??
  path.join(/* turbopackIgnore: true */ process.cwd(), "storage", "faith");

/** 請求範圍的紀錄脈絡。 */
export type LogContext = {
  conversationId?: string;
  turnId?: string;
  route?: string;
  userId?: string;
  userName?: string;
};

const store = new AsyncLocalStorage<LogContext>();

/** 在此範圍內執行的所有模型呼叫都會帶上這份脈絡。 */
export function withLogContext<T>(ctx: LogContext, fn: () => Promise<T>): Promise<T> {
  return store.run(ctx, fn);
}

export function currentLogContext(): LogContext {
  return store.getStore() ?? {};
}

async function append(entry: LogEntry): Promise<void> {
  try {
    await mkdir(LOG_DIR, { recursive: true });
    await appendFile(
      path.join(LOG_DIR, logFileName(new Date(entry.ts))),
      toJsonLine(entry),
      "utf-8",
    );
  } catch (error) {
    // 紀錄失敗不得中斷 AI 流程
    console.error("[faith-log] 寫入失敗：", error);
  }
}

export type InteractionInput = {
  task?: string;
  model?: string;
  latencyMs?: number;
  ok: boolean;
  error?: string;
  messages?: { role: string; text: string }[];
  contextText?: string;
  attachment?: { name?: string; mimeType?: string; bytes?: number };
  responseText?: string;
  maxOutputTokens?: number;
  finishReason?: string;
  usage?: InteractionEntry["usage"];
};

/** 記錄一次模型往返。由 faith.service 的閘道呼叫，不需其他模組介入。 */
export async function logInteraction(input: InteractionInput): Promise<void> {
  const ctx = currentLogContext();
  const entry: InteractionEntry = {
    kind: "interaction",
    ts: new Date().toISOString(),
    conversationId: ctx.conversationId,
    turnId: ctx.turnId,
    route: ctx.route,
    userId: ctx.userId,
    userName: ctx.userName,
    task: input.task,
    model: input.model,
    latencyMs: input.latencyMs,
    ok: input.ok,
    error: input.error,
    messages: clipMessages(input.messages),
    context: input.contextText ? clip(input.contextText) : undefined,
    attachment: input.attachment,
    response: input.responseText ? clip(input.responseText) : undefined,
    maxOutputTokens: input.maxOutputTokens,
    finishReason: input.finishReason,
    usage: input.usage,
  };
  await append(entry);
}

export type FeedbackInput = {
  conversationId?: string;
  turnId?: string;
  userId?: string;
  userName?: string;
  rating: "up" | "down";
  comment?: string;
  answerText?: string;
  path?: string;
};

/** 記錄使用者對某則回答的評價。 */
export async function logFeedback(input: FeedbackInput): Promise<void> {
  const entry: FeedbackEntry = {
    kind: "feedback",
    ts: new Date().toISOString(),
    conversationId: input.conversationId,
    turnId: input.turnId,
    userId: input.userId,
    userName: input.userName,
    rating: input.rating,
    comment: input.comment?.trim() || undefined,
    answer: input.answerText ? clip(input.answerText) : undefined,
    path: input.path,
  };
  await append(entry);
}

/** 紀錄資料夾的實際路徑（供除錯說明與管理介面顯示）。 */
export function logDir(): string {
  return LOG_DIR;
}

/** 列出既有的紀錄檔（新到舊）。 */
export async function listLogFiles(): Promise<string[]> {
  try {
    const files = await readdir(LOG_DIR);
    return files.filter((f) => f.endsWith(".jsonl")).sort().reverse();
  } catch {
    return [];
  }
}

/** 讀取某一日的紀錄（供除錯檢視）。 */
export async function readLog(fileName: string): Promise<LogEntry[]> {
  // 僅取檔名，避免以路徑穿越讀取儲存區以外的檔案
  const safe = path.basename(fileName);
  try {
    const raw = await readFile(path.join(LOG_DIR, safe), "utf-8");
    return raw
      .split("\n")
      .map(parseJsonLine)
      .filter((e): e is LogEntry => e !== null);
  } catch {
    return [];
  }
}
