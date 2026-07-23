"use server";

import { revalidatePath } from "next/cache";

import * as gisService from "@/service/gis.service";
import * as ai from "@/service/ai.service";
import { requireUser } from "@/service/auth.service";
import { currentUserCanEdit } from "@/service/access.service";

async function actor() {
  const user = await requireUser();
  return { id: user.id, role: user.role };
}

export type AddFeaturePayload = {
  projectId: string;
  name: string;
  type: string;
  geojson: string;
  color?: string;
  note?: string;
  linkModule?: string;
  linkId?: string;
};

export async function addFeatureAction(
  payload: AddFeaturePayload,
): Promise<{ ok: boolean }> {
  if (!(await currentUserCanEdit("/gis"))) return { ok: false };
  const ok = await gisService.addFeature(payload, await actor());
  if (ok) revalidatePath("/gis");
  return { ok };
}

export async function deleteFeatureAction(id: string): Promise<{ ok: boolean }> {
  if (!(await currentUserCanEdit("/gis"))) return { ok: false };
  const ok = await gisService.deleteFeature(id, await actor());
  if (ok) revalidatePath("/gis");
  return { ok };
}

export async function setProjectLocationAction(
  projectId: string,
  lat: number,
  lng: number,
): Promise<{ ok: boolean }> {
  if (!(await currentUserCanEdit("/gis"))) return { ok: false };
  const ok = await gisService.setProjectLocation(projectId, lat, lng, await actor());
  if (ok) revalidatePath("/gis");
  return { ok };
}

export async function geocodeProjectAction(
  projectId: string,
): Promise<{ ok: boolean; lat?: number; lng?: number; message?: string }> {
  if (!(await currentUserCanEdit("/gis")))
    return { ok: false, message: "權限不足，無法編輯此模組。" };
  const result = await gisService.geocodeProject(projectId, await actor());
  if (!result) {
    return {
      ok: false,
      message: "未設定 TGOS 金鑰或定位失敗，請改用地圖點選設定工地位置。",
    };
  }
  revalidatePath("/gis");
  return { ok: true, ...result };
}

/** 費思 AI 依周邊風險與現場狀態產生工地簡報；AI 不可用時回退為規則式摘要。 */
export async function interpretRiskAction(
  projectId: string,
): Promise<{ text: string; ai: boolean }> {
  const user = await requireUser();
  const risk = await gisService.getSiteRisk(projectId, {
    id: user.id,
    role: user.role,
  });
  if (!risk) return { text: "無權限或查無專案。", ai: false };

  const facts = gisService.buildRiskBriefingText(risk);
  try {
    const prompt =
      `你是工地監造顧問。以下為某工地的周邊圖資判讀與現場模組狀態，` +
      `請用繁體中文、條列 3-5 點，給出開工前應注意事項與建議（務實、可執行）：\n\n${facts}`;
    const text = await ai.chat([{ role: "user", text: prompt }]);
    if (text && text !== "（AI 沒有回覆內容）") return { text, ai: true };
    return { text: facts, ai: false };
  } catch {
    return { text: facts, ai: false };
  }
}
