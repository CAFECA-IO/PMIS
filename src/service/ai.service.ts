import {
  GEMINI_ENDPOINT,
  DEFAULT_AI_MODEL,
  AI_SYSTEM_PROMPT,
  AI_DOC_ANALYSIS_PROMPT,
  AI_IMAGE_ANALYSIS_PROMPT,
  AI_SCREEN_FOCUS_PROMPT,
  AI_REPORT_PROMPT,
  AI_VOUCHER_PROMPT,
} from "@/constant/ai";
import * as docRepo from "@/repository/approvalDocument.repository";
import * as storage from "@/service/storage.service";

export type ChatMessage = { role: "user" | "assistant"; text: string };
export type ChatAttachment = { mimeType: string; data: string; name?: string };

type Part = { text: string } | { inlineData: { mimeType: string; data: string } };
type GeminiContent = { role: "user" | "model"; parts: Part[] };

function getConfig() {
  const apiKey = process.env.AI_KEY;
  if (!apiKey) {
    throw new Error("尚未設定 AI_KEY，請於 .env 填入 Gemini API 金鑰。");
  }
  return { apiKey, model: process.env.AI_MODEL || DEFAULT_AI_MODEL };
}

async function callGemini(
  contents: GeminiContent[],
  systemPrompt: string,
  maxOutputTokens = 1024,
): Promise<string> {
  const { apiKey, model } = getConfig();

  const response = await fetch(`${GEMINI_ENDPOINT}/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents,
      generationConfig: { temperature: 0.4, maxOutputTokens },
    }),
  });

  if (!response.ok) {
    let detail = "";
    try {
      const err = await response.json();
      detail = err?.error?.message ?? "";
    } catch {
      // Info: (20260721 - Luphia) 忽略解析錯誤
    }
    throw new Error(
      `Gemini API 錯誤（${response.status}）${detail ? `：${detail}` : ""}`,
    );
  }

  const data = (await response.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text =
    data.candidates?.[0]?.content?.parts
      ?.map((p) => p.text ?? "")
      .join("")
      .trim() ?? "";
  return text || "（AI 沒有回覆內容）";
}

// Info: (20260721 - Luphia) AI 面板使用的多輪對話，可帶一個 inline 附件
export async function chat(
  messages: ChatMessage[],
  attachment?: ChatAttachment,
): Promise<string> {
  const contents: GeminiContent[] = messages
    .filter((m) => m.text.trim().length > 0)
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.text }],
    }));

  if (attachment) {
    // Info: (20260721 - Luphia) 不限制上傳格式；以檔案 MIME 類型（若缺則用通用二進位）直接送交模型
    const imgPart: Part = {
      inlineData: {
        mimeType: attachment.mimeType || "application/octet-stream",
        data: attachment.data,
      },
    };
    const last = contents[contents.length - 1];
    if (last && last.role === "user") {
      last.parts.push(imgPart);
    } else {
      contents.push({
        role: "user",
        parts: [imgPart, { text: "請分析這個附件，並以繁體中文摘要重點。" }],
      });
    }
  }

  if (contents.length === 0) throw new Error("訊息內容為空。");
  return callGemini(contents, AI_SYSTEM_PROMPT, attachment ? 1536 : 1024);
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
    const text = await callGemini(
      [{ role: "user", parts: [{ text: prompt }] }],
      AI_SCREEN_FOCUS_PROMPT,
      128,
    );
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
    `建議：持續追蹤未結案缺失與落後里程碑，並確認送審與查驗進度符合履約時程。`;
  try {
    getConfig();
    const text = await callGemini(
      [{ role: "user", parts: [{ text: `報告類型：${typeLabel}\n數據：\n${factsText}` }] }],
      AI_REPORT_PROMPT,
      512,
    );
    return text && text !== "（AI 沒有回覆內容）" ? text : fallback;
  } catch {
    return fallback;
  }
}

// Info: (20260721 - Luphia) 判讀簽核附件（PDF/影像）並回傳 Markdown 摘要
export async function analyzeAttachment(attachmentId: string): Promise<string> {
  const att = await docRepo.findAttachment(attachmentId);
  if (!att) throw new Error("找不到附件。");
  const buffer = await storage.read(att.storedName);
  if (!buffer) throw new Error("找不到檔案內容。");

  return callGemini(
    [
      {
        role: "user",
        parts: [
          { inlineData: { mimeType: att.mimeType, data: buffer.toString("base64") } },
          { text: AI_DOC_ANALYSIS_PROMPT },
        ],
      },
    ],
    AI_DOC_ANALYSIS_PROMPT,
    1536,
  );
}

export type ExtractedVoucher = {
  date: string;
  direction: "INCOME" | "EXPENSE";
  category: string;
  amount: number;
  counterparty: string;
  summary: string;
};

// Info: (20260721 - Luphia) 判讀憑證/發票並擷取結構化會計傳票欄位
export async function extractVoucher(
  base64: string,
  mimeType: string,
): Promise<ExtractedVoucher> {
  const text = await callGemini(
    [
      {
        role: "user",
        parts: [
          { inlineData: { mimeType: mimeType || "application/octet-stream", data: base64 } },
          { text: "請依系統指示判讀此憑證並僅輸出 JSON。" },
        ],
      },
    ],
    AI_VOUCHER_PROMPT,
    512,
  );

  // Info: (20260721 - Luphia) 去除可能的 markdown 圍欄後解析 JSON
  const cleaned = text
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("無法從憑證擷取結構化資料。");
  const raw = JSON.parse(match[0]) as Partial<ExtractedVoucher>;

  return {
    date: typeof raw.date === "string" ? raw.date : "",
    direction: raw.direction === "INCOME" ? "INCOME" : "EXPENSE",
    category: typeof raw.category === "string" ? raw.category : "",
    amount: Number(raw.amount) || 0,
    counterparty: typeof raw.counterparty === "string" ? raw.counterparty : "",
    summary: typeof raw.summary === "string" ? raw.summary : "",
  };
}

// Info: (20260721 - Luphia) 判讀工地照片（base64）之工安/品質疑慮
export async function analyzeImage(
  base64: string,
  mimeType: string,
): Promise<string> {
  if (!storage.isAllowed(mimeType) || mimeType === "application/pdf") {
    throw new Error("僅支援 PNG / JPG 影像判讀。");
  }
  return callGemini(
    [
      {
        role: "user",
        parts: [
          { inlineData: { mimeType, data: base64 } },
          { text: AI_IMAGE_ANALYSIS_PROMPT },
        ],
      },
    ],
    AI_IMAGE_ANALYSIS_PROMPT,
    1536,
  );
}
