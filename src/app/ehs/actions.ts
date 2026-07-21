"use server";

import * as ai from "@/service/ai.service";

export async function analyzeImageAction(
  base64: string,
  mimeType: string,
): Promise<{ text?: string; error?: string }> {
  try {
    const text = await ai.analyzeImage(base64, mimeType);
    return { text };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "AI 影像判讀失敗" };
  }
}
