import {
  GEMINI_ENDPOINT,
  DEFAULT_AI_MODEL,
  AI_SYSTEM_PROMPT,
  AI_DOC_ANALYSIS_PROMPT,
  AI_IMAGE_ANALYSIS_PROMPT,
} from "@/constant/ai";
import * as docRepo from "@/repository/approvalDocument.repository";
import * as storage from "@/service/storage.service";

export type ChatMessage = { role: "user" | "assistant"; text: string };

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
      // ignore
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

/** Multi-turn chat used by the AI panel. */
export async function chat(messages: ChatMessage[]): Promise<string> {
  const contents: GeminiContent[] = messages
    .filter((m) => m.text.trim().length > 0)
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.text }],
    }));
  if (contents.length === 0) throw new Error("訊息內容為空。");
  return callGemini(contents, AI_SYSTEM_PROMPT);
}

/** Analyse an approval attachment (PDF/image) and return a Markdown summary. */
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

/** Analyse a site photo (base64) for safety/quality issues. */
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
