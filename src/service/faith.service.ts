import {
  GEMINI_ENDPOINT,
  DEFAULT_AI_MODEL,
  AI_SYSTEM_PROMPT,
  AI_DOC_ANALYSIS_PROMPT,
  AI_IMAGE_ANALYSIS_PROMPT,
  AI_SCREEN_FOCUS_PROMPT,
  AI_REPORT_PROMPT,
  AI_VOUCHER_PROMPT,
  AI_EHS_PROMPT,
  AI_PROJECT_WIZARD_PROMPT,
  AI_WIZARD_PROFILE_PROMPT,
  AI_WIZARD_OBLIGATIONS_PROMPT,
  AI_WIZARD_SCOPE_PROMPT,
  AI_WIZARD_PACKAGES_PROMPT,
  AI_WIZARD_OWNERS_PROMPT,
  AI_WIZARD_WORKITEMS_PROMPT,
  AI_ALERT_RULE_PROMPT,
} from "@/constant/ai";
import {
  buildFieldSchema,
  describeFields,
  type FormAssistSpec,
} from "@/service/form-assist";
import {
  domainBrief,
  managementPatternBrief,
  matchDomain,
  workItemShapeBrief,
} from "@/service/domain-match";
import * as docRepo from "@/repository/approvalDocument.repository";
import * as storage from "@/service/storage.service";
import { logInteraction } from "@/service/faithLog.service";
import {
  FaithError,
  classifyStatus,
  looksBusy,
} from "@/service/faith-error";

/**
 * 費思（Faith）——全系統唯一的 AI 溝通閘道。
 *
 * 溝通規範（所有模組一律遵循，請勿自行呼叫 Gemini）：
 *  1. 純文字回覆走 `ask()`；需要結構化資料走 `askStructured()`。
 *  2. 結構化任務一律提供 responseSchema，由 API 層強制回傳合法 JSON，
 *     不依賴提示詞「請回 JSON」的自律（先前退化成散文導致擷取失敗的主因）。
 *  3. schema 送出前一律經 `sanitizeSchema()` 清理，避免空 enum／空 properties
 *     這類會被 Gemini 以 400 拒收的結構。
 *  4. JSON 一律以 `parseJsonLoose()` 解析，可修補因 token 上限被截斷的輸出。
 *  5. 附件：PDF／影像以 inlineData 交由模型原生判讀；Office／純文字檔請先於
 *     docExtract.service 轉成文字，以 `context` 傳入。
 */

export type FaithMessage = { role: "user" | "assistant"; text: string };
export type FaithAttachment = { mimeType: string; data: string; name?: string };

type Part = { text: string } | { inlineData: { mimeType: string; data: string } };
type GeminiContent = { role: "user" | "model"; parts: Part[] };

function getConfig() {
  const apiKey = process.env.AI_KEY;
  if (!apiKey) {
    // 不把環境變數名稱丟到畫面；細節留在紀錄與伺服器日誌
    throw new FaithError("failed", {
      hint: "AI 服務尚未完成設定，請聯絡系統管理者。",
      detail: "尚未設定 AI_KEY",
    });
  }
  return { apiKey, model: process.env.AI_MODEL || DEFAULT_AI_MODEL };
}

/** Gemini responseSchema（OpenAPI 子集）。 */
export type ResponseSchema = Record<string, unknown>;

/**
 * 清理 responseSchema，移除 Gemini 會以 400 拒收的結構。
 *
 * 已知地雷：`enum` 內含空字串會回報
 * `GenerateContentRequest.generation_config.response_schema cannot be empty`。
 * 空 enum 陣列與空 properties 物件同理。
 * 回傳 null 表示清理後已無有效內容，此時改以純文字模式送出。
 */
export function sanitizeSchema(schema: ResponseSchema): ResponseSchema | null {
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk);
    if (!node || typeof node !== "object") return node;

    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (key === "enum") {
        // 僅保留非空字串；全空則整個丟棄該鍵
        const values = Array.isArray(value)
          ? value.filter((v) => typeof v === "string" && v.trim() !== "")
          : [];
        if (values.length > 0) out.enum = values;
        continue;
      }
      if (key === "properties") {
        const props = walk(value) as Record<string, unknown>;
        if (props && Object.keys(props).length > 0) out.properties = props;
        continue;
      }
      out[key] = walk(value);
    }
    return out;
  };

  const cleaned = walk(schema) as ResponseSchema;
  if (!cleaned || Object.keys(cleaned).length === 0) return null;
  // 只有 type 卻沒有任何內容的 OBJECT 對 Gemini 而言等同空 schema
  if (cleaned.type === "OBJECT" && !cleaned.properties) return null;
  return cleaned;
}

/** 模型回報的 token 用量；thoughts 佔用 maxOutputTokens，是診斷截斷的關鍵。 */
export type TokenUsage = {
  prompt?: number;
  candidates?: number;
  thoughts?: number;
  total?: number;
};

/**
 * 四段解析的輸出上限。
 *
 * 8192 曾造成真實故障：思考 token 與輸出共用此預算，複雜契約的
 * 「履約事項」與「工程分項」兩段思考完就沒有額度輸出，JSON 在中途被切斷
 * （見 storage/faith 2026-07-28 紀錄）。gemini-2.5-flash 上限為 65536，
 * 提高到 24576 後思考預算 6144、輸出仍有約 18000 tokens。
 */
export const WIZARD_MAX_TOKENS = 24576;

/** 思考預算下限：低於此值模型幾乎無法推理，反而降低判讀品質。 */
export const MIN_THINKING_BUDGET = 512;

/**
 * 由輸出上限推算思考預算。
 *
 * 取四分之一並設下限：思考與輸出共用同一個 maxOutputTokens，
 * 不設上限時複雜文件會讓思考吃光預算，輸出中途被切斷。
 */
export function thinkingBudgetFor(maxOutputTokens: number): number {
  return Math.max(MIN_THINKING_BUDGET, Math.floor(maxOutputTokens / 4));
}

async function callGemini(
  contents: GeminiContent[],
  systemPrompt: string,
  maxOutputTokens = 1024,
  responseSchema?: ResponseSchema,
  /** 紀錄用的任務標籤，如 chat、project-build:obligations。 */
  task?: string,
): Promise<string> {
  const { apiKey, model } = getConfig();
  const startedAt = Date.now();

  /*
    互動紀錄：此處是全系統唯一的模型出入口，記在這裡即可涵蓋所有任務，
    不必在五條路由與四段解析各寫一份。識別資訊由 AsyncLocalStorage 取得。
    紀錄失敗不影響回傳。
  */
  const record = (
    ok: boolean,
    responseText?: string,
    error?: string,
    /**
     * 模型為何停止與 token 用量。
     *
     * 一定要記：輸出被截斷時（finishReason MAX_TOKENS）回傳的 JSON 仍會被
     * parseJsonLoose 修補成合法物件，看起來像「成功但沒資料」。
     * 沒有這兩個欄位，事後無法從紀錄判斷是文件沒寫，還是輸出被切斷。
     * thoughtsTokenCount 尤其關鍵 —— 思考 token 會佔用 maxOutputTokens。
     */
    finish?: { reason?: string; usage?: TokenUsage },
  ) => {
    void logInteraction({
      task,
      model,
      latencyMs: Date.now() - startedAt,
      ok,
      error,
      finishReason: finish?.reason,
      usage: finish?.usage,
      // contents 已含對話與文字上下文；附件僅記中繼資料，不存 base64
      messages: contents.map((c) => ({
        role: c.role === "model" ? "assistant" : "user",
        text: c.parts
          .map((p) => ("text" in p ? p.text : `［附件 ${p.inlineData.mimeType}］`))
          .join("\n"),
      })),
      attachment: attachmentMetaOf(contents),
      responseText,
      maxOutputTokens,
    });
  };

  // Info: 帶 responseSchema 時改用結構化輸出，模型必定回傳符合結構的 JSON，
  // 不會退化成自然語言散文（先前造成欄位擷取不到的主因）。
  const generationConfig: Record<string, unknown> = {
    temperature: 0.4,
    maxOutputTokens,
    /*
      思考預算必須明確設上限。
      gemini-2.5 系列預設開啟思考，且思考 token 與輸出 token 共用
      maxOutputTokens。實測（storage/faith 紀錄 2026-07-28）：契約解析的
      「履約事項」與「工程分項」兩段各花約 30 秒卻只吐出不到 600 字且 JSON
      不完整 —— 8192 的預算幾乎全被思考吃掉，真正要的資料一個字都沒輸出。
      設為 maxOutputTokens 的四分之一，保留四分之三給實際輸出。
    */
    thinkingConfig: {
      thinkingBudget: thinkingBudgetFor(maxOutputTokens),
    },
  };
  const safeSchema = responseSchema ? sanitizeSchema(responseSchema) : null;
  if (safeSchema) {
    generationConfig.responseMimeType = "application/json";
    generationConfig.responseSchema = safeSchema;
  }

  let response: Response;
  try {
    response = await fetch(`${GEMINI_ENDPOINT}/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents,
        generationConfig,
      }),
    });
  } catch (error) {
    // 連不上通常是暫時性的，且使用者能做的也只有稍後再試；
    // 說成「處理異常」會誤導他以為是自己的資料有問題
    const detail = error instanceof Error ? error.message : String(error);
    record(false, undefined, `連線失敗：${detail}`);
    throw new FaithError("busy", { detail: `連線失敗：${detail}` });
  }

  if (!response.ok) {
    let detail = "";
    try {
      const err = await response.json();
      detail = err?.error?.message ?? "";
    } catch {
      // Info: (20260721 - Luphia) 忽略解析錯誤
    }
    // 原始訊息只寫進紀錄；對外只留「忙線」或「異常」兩種語意，
    // 避免 HTTP 狀態碼、Gemini 英文錯誤字串與 schema 欄位名外流到畫面
    const raw = `Gemini API 錯誤（${response.status}）${detail ? `：${detail}` : ""}`;
    record(false, undefined, raw);
    const kind = looksBusy(detail) ? "busy" : classifyStatus(response.status);
    throw new FaithError(kind, { detail: raw });
  }

  const data = (await response.json()) as {
    candidates?: {
      content?: { parts?: { text?: string }[] };
      finishReason?: string;
    }[];
    usageMetadata?: {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
      thoughtsTokenCount?: number;
      totalTokenCount?: number;
    };
  };
  const candidate = data.candidates?.[0];
  const text =
    candidate?.content?.parts
      ?.map((p) => p.text ?? "")
      .join("")
      .trim() ?? "";

  const finishReason = candidate?.finishReason;
  const usage: TokenUsage = {
    prompt: data.usageMetadata?.promptTokenCount,
    candidates: data.usageMetadata?.candidatesTokenCount,
    thoughts: data.usageMetadata?.thoughtsTokenCount,
    total: data.usageMetadata?.totalTokenCount,
  };

  /*
    輸出被長度上限切斷時必須明確失敗。

    先前只要 HTTP 200 就當成功，而 parseJsonLoose 會把截斷的 JSON 補成合法
    物件，於是「輸出中途被切斷」被呈現為「成功解析，但沒有任何履約事項」——
    使用者據此誤以為契約沒寫期限。這是最糟的失敗模式：錯的結論比沒有結論危險。
    改為拋出可重試的錯誤，讓該段標為失敗並提供重試。
  */
  if (finishReason === "MAX_TOKENS") {
    const spent = usage.thoughts
      ? `（思考用了 ${usage.thoughts} tokens，輸出上限 ${maxOutputTokens}）`
      : `（輸出上限 ${maxOutputTokens}）`;
    const raw = `模型輸出超過長度上限而被截斷${spent}，結果不完整。`;
    record(false, text, raw, { reason: finishReason, usage });
    // 截斷屬於處理異常，但補上可行動的建議 —— 使用者確實有辦法改善
    throw new FaithError("failed", {
      hint: "輸出過長而被截斷，請重試或縮減文件範圍。",
      detail: raw,
    });
  }

  const out = text || "（AI 沒有回覆內容）";
  record(true, out, undefined, { reason: finishReason, usage });
  return out;
}

/** 從 contents 取出附件的中繼資料（不記錄 base64 內容）。 */
function attachmentMetaOf(
  contents: GeminiContent[],
): { mimeType?: string; bytes?: number } | undefined {
  for (const c of contents) {
    for (const part of c.parts) {
      if ("inlineData" in part) {
        return {
          mimeType: part.inlineData.mimeType,
          // base64 每 4 字元約還原 3 位元組
          bytes: Math.round((part.inlineData.data.length * 3) / 4),
        };
      }
    }
  }
  return undefined;
}

/**
 * 寬鬆解析模型輸出的 JSON。所有結構化任務共用。
 *
 * 即使因 token 上限被截斷，也嘗試補上未閉合的括號後再解析，
 * 盡量保住已產出的欄位，而不是整批丟棄。
 */
export function parseJsonLoose<T = Record<string, unknown>>(
  text: string,
): T | null {
  const cleaned = text
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
  const start = cleaned.indexOf("{");
  if (start < 0) return null;
  const body = cleaned.slice(start);

  try {
    return JSON.parse(body) as T;
  } catch {
    // 續行：嘗試修補截斷的 JSON
  }

  // 掃描並記錄未閉合的結構，於字串外補齊
  let inStr = false;
  let escaped = false;
  const stack: string[] = [];
  for (const ch of body) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\" && inStr) {
      escaped = true;
      continue;
    }
    if (ch === '"') inStr = !inStr;
    else if (!inStr) {
      if (ch === "{" || ch === "[") stack.push(ch);
      else if (ch === "}" || ch === "]") stack.pop();
    }
  }

  let repaired = body;
  if (inStr) repaired += '"';
  // 去掉結尾殘缺的鍵／鍵值對（如 `,"name":` 或 `,"na"`）與多餘逗號，
  // 否則補上括號後仍是「有鍵無值」的非法 JSON。
  repaired = repaired
    .replace(/,\s*"[^"]*"\s*:\s*$/, "")
    .replace(/,\s*"[^"]*"\s*$/, "")
    .replace(/\{\s*"[^"]*"\s*:\s*$/, "{")
    .replace(/\{\s*"[^"]*"\s*$/, "{")
    .replace(/[,:]\s*$/, "");
  while (stack.length) repaired += stack.pop() === "{" ? "}" : "]";

  try {
    return JSON.parse(repaired) as T;
  } catch {
    return null;
  }
}

export type FaithRequest = {
  /** 系統指示：角色設定與輸出規範 */
  instruction: string;
  messages?: FaithMessage[];
  /** 純文字上下文（如已轉文字的 Office 文件、畫面數據） */
  context?: string;
  /** 原生判讀的附件（PDF／影像） */
  attachment?: FaithAttachment;
  maxOutputTokens?: number;
  /** contents 為空時的預設提問 */
  fallbackPrompt?: string;
  /** 互動紀錄用的任務標籤，如 chat、project-build:obligations。 */
  task?: string;
};

/** 組出送往模型的 contents：對話 → 文字上下文 → 原生附件。 */
function buildFaithContents(req: FaithRequest): GeminiContent[] {
  const contents: GeminiContent[] = (req.messages ?? [])
    .filter((m) => m.text.trim().length > 0)
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.text }] as Part[],
    }));

  if (req.context?.trim()) {
    contents.push({ role: "user", parts: [{ text: req.context }] });
  }

  if (req.attachment?.data) {
    const filePart: Part = {
      inlineData: {
        mimeType: req.attachment.mimeType || "application/octet-stream",
        data: req.attachment.data,
      },
    };
    const last = contents[contents.length - 1];
    if (last && last.role === "user") last.parts.push(filePart);
    else contents.push({ role: "user", parts: [filePart] });
  }

  if (contents.length === 0 && req.fallbackPrompt) {
    contents.push({ role: "user", parts: [{ text: req.fallbackPrompt }] });
  }
  return contents;
}

/** 取得純文字回覆。 */
export async function ask(req: FaithRequest): Promise<string> {
  return callGemini(
    buildFaithContents(req),
    req.instruction,
    req.maxOutputTokens,
    undefined,
    req.task,
  );
}

/**
 * 取得結構化回覆。強制 JSON 輸出並以寬鬆解析容錯，
 * 無法解析時回傳 null，由呼叫端決定退路。
 */
export async function askStructured<T = Record<string, unknown>>(
  req: FaithRequest & { schema: ResponseSchema },
): Promise<T | null> {
  const text = await callGemini(
    buildFaithContents(req),
    req.instruction,
    req.maxOutputTokens,
    req.schema,
    req.task,
  );
  return parseJsonLoose<T>(text);
}

// Info: (20260721 - Luphia) AI 面板使用的多輪對話，可帶一個 inline 附件
export async function chat(
  messages: FaithMessage[],
  attachment?: FaithAttachment,
): Promise<string> {
  if (messages.every((m) => !m.text.trim()) && !attachment?.data) {
    throw new FaithError("failed", { hint: "訊息內容為空，請輸入問題或附上檔案。" });
  }
  return ask({
    instruction: AI_SYSTEM_PROMPT,
    task: "chat",
    messages,
    attachment,
    maxOutputTokens: attachment ? 1536 : 1024,
    fallbackPrompt: "請分析這個附件，並以繁體中文摘要重點。",
  });
}

/**
 * Info: (20260721 - Luphia)
 * 將畫面重點數據彙整為一句自然語言。結合確定性數據與 AI 潤飾，於無資料或 AI 不可用
 * 時回退為純文字句子，確保不阻擋頁面導航。
 */
export async function summarizeScreenFocus(
  label: string,
  facts: string[],
): Promise<string> {
  if (facts.length === 0) {
    return `${label}目前沒有需要立即處理的重點。`;
  }
  const fallback = `${label}重點：${facts.join("、")}。`;
  try {
    getConfig(); // Info: (20260721 - Luphia) 未設定 AI_KEY 時拋錯
    const prompt = `畫面：${label}\n重點數據：\n${facts
      .map((f) => `- ${f}`)
      .join("\n")}`;
    const text = await ask({
      instruction: AI_SCREEN_FOCUS_PROMPT,
      messages: [{ role: "user", text: prompt }],
      maxOutputTokens: 128,
    });
    return text && text !== "（AI 沒有回覆內容）" ? text : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Info: (20260721 - Luphia)
 * 由期間數據生成工程報告的敘述「摘要」；AI 不可用時回退為模板，確保報告一定產出。
 */
export async function generateReportNarrative(
  factsText: string,
  typeLabel: string,
): Promise<string> {
  const fallback =
    `本${typeLabel}依系統紀錄彙整如下：\n\n${factsText}\n\n` +
    `建議：持續追蹤未結案缺失與落後履約事項，並確認送審與查驗進度符合履約時程。`;
  try {
    getConfig();
    const text = await ask({
      instruction: AI_REPORT_PROMPT,
      messages: [
        { role: "user", text: `報告類型：${typeLabel}\n數據：\n${factsText}` },
      ],
      maxOutputTokens: 512,
    });
    return text && text !== "（AI 沒有回覆內容）" ? text : fallback;
  } catch {
    return fallback;
  }
}

// Info: (20260721 - Luphia) 判讀簽核附件（PDF/影像）並回傳 Markdown 摘要
export async function analyzeAttachment(attachmentId: string): Promise<string> {
  const att = await docRepo.findAttachment(attachmentId);
  if (!att) throw new FaithError("failed", { hint: "找不到附件。" });
  const buffer = await storage.read(att.storedName);
  if (!buffer) throw new FaithError("failed", { hint: "找不到檔案內容。" });

  return ask({
    instruction: AI_DOC_ANALYSIS_PROMPT,
    context: AI_DOC_ANALYSIS_PROMPT,
    attachment: {
      mimeType: att.mimeType,
      data: buffer.toString("base64"),
      name: att.fileName,
    },
    maxOutputTokens: 1536,
  });
}

export type ExtractedVoucher = {
  date: string;
  direction: "INCOME" | "EXPENSE";
  category: string;
  amount: number;
  counterparty: string;
  summary: string;
};

/** 憑證判讀的結構化輸出結構。 */
const VOUCHER_SCHEMA: ResponseSchema = {
  type: "OBJECT",
  properties: {
    date: { type: "STRING", description: "憑證日期 YYYY-MM-DD，無法判讀填空字串" },
    direction: { type: "STRING", enum: ["INCOME", "EXPENSE"] },
    category: { type: "STRING", description: "會計科目" },
    amount: { type: "NUMBER", description: "金額（新台幣純數字）" },
    counterparty: { type: "STRING", description: "廠商或機關名稱" },
    summary: { type: "STRING", description: "一句話說明用途" },
  },
  required: ["direction", "amount"],
  propertyOrdering: ["date", "direction", "category", "amount", "counterparty", "summary"],
};

// Info: (20260721 - Luphia) 判讀憑證/發票並擷取結構化會計傳票欄位
export async function extractVoucher(
  base64: string,
  mimeType: string,
): Promise<ExtractedVoucher> {
  const raw = await askStructured<Partial<ExtractedVoucher>>({
    instruction: AI_VOUCHER_PROMPT,
    context: "請依系統指示判讀此憑證。",
    attachment: {
      mimeType: mimeType || "application/octet-stream",
      data: base64,
    },
    maxOutputTokens: 512,
    schema: VOUCHER_SCHEMA,
  });
  if (!raw) throw new FaithError("failed", {
      hint: "未能判讀這張憑證，請確認影像清晰後重試。",
      detail: "憑證判讀失敗",
    });

  return {
    date: typeof raw.date === "string" ? raw.date : "",
    direction: raw.direction === "INCOME" ? "INCOME" : "EXPENSE",
    category: typeof raw.category === "string" ? raw.category : "",
    amount: Number(raw.amount) || 0,
    counterparty: typeof raw.counterparty === "string" ? raw.counterparty : "",
    summary: typeof raw.summary === "string" ? raw.summary : "",
  };
}

export type ExtractedEhs = {
  type: "SAFETY" | "ENVIRONMENT" | "TRAFFIC" | "HEALTH";
  result: "PASS" | "FAIL" | "IMPROVING" | "PENDING";
  findings: string;
};

/** 環安衛照片判讀的結構化輸出結構。 */
const EHS_SCHEMA: ResponseSchema = {
  type: "OBJECT",
  properties: {
    type: {
      type: "STRING",
      enum: ["SAFETY", "ENVIRONMENT", "TRAFFIC", "HEALTH"],
      description: "稽核類別：職安／環保／交維／衛生",
    },
    result: {
      type: "STRING",
      enum: ["PASS", "FAIL", "IMPROVING", "PENDING"],
      description: "判定結果，有明顯缺失填 FAIL",
    },
    findings: { type: "STRING", description: "缺失情形摘要（1-3 句）" },
  },
  required: ["type", "result", "findings"],
  propertyOrdering: ["type", "result", "findings"],
};

// Info: (20260721 - Luphia) 判讀工地照片並擷取結構化稽核欄位（供新增稽核表單預填）
export async function extractEhsFinding(
  base64: string,
  mimeType: string,
): Promise<ExtractedEhs> {
  const raw = await askStructured<Partial<ExtractedEhs>>({
    instruction: AI_EHS_PROMPT,
    context: "請依系統指示判讀此工地照片。",
    attachment: {
      mimeType: mimeType || "application/octet-stream",
      data: base64,
    },
    maxOutputTokens: 512,
    schema: EHS_SCHEMA,
  });
  if (!raw) throw new FaithError("failed", {
      hint: "未能判讀這張照片，請確認影像清晰後重試。",
      detail: "照片判讀失敗",
    });
  const types = ["SAFETY", "ENVIRONMENT", "TRAFFIC", "HEALTH"];
  const results = ["PASS", "FAIL", "IMPROVING", "PENDING"];
  return {
    type: (types.includes(raw.type as string) ? raw.type : "SAFETY") as ExtractedEhs["type"],
    result: (results.includes(raw.result as string) ? raw.result : "FAIL") as ExtractedEhs["result"],
    findings: typeof raw.findings === "string" ? raw.findings : "",
  };
}

// ── 專案建置：對話 + 文件判讀，逐步擷取專案欄位 ─────────────
export type ProjectProfileFields = {
  code?: string;
  name?: string;
  location?: string;
  client?: string;
  contractor?: string;
  supervisor?: string;
  budget?: number;
  startDate?: string;
  endDate?: string;
  status?: string;
  description?: string;
};

export type WizardObligation = {
  code?: string;
  title: string;
  stage?: string;
  risk?: string;
  triggerType?: string;
  dueDate?: string;
  ownerUnit?: string;
  ownerName?: string;
  contractBasis?: string;
  weight?: number;
  commissioning?: boolean;
  /** 源自哪一項履約標的（名稱）。 */
  scopeRef?: string;
};

export type WizardWorkItem = {
  code?: string;
  name: string;
  category?: string;
  obligation?: string;
  plannedStart?: string;
  plannedEnd?: string;
  /** 所屬工程項目名稱（規劃階段的分群，非獨立層級）。 */
  workPackage?: string;
  /** 源自哪一項履約標的（名稱），由所屬工程項目繼承。 */
  scopeRef?: string;
};

export type ProjectWizardResult = {
  reply: string;
  fields: ProjectProfileFields;
  obligations: WizardObligation[];
  workItems: WizardWorkItem[];
};

/** 精靈草稿：專案欄位 + 履約事項 + 工程分項，作為模型的已知脈絡。 */
export type ProjectWizardDraft = {
  fields?: ProjectProfileFields;
  obligations?: WizardObligation[];
  workItems?: WizardWorkItem[];
};

const PROJECT_STATUSES = [
  "PLANNING",
  "ACTIVE",
  "ON_HOLD",
  "COMPLETED",
  "CANCELLED",
];

const OBLIGATION_STAGES = [
  "CONCEPT_DESIGN",
  "DETAIL_DESIGN",
  "TENDER",
  "CONSTRUCTION",
  "COMMISSIONING",
  "HANDOVER",
  "OTHER",
];
const OBLIGATION_RISKS = ["GREEN", "YELLOW", "ORANGE", "RED", "PURPLE"];
const OBLIGATION_TRIGGERS = [
  "FIXED_DATE",
  "RELATIVE_DUE",
  "PREDECESSOR",
  "CONDITION",
];

/**
 * 強制模型以此結構回覆。無把握的欄位請它回空字串（解析時會濾掉），
 * 比起「請省略該鍵」更能與結構化輸出相容。
 */
const S = (description: string) => ({ type: "STRING", description });

const PROJECT_WIZARD_SCHEMA: ResponseSchema = {
  type: "OBJECT",
  properties: {
    reply: S("給使用者的繁體中文回覆（Markdown，簡短數行）"),
    fields: {
      type: "OBJECT",
      properties: {
        code: S("專案編號／契約編號，無法判讀填空字串"),
        name: S("專案名稱，無法判讀填空字串"),
        location: S("工程地點"),
        client: S("業主／主辦機關"),
        contractor: S("承包商"),
        supervisor: S("監造單位"),
        budget: { type: "NUMBER", description: "契約金額（純數字，無則 0）" },
        startDate: S("開工日 YYYY-MM-DD"),
        endDate: S("完工日 YYYY-MM-DD"),
        status: {
          type: "STRING",
          enum: PROJECT_STATUSES,
          description: "專案狀態，新案通常 PLANNING",
        },
        description: S("工程摘要"),
      },
      propertyOrdering: [
        "code",
        "name",
        "location",
        "client",
        "contractor",
        "supervisor",
        "budget",
        "startDate",
        "endDate",
        "status",
        "description",
      ],
    },
    obligations: {
      type: "ARRAY",
      description: "履約事項，依期限先後排序；無法判讀則回空陣列",
      items: {
        type: "OBJECT",
        properties: {
          code: S("管制編號，無則空字串（系統會自動編號）"),
          title: S("履約事項名稱"),
          stage: { type: "STRING", enum: OBLIGATION_STAGES },
          risk: { type: "STRING", enum: OBLIGATION_RISKS },
          triggerType: { type: "STRING", enum: OBLIGATION_TRIGGERS },
          dueDate: S("期限 YYYY-MM-DD，無則空字串"),
          ownerUnit: S("責任單位，無則空字串"),
          ownerName: S("責任人，無則空字串"),
          contractBasis: S("契約依據條款，無則空字串"),
          weight: { type: "INTEGER", description: "進度權重，預設 1" },
          commissioning: {
            type: "BOOLEAN",
            description: "是否計入試運轉就緒度",
          },
        },
        required: ["title"],
        propertyOrdering: [
          "code",
          "title",
          "scopeRef",
          "stage",
          "risk",
          "triggerType",
          "dueDate",
          "ownerUnit",
          "ownerName",
          "contractBasis",
          "weight",
          "commissioning",
        ],
      },
    },
    workItems: {
      type: "ARRAY",
      description: "工程分項；無法判讀則回空陣列",
      items: {
        type: "OBJECT",
        properties: {
          code: S("分項編號，無則空字串"),
          name: S("工程分項名稱"),
          category: S("工種／類別"),
          obligation: S("所屬履約事項名稱，需與 obligations 之 title 一致"),
          plannedStart: S("預定開始 YYYY-MM-DD"),
          plannedEnd: S("預定完成 YYYY-MM-DD"),
        },
        required: ["name"],
        propertyOrdering: [
          "code",
          "name",
          "category",
          "workPackage",
          "obligation",
          "plannedStart",
          "plannedEnd",
        ],
      },
    },
  },
  required: ["reply", "fields", "obligations", "workItems"],
  propertyOrdering: ["reply", "fields", "obligations", "workItems"],
};

/**
 * 補齊模型未填的欄位，讓專案經理人看到的是一份「完整草稿」而非半空表格。
 * 全部為確定性推導，不猜測名稱等實質內容：
 *  1. 分項編號：空白或重複者依序補 A-01、A-02…（保留模型給的有效唯一編號）
 *  2. 分項起訖：由所屬履約事項的時間窗推導（前一事項期限 → 本事項期限），
 *     無所屬履約事項則退回專案開工／完工日
 */
function completeDraft(
  fields: ProjectProfileFields,
  obligations: WizardObligation[],
  workItems: WizardWorkItem[],
): WizardWorkItem[] {
  const projStart = fields.startDate;
  const projEnd = fields.endDate;

  // 履約事項時間窗：以期限先後順序，前一個的期限作為本階段起點
  const windows = new Map<string, { start?: string; end?: string }>();
  let cursor = projStart;
  for (const m of obligations) {
    windows.set(m.title, { start: cursor, end: m.dueDate || projEnd });
    if (m.dueDate) cursor = m.dueDate;
  }

  const used = new Set<string>();
  for (const w of workItems) {
    const c = w.code?.trim();
    if (c && !used.has(c)) used.add(c);
  }

  let seq = 0;
  const nextCode = () => {
    let code: string;
    do {
      seq += 1;
      code = `A-${String(seq).padStart(2, "0")}`;
    } while (used.has(code));
    used.add(code);
    return code;
  };

  const assigned = new Set<string>();
  return workItems.map((w) => {
    const out: WizardWorkItem = { ...w };

    const c = out.code?.trim();
    if (!c || assigned.has(c)) {
      out.code = nextCode();
    } else {
      assigned.add(c);
      out.code = c;
    }

    const win = out.obligation ? windows.get(out.obligation) : undefined;
    if (!out.plannedStart) out.plannedStart = win?.start ?? projStart;
    if (!out.plannedEnd) out.plannedEnd = win?.end ?? projEnd;

    for (const k of Object.keys(out) as (keyof WizardWorkItem)[]) {
      if (out[k] === undefined) delete out[k];
    }
    return out;
  });
}

type RawWizard = {
  reply?: unknown;
  fields?: Record<string, unknown>;
  obligations?: unknown;
  workItems?: unknown;
};


/**
 * Info: 依對話歷程與（可選）附件，擷取新專案的結構化欄位、履約事項與工程分項並產生引導回覆。
 * `known` 為目前已確認的草稿，供模型只補齊缺漏、避免覆蓋使用者已修改的值。
 */
export async function extractProjectProfile(
  messages: FaithMessage[],
  attachment?: FaithAttachment,
  known?: ProjectWizardDraft,
  documentText?: string,
): Promise<ProjectWizardResult> {
  // 已確認的草稿放在對話最前面當脈絡，其餘依統一規範由 ask 層組裝
  const hasKnown =
    known &&
    (Object.keys(known.fields ?? {}).length > 0 ||
      (known.obligations?.length ?? 0) > 0 ||
      (known.workItems?.length ?? 0) > 0);
  const history: FaithMessage[] = hasKnown
    ? [
        {
          role: "user",
          text: `目前已確認的草稿（JSON，請沿用並僅補齊缺漏，勿覆蓋既有值）：\n${JSON.stringify(known)}`,
        },
        ...messages,
      ]
    : messages;

  // Info: 履約事項與工程分項可能很長，放寬輸出上限；並以 schema 強制 JSON 結構
  const raw = await askStructured<RawWizard>({
    instruction: AI_PROJECT_WIZARD_PROMPT,
    messages: history,
    // Office／純文字檔已於伺服器端轉成文字；PDF／影像交由模型原生判讀
    context: documentText?.trim()
      ? `以下是使用者上傳文件的文字內容，請據以判讀並擷取欄位：\n\n${documentText}`
      : undefined,
    attachment,
    maxOutputTokens: 8192,
    schema: PROJECT_WIZARD_SCHEMA,
    fallbackPrompt: "請開始引導我建立新專案，並說明需要哪些資訊。",
  });

  const empty = { fields: {}, obligations: [], workItems: [] };
  if (!raw) {
    return {
      reply:
        "抱歉，這次判讀的回覆格式不正確，未能擷取欄位。請再試一次，或改以文字補充資訊。",
      ...empty,
    };
  }

  const rf = (raw.fields ?? {}) as Record<string, unknown>;
  const str = (v: unknown) =>
    typeof v === "string" && v.trim() ? v.trim() : undefined;
  const fields: ProjectProfileFields = {
    code: str(rf.code),
    name: str(rf.name),
    location: str(rf.location),
    client: str(rf.client),
    contractor: str(rf.contractor),
    supervisor: str(rf.supervisor),
    budget:
      rf.budget != null && !Number.isNaN(Number(rf.budget))
        ? Number(rf.budget)
        : undefined,
    startDate: str(rf.startDate),
    endDate: str(rf.endDate),
    status:
      typeof rf.status === "string" && PROJECT_STATUSES.includes(rf.status)
        ? rf.status
        : undefined,
    description: str(rf.description),
  };

  // Info: 移除 undefined 鍵，讓前端可乾淨地與已知欄位合併
  for (const k of Object.keys(fields) as (keyof ProjectProfileFields)[]) {
    if (fields[k] === undefined) delete fields[k];
  }

  // Info: 履約事項——僅保留有名稱者，權重轉為正整數，enum 欄位僅接受合法成員
  const pick = (valid: string[], v: unknown) =>
    typeof v === "string" && valid.includes(v) ? v : undefined;
  const rawObligations = Array.isArray(raw.obligations) ? raw.obligations : [];
  const obligations: WizardObligation[] = [];
  for (const item of rawObligations) {
    if (!item || typeof item !== "object") continue;
    const m = item as Record<string, unknown>;
    const title = str(m.title);
    if (!title) continue;
    const weight =
      m.weight != null && !Number.isNaN(Number(m.weight))
        ? Math.max(1, Math.round(Number(m.weight)))
        : undefined;
    obligations.push({
      code: str(m.code),
      title,
      stage: pick(OBLIGATION_STAGES, m.stage),
      risk: pick(OBLIGATION_RISKS, m.risk),
      triggerType: pick(OBLIGATION_TRIGGERS, m.triggerType),
      dueDate: str(m.dueDate),
      ownerUnit: str(m.ownerUnit),
      ownerName: str(m.ownerName),
      contractBasis: str(m.contractBasis),
      weight,
      commissioning: m.commissioning === true,
    });
  }

  // Info: 工程分項——obligation 僅接受能對應到上方履約事項名稱者
  const obligationTitles = new Set(obligations.map((m) => m.title));
  const rawWorkItems = Array.isArray(raw.workItems) ? raw.workItems : [];
  const workItems: WizardWorkItem[] = [];
  for (const item of rawWorkItems) {
    if (!item || typeof item !== "object") continue;
    const w = item as Record<string, unknown>;
    const name = str(w.name);
    if (!name) continue;
    const obligation = str(w.obligation);
    workItems.push({
      code: str(w.code),
      name,
      category: str(w.category),
      obligation:
        obligation && obligationTitles.has(obligation) ? obligation : undefined,
      plannedStart: str(w.plannedStart),
      plannedEnd: str(w.plannedEnd),
    });
  }

  return {
    reply: str(raw.reply) ?? "已更新可判讀的欄位，請確認或補充其餘資訊。",
    fields,
    obligations,
    workItems: completeDraft(fields, obligations, workItems),
  };
}

// ── 分段解析：四段各自一次呼叫，schema 較小不易被截斷 ─────────

/** 分段解析共用的輸入。 */
export type WizardPassInput = {
  messages: FaithMessage[];
  /** Office／純文字檔已轉成的文字。 */
  documentText?: string;
  /** PDF／影像交由模型原生判讀。 */
  attachment?: FaithAttachment;
};

const str = (v: unknown) =>
  typeof v === "string" && v.trim() ? v.trim() : undefined;
const pickEnumValue = (valid: string[], v: unknown) =>
  typeof v === "string" && valid.includes(v) ? v : undefined;

/** 各段共用的送件組裝：文件文字以 context 傳入，維持 faith 溝通規範。 */
function passRequest(
  instruction: string,
  input: WizardPassInput,
  schema: ResponseSchema,
  extraContext?: string,
  maxOutputTokens = 4096,
  task?: string,
): FaithRequest & { schema: ResponseSchema } {
  const parts: string[] = [];
  if (extraContext?.trim()) parts.push(extraContext.trim());
  if (input.documentText?.trim()) {
    parts.push(
      `以下是使用者上傳文件的文字內容，請據以判讀：\n\n${input.documentText}`,
    );
  }
  return {
    instruction,
    messages: input.messages,
    context: parts.length ? parts.join("\n\n") : undefined,
    attachment: input.attachment,
    maxOutputTokens,
    schema,
    task,
    fallbackPrompt: "請依附件內容判讀。",
  };
}


/**
 * 由本次輸入的契約文字判定領域，組出要注入的知識段落。
 *
 * 只用 documentText —— 附件是 PDF／影像時無法在此讀出文字，
 * 此時不注入領域知識，寧可少給也不要給錯領域的詞彙。
 */
function knowledgeFor(
  input: WizardPassInput,
  briefs: ((
    m: ReturnType<typeof matchDomain>,
    text?: string | null,
  ) => string | null)[],
): string | undefined {
  const match = matchDomain(input.documentText);
  const parts = briefs
    .map((f) => f(match, input.documentText))
    .filter(Boolean) as string[];
  return parts.length ? parts.join("\n\n") : undefined;
}

/** 每段都回傳 reply，讓費思能就該段狀況說一句話。 */
export type PassResult<T> = { reply?: string; data: T };

// 第一段：專案基本資料
const PROFILE_SCHEMA: ResponseSchema = {
  type: "OBJECT",
  properties: {
    reply: S("一兩句繁體中文說明本段判讀狀況"),
    fields: {
      type: "OBJECT",
      properties: {
        code: S("專案編號／契約編號，無法判讀填空字串"),
        name: S("專案名稱"),
        location: S("工程地點"),
        client: S("業主／主辦機關"),
        contractor: S("承包商"),
        supervisor: S("監造單位"),
        budget: S("契約金額（僅數字）"),
        startDate: S("開工日 YYYY-MM-DD"),
        endDate: S("完工日 YYYY-MM-DD"),
        status: { type: "STRING", enum: PROJECT_STATUSES },
        description: S("工程摘要"),
      },
      propertyOrdering: [
        "code",
        "name",
        "location",
        "client",
        "contractor",
        "supervisor",
        "budget",
        "startDate",
        "endDate",
        "status",
        "description",
      ],
    },
  },
  required: ["fields"],
  propertyOrdering: ["reply", "fields"],
};

export async function extractProjectFields(
  input: WizardPassInput,
): Promise<PassResult<ProjectProfileFields>> {
  const raw = await askStructured<{
    reply?: unknown;
    fields?: Record<string, unknown>;
  }>(passRequest(
      AI_WIZARD_PROFILE_PROMPT,
      input,
      PROFILE_SCHEMA,
      undefined,
      // 11 個欄位不多，但思考仍佔四分之一預算
      4096,
      "project-build:profile",
    ));
  if (!raw) throw new FaithError("failed", {
      hint: "未能判讀專案基本資料，請重試。",
      detail: "回覆格式不正確：基本資料",
    });

  const rf = raw.fields ?? {};
  const fields: ProjectProfileFields = {
    code: str(rf.code),
    name: str(rf.name),
    location: str(rf.location),
    client: str(rf.client),
    contractor: str(rf.contractor),
    supervisor: str(rf.supervisor),
    budget:
      rf.budget != null && !Number.isNaN(Number(rf.budget))
        ? Number(rf.budget)
        : undefined,
    startDate: str(rf.startDate),
    endDate: str(rf.endDate),
    status: pickEnumValue(PROJECT_STATUSES, rf.status),
    description: str(rf.description),
  };
  for (const k of Object.keys(fields) as (keyof ProjectProfileFields)[]) {
    if (fields[k] === undefined) delete fields[k];
  }
  return { reply: str(raw.reply), data: fields };
}

// 階段一：契約履約標的（照抄，不推導）
const SCOPE_SCHEMA: ResponseSchema = {
  type: "OBJECT",
  properties: {
    scopeItems: {
      type: "ARRAY",
      description: "契約「履約標的」條所列的工作，依契約順序逐項照抄",
      items: {
        type: "OBJECT",
        properties: {
          code: S("項次編號，如 (一)1、1.2；契約無編號則空字串"),
          title: S("工作項目名稱，照抄契約用語"),
          sourceClause: S("出處條次，如 第二條 履約標的"),
        },
        required: ["title"],
        propertyOrdering: ["code", "title", "sourceClause"],
      },
    },
    reply: S("一兩句繁體中文說明依據哪一條、抄出幾項"),
  },
  required: ["scopeItems"],
  propertyOrdering: ["scopeItems", "reply"],
};

/** 契約「履約標的」條列的一項工作。 */
export type WizardScopeItem = {
  code?: string;
  title: string;
  sourceClause?: string;
};

/**
 * 階段一：逐項讀出契約的履約標的。
 *
 * 獨立成一段的理由：這一段是「抄」，不是「想」。
 * 先前與履約事項的推導混在同一次呼叫，模型既要抄又要推導，
 * 抄到一半就開始編，且輸出長度容易觸頂。
 */
export async function extractScopeItems(
  input: WizardPassInput,
): Promise<PassResult<WizardScopeItem[]>> {
  const raw = await askStructured<{ reply?: unknown; scopeItems?: unknown }>(
    passRequest(
      AI_WIZARD_SCOPE_PROMPT,
      input,
      SCOPE_SCHEMA,
      // 領域詞彙協助辨識專有名詞（如「沉箱」「攔污柵」），避免抄錯字
      knowledgeFor(input, [domainBrief]),
      WIZARD_MAX_TOKENS,
      "project-build:scope",
    ),
  );
  if (!raw) throw new FaithError("failed", {
      hint: "未能讀出契約履約標的，請重試。",
      detail: "回覆格式不正確：履約標的",
    });

  const out: WizardScopeItem[] = [];
  const seen = new Set<string>();
  for (const item of Array.isArray(raw.scopeItems) ? raw.scopeItems : []) {
    if (!item || typeof item !== "object") continue;
    const m = item as Record<string, unknown>;
    const title = str(m.title);
    if (!title || seen.has(title)) continue; // 重複抄錄會讓下游跟著重複
    seen.add(title);
    out.push({
      code: str(m.code),
      title,
      sourceClause: str(m.sourceClause),
    });
  }
  return { reply: str(raw.reply), data: out };
}

// 階段二：工程項目（由契約內文與履約標的規劃）
const PACKAGES_SCHEMA: ResponseSchema = {
  type: "OBJECT",
  properties: {
    packages: {
      type: "ARRAY",
      description: "具體工程項目，依執行順序排序",
      items: {
        type: "OBJECT",
        properties: {
          name: S("工程項目名稱"),
          category: S("類別／工種"),
          description: S("一句話說明範圍"),
          scopeRefs: {
            type: "ARRAY",
            description: "對應的履約標的名稱，須與清單完全一致",
            items: { type: "STRING" },
          },
        },
        required: ["name"],
        propertyOrdering: ["name", "category", "description", "scopeRefs"],
      },
    },
    reply: S("一兩句繁體中文說明規劃依據"),
  },
  required: ["packages"],
  propertyOrdering: ["packages", "reply"],
};

export type WizardWorkPackage = {
  name: string;
  category?: string;
  description?: string;
  /** 對應的履約標的名稱。 */
  scopeRefs: string[];
};

/** 把履約標的清單整理成提示詞用的段落。 */
function scopeListing(scopeItems: WizardScopeItem[]): string | undefined {
  if (scopeItems.length === 0) return undefined;
  return `契約「履約標的」清單（共 ${scopeItems.length} 項）：\n${scopeItems
    .map((s, i) => `${s.code ? `${s.code} ` : `${i + 1}. `}${s.title}`)
    .join("\n")}`;
}

/**
 * 階段二：由契約內文與履約標的規劃具體工程項目。
 *
 * 這一段是「規劃」而非照抄：數條同性質的標的可合併，
 * 一條涵蓋多種工作的標的則拆開，也補上內文提到但標的未明列的必要工作。
 */
export async function planWorkPackages(
  input: WizardPassInput,
  scopeItems: WizardScopeItem[],
): Promise<PassResult<WizardWorkPackage[]>> {
  const raw = await askStructured<{ reply?: unknown; packages?: unknown }>(
    passRequest(
      AI_WIZARD_PACKAGES_PROMPT,
      input,
      PACKAGES_SCHEMA,
      [
        scopeListing(scopeItems),
        knowledgeFor(input, [domainBrief, workItemShapeBrief]),
      ]
        .filter(Boolean)
        .join("\n\n"),
      WIZARD_MAX_TOKENS,
      "project-build:packages",
    ),
  );
  if (!raw) throw new FaithError("failed", {
      hint: "未能規劃工程項目，請重試。",
      detail: "回覆格式不正確：工程項目",
    });

  const validScope = new Set(scopeItems.map((s) => s.title));
  const out: WizardWorkPackage[] = [];
  const seen = new Set<string>();
  for (const item of Array.isArray(raw.packages) ? raw.packages : []) {
    if (!item || typeof item !== "object") continue;
    const m = item as Record<string, unknown>;
    const name = str(m.name);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    // 對應不到清單的參照直接丟棄，避免產生指向不存在標的的關聯
    const refs = Array.isArray(m.scopeRefs)
      ? m.scopeRefs
          .map((r) => str(r))
          .filter((r): r is string => Boolean(r && validScope.has(r)))
      : [];
    out.push({
      name,
      category: str(m.category),
      description: str(m.description),
      scopeRefs: refs,
    });
  }
  return { reply: str(raw.reply), data: out };
}

// 第二段：履約標的 → 履約事項（不含責任分工與契約依據）
//
// scopeItems 刻意排在 obligations 之前：結構化輸出是逐欄生成的，
// 先要模型把「履約標的」條的工作逐項抄出來，再據以推導應辦事項，
// 等於強制它先讀完那一條再作答，而不是憑印象直接產出應辦事項。
const OBLIGATIONS_SCHEMA: ResponseSchema = {
  type: "OBJECT",
  properties: {
    reply: S("一兩句繁體中文說明本段判讀狀況"),
    obligations: {
      type: "ARRAY",
      description: "履約事項，依期限先後排序",
      items: {
        type: "OBJECT",
        properties: {
          code: S("管制編號，無則空字串"),
          title: S("履約事項名稱"),
          scopeRef: S("源自哪一項履約標的，須與清單完全一致；無法對應留空"),
          stage: { type: "STRING", enum: OBLIGATION_STAGES },
          triggerType: { type: "STRING", enum: OBLIGATION_TRIGGERS },
          risk: { type: "STRING", enum: OBLIGATION_RISKS },
          dueDate: S("期限 YYYY-MM-DD"),
          weight: { type: "INTEGER", description: "進度權重，正整數" },
          commissioning: { type: "BOOLEAN", description: "是否計入試運轉就緒度" },
        },
        required: ["title"],
        propertyOrdering: [
          "code",
          "title",
          "stage",
          "triggerType",
          "risk",
          "dueDate",
          "weight",
          "commissioning",
        ],
      },
    },
  },
  required: ["obligations"],
  propertyOrdering: ["obligations", "reply"],
};

export async function extractObligations(
  input: WizardPassInput,
  /** 階段一讀出的履約標的；履約事項一律由此推導。 */
  scopeItems: WizardScopeItem[] = [],
): Promise<PassResult<WizardObligation[]>> {
  // 委託服務契約常有 15-40 項應辦事項，加上履約標的清單，輸出上限需放寬
  const raw = await askStructured<{
    reply?: unknown;
    obligations?: unknown;
  }>(
    passRequest(
      AI_WIZARD_OBLIGATIONS_PROMPT,
      input,
      OBLIGATIONS_SCHEMA,
      [
        scopeListing(scopeItems),
        knowledgeFor(input, [managementPatternBrief]),
      ]
        .filter(Boolean)
        .join("\n\n"),
      // 履約標的清單＋15-40 項應辦事項，加上思考佔用的四分之一預算
      WIZARD_MAX_TOKENS,
      "project-build:obligations",
    ),
  );
  if (!raw) throw new FaithError("failed", {
      hint: "未能推導履約事項，請重試。",
      detail: "回覆格式不正確：履約事項",
    });

  const validScope = new Set(scopeItems.map((x) => x.title));
  const list = Array.isArray(raw.obligations) ? raw.obligations : [];
  const out: WizardObligation[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const m = item as Record<string, unknown>;
    const title = str(m.title);
    if (!title) continue;
    out.push({
      code: str(m.code),
      title,
      stage: pickEnumValue(OBLIGATION_STAGES, m.stage),
      triggerType: pickEnumValue(OBLIGATION_TRIGGERS, m.triggerType),
      risk: pickEnumValue(OBLIGATION_RISKS, m.risk),
      dueDate: str(m.dueDate),
      weight:
        m.weight != null && !Number.isNaN(Number(m.weight))
          ? Math.max(1, Math.round(Number(m.weight)))
          : undefined,
      commissioning: m.commissioning === true,
      // 對應不到清單的參照丟棄，避免產生指向不存在標的的關聯
      scopeRef: validScope.has(str(m.scopeRef) ?? "") ? str(m.scopeRef) : undefined,
    });
  }
  return { reply: str(raw.reply), data: out };
}

// ── 通用表單助手 ────────────────────────────────────────────

/**
 * 依表單規格代填欄位。
 *
 * 與四段式專案建置不同，這裡是通用的單次判讀：schema 由欄位規格產生，
 * 因此新增一張表單只要寫規格，不必再加一支 API 與一段提示詞。
 * 值一律以字串回傳、全部選填，判讀不到就省略 —— 逼模型填 0 或 false
 * 會產出看似有值的假資料，比留空更糟。
 */
export async function extractFormFields(
  spec: FormAssistSpec,
  input: WizardPassInput,
): Promise<PassResult<Record<string, unknown>>> {
  const instruction = [
    `你是「PMIS 智慧監造管理系統」的表單助手，正在協助使用者填寫「${spec.title}」。`,
    spec.purpose,
    "",
    "系統已強制以 JSON 結構回覆。請把判讀到的值放進 values，欄位如下：",
    describeFields(spec.fields),
    "",
    "規則：",
    "- 只填你在使用者提供的文件或描述中確實看到的內容，判讀不到的欄位一律省略。",
    "- 不要為了填滿欄位而推測。填錯的值比留空更難發現。",
    "- 限定選項的欄位只能回傳列出的可選值之一。",
    "- 日期一律 YYYY-MM-DD；文件只寫民國年時請換算為西元年。",
    "- 數字欄位只回數字本身，不含逗號、單位或幣別。",
    "reply 欄位只放給人看的一兩句說明，不要把欄位值重複寫在 reply 裡。",
  ].join("\n");

  const raw = await askStructured<{ reply?: unknown; values?: unknown }>(
    passRequest(
      instruction,
      input,
      buildFieldSchema(spec.fields) as ResponseSchema,
      undefined,
      2048,
      `form-assist:${spec.id}`,
    ),
  );
  if (!raw) throw new FaithError("failed", {
      hint: "未能判讀表單欄位，請重試。",
      detail: "回覆格式不正確：表單欄位",
    });

  const values =
    raw.values && typeof raw.values === "object"
      ? (raw.values as Record<string, unknown>)
      : {};
  return { reply: str(raw.reply), data: values };
}

// 第三段：責任分工與契約依據（對既有事項回填）
const OWNERS_SCHEMA: ResponseSchema = {
  type: "OBJECT",
  properties: {
    reply: S("一兩句繁體中文說明本段判讀狀況"),
    owners: {
      type: "ARRAY",
      description: "各履約事項的責任分工；判讀不到者請省略該項",
      items: {
        type: "OBJECT",
        properties: {
          title: S("履約事項名稱，須與清單完全一致"),
          ownerUnit: S("責任單位"),
          ownerName: S("責任人"),
          contractBasis: S("契約依據條款"),
        },
        required: ["title"],
        propertyOrdering: [
          "title",
          "ownerUnit",
          "ownerName",
          "contractBasis",
        ],
      },
    },
  },
  required: ["owners"],
  propertyOrdering: ["reply", "owners"],
};

export type ObligationOwnerPatch = {
  title: string;
  ownerUnit?: string;
  ownerName?: string;
  contractBasis?: string;
};

export async function extractObligationOwners(
  input: WizardPassInput,
  titles: string[],
): Promise<PassResult<ObligationOwnerPatch[]>> {
  if (titles.length === 0) return { data: [] };

  const listing = titles.map((t, i) => `${i + 1}. ${t}`).join("\n");
  const raw = await askStructured<{ reply?: unknown; owners?: unknown }>(
    passRequest(
      AI_WIZARD_OWNERS_PROMPT,
      input,
      OWNERS_SCHEMA,
      `目前已盤點的履約事項名稱清單（title 必須與此完全一致）：\n${listing}`,
      WIZARD_MAX_TOKENS,
      "project-build:owners",
    ),
  );
  if (!raw) throw new FaithError("failed", {
      hint: "未能判讀責任分工，請重試。",
      detail: "回覆格式不正確：責任分工",
    });

  const valid = new Set(titles.map((t) => t.trim()));
  const list = Array.isArray(raw.owners) ? raw.owners : [];
  const out: ObligationOwnerPatch[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const m = item as Record<string, unknown>;
    const title = str(m.title);
    // 對應不到既有事項的名稱直接丟棄，避免模型自行改寫名稱後產生孤兒資料
    if (!title || !valid.has(title)) continue;
    out.push({
      title,
      ownerUnit: str(m.ownerUnit),
      ownerName: str(m.ownerName),
      contractBasis: str(m.contractBasis),
    });
  }
  return { reply: str(raw.reply), data: out };
}

// 第四段：工程分項
const WORKITEMS_SCHEMA: ResponseSchema = {
  type: "OBJECT",
  properties: {
    reply: S("一兩句繁體中文說明本段判讀狀況"),
    workItems: {
      type: "ARRAY",
      description: "工程分項，依施工順序排序",
      items: {
        type: "OBJECT",
        properties: {
          code: S("分項編號，無則空字串"),
          name: S("工程分項名稱"),
          category: S("工種／類別"),
          workPackage: S("所屬工程項目名稱，須與清單完全一致"),
          obligation: S("所屬履約事項名稱，須與清單一致；無法對應留空"),
          plannedStart: S("預定開始 YYYY-MM-DD"),
          plannedEnd: S("預定完成 YYYY-MM-DD"),
        },
        required: ["name"],
        propertyOrdering: [
          "code",
          "name",
          "category",
          "obligation",
          "plannedStart",
          "plannedEnd",
        ],
      },
    },
  },
  required: ["workItems"],
  propertyOrdering: ["reply", "workItems"],
};

export async function extractWorkItems(
  input: WizardPassInput,
  obligationTitles: string[],
  /** 階段二規劃的工程項目；工程分項由這些項目細分而來。 */
  packages: WizardWorkPackage[] = [],
): Promise<PassResult<WizardWorkItem[]>> {
  const sections: string[] = [];

  // 工程項目放最前面：這是本段的輸入，不是輔助資訊
  if (packages.length > 0) {
    sections.push(
      `工程項目清單（每一項都必須產生對應的工程分項）：\n${packages
        .map(
          (pkg, i) =>
            `${i + 1}. ${pkg.name}${pkg.category ? `［${pkg.category}］` : ""}` +
            `${pkg.description ? `：${pkg.description}` : ""}`,
        )
        .join("\n")}`,
    );
  }
  if (obligationTitles.length > 0) {
    sections.push(
      `可歸屬的履約事項名稱清單（僅供填 obligation 欄位，必須完全一致，否則留空）：\n${obligationTitles
        .map((t, i) => `${i + 1}. ${t}`)
        .join("\n")}`,
    );
  }
  // 分項的組織方式（構造物單元 × 工序）對這一段最關鍵
  const shape = knowledgeFor(input, [workItemShapeBrief, domainBrief]);
  if (shape) sections.push(shape);

  const listing = sections.length > 0 ? sections.join("\n\n") : undefined;

  const raw = await askStructured<{ reply?: unknown; workItems?: unknown }>(
    passRequest(
      AI_WIZARD_WORKITEMS_PROMPT,
      input,
      WORKITEMS_SCHEMA,
      listing,
      WIZARD_MAX_TOKENS,
      "project-build:workItems",
    ),
  );
  if (!raw) throw new FaithError("failed", {
      hint: "未能細分工程分項，請重試。",
      detail: "回覆格式不正確：工程分項",
    });

  const valid = new Set(obligationTitles.map((t) => t.trim()));
  // 工程項目 → 履約標的的對照，供分項繼承來源（可溯源到契約哪一條）
  const scopeOfPackage = new Map(
    packages.map((pkg) => [pkg.name, pkg.scopeRefs[0]]),
  );

  const list = Array.isArray(raw.workItems) ? raw.workItems : [];
  const out: WizardWorkItem[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const w = item as Record<string, unknown>;
    const name = str(w.name);
    if (!name) continue;
    const ob = str(w.obligation);
    const pkg = str(w.workPackage);
    // 對應不到清單的工程項目名稱丟棄，避免產生孤兒分群
    const known = pkg && scopeOfPackage.has(pkg) ? pkg : undefined;
    out.push({
      code: str(w.code),
      name,
      category: str(w.category),
      obligation: ob && valid.has(ob) ? ob : undefined,
      plannedStart: str(w.plannedStart),
      plannedEnd: str(w.plannedEnd),
      workPackage: known,
      // 來源由所屬工程項目繼承，模型不必也不該自行填
      scopeRef: known ? scopeOfPackage.get(known) : undefined,
    });
  }
  return { reply: str(raw.reply), data: out };
}

/** 供編排層在四段結束後補齊分項編號與起訖日。 */
export function finalizeWorkItems(
  fields: ProjectProfileFields,
  obligations: WizardObligation[],
  workItems: WizardWorkItem[],
): WizardWorkItem[] {
  return completeDraft(fields, obligations, workItems);
}

// ── 預警規則：以自然語言草擬規則設定 ─────────────────────────
export type DraftedAlertRule = {
  name?: string;
  kind?: string;
  module?: string;
  severity?: string;
  fixedDate?: string;
  anchor?: string;
  offsetDays?: number;
  metric?: string;
  operator?: string;
  threshold?: number;
  unit?: string;
  action?: string;
  notify?: string;
  description?: string;
};

const ALERT_RULE_SCHEMA: ResponseSchema = {
  type: "OBJECT",
  properties: {
    reply: { type: "STRING", description: "給使用者的繁體中文簡短說明（Markdown）" },
    rule: {
      type: "OBJECT",
      properties: {
        name: { type: "STRING", description: "規則名稱（10 字內）" },
        kind: {
          type: "STRING",
          enum: ["FIXED_DATE", "RELATIVE_DATE", "CONDITION"],
        },
        module: { type: "STRING", description: "綁定模組路由，如 /schedule" },
        severity: { type: "STRING", enum: ["INFO", "WARNING", "CRITICAL"] },
        fixedDate: { type: "STRING", description: "YYYY-MM-DD，非固定日期規則填空字串" },
        anchor: {
          type: "STRING",
          enum: [
            "CONTRACT_END",
            "OBLIGATION_DUE",
            "DOCUMENT_DUE",
            "INSPECTION_DATE",
            "DEFECT_DUE",
          ],
        },
        offsetDays: { type: "INTEGER", description: "提前天數，非相對日期規則填 0" },
        metric: {
          type: "STRING",
          enum: [
            "SCHEDULE_LAG",
            "INSPECTION_FAILED",
            "DEFECT_OVERDUE",
            "SUBMITTAL_PENDING",
            "DEVICE_OFFLINE_MINUTES",
            "BUDGET_USAGE",
          ],
        },
        operator: { type: "STRING", enum: ["GTE", "LTE", "GT", "LT", "EQ"] },
        threshold: { type: "NUMBER", description: "門檻值，非條件規則填 0" },
        unit: { type: "STRING", description: "單位，如 %、件、分鐘" },
        action: { type: "STRING", description: "命中後的具體行動" },
        notify: { type: "STRING", description: "通知對象，逗號分隔" },
        description: { type: "STRING", description: "規則說明一句話" },
      },
      propertyOrdering: [
        "name",
        "kind",
        "module",
        "severity",
        "fixedDate",
        "anchor",
        "offsetDays",
        "metric",
        "operator",
        "threshold",
        "unit",
        "action",
        "notify",
        "description",
      ],
    },
  },
  required: ["reply", "rule"],
  propertyOrdering: ["reply", "rule"],
};

/**
 * Info: 依使用者的自然語言描述，草擬一條預警規則設定。
 * 僅回傳建議值，實際仍由使用者於表單確認後才儲存。
 */
export async function draftAlertRule(
  instruction: string,
): Promise<{ reply: string; rule: DraftedAlertRule }> {
  const raw = await askStructured<{
    reply?: unknown;
    rule?: Record<string, unknown>;
  }>({
    instruction: AI_ALERT_RULE_PROMPT,
    messages: [{ role: "user", text: instruction }],
    maxOutputTokens: 2048,
    schema: ALERT_RULE_SCHEMA,
  });

  if (!raw) {
    return {
      reply: "抱歉，這次的回覆格式不正確，請再描述一次。",
      rule: {},
    };
  }

  const r = (raw.rule ?? {}) as Record<string, unknown>;
  const str = (v: unknown) =>
    typeof v === "string" && v.trim() ? v.trim() : undefined;
  const numOr = (v: unknown) =>
    v != null && v !== "" && !Number.isNaN(Number(v)) ? Number(v) : undefined;

  const rule: DraftedAlertRule = {
    name: str(r.name),
    kind: str(r.kind),
    module: str(r.module),
    severity: str(r.severity),
    fixedDate: str(r.fixedDate),
    anchor: str(r.anchor),
    offsetDays: numOr(r.offsetDays),
    metric: str(r.metric),
    operator: str(r.operator),
    threshold: numOr(r.threshold),
    unit: str(r.unit),
    action: str(r.action),
    notify: str(r.notify),
    description: str(r.description),
  };
  // 只保留該規則類型相關的欄位，避免 0／空值污染表單其他分頁
  if (rule.kind !== "FIXED_DATE") delete rule.fixedDate;
  if (rule.kind !== "RELATIVE_DATE") {
    delete rule.anchor;
    delete rule.offsetDays;
  }
  if (rule.kind !== "CONDITION") {
    delete rule.metric;
    delete rule.operator;
    delete rule.threshold;
    delete rule.unit;
  }
  for (const k of Object.keys(rule) as (keyof DraftedAlertRule)[]) {
    if (rule[k] === undefined) delete rule[k];
  }

  return {
    reply: str(raw.reply) ?? "已依描述草擬規則，請確認後儲存。",
    rule,
  };
}

// Info: (20260721 - Luphia) 判讀工地照片（base64）之工安/品質疑慮
export async function analyzeImage(
  base64: string,
  mimeType: string,
): Promise<string> {
  if (!storage.isAllowed(mimeType) || mimeType === "application/pdf") {
    throw new FaithError("failed", { hint: "僅支援 PNG / JPG 影像判讀。" });
  }
  return ask({
    instruction: AI_IMAGE_ANALYSIS_PROMPT,
    context: AI_IMAGE_ANALYSIS_PROMPT,
    attachment: { mimeType, data: base64 },
    maxOutputTokens: 1536,
  });
}
