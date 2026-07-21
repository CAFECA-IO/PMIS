"use server";

import { revalidatePath } from "next/cache";

import * as ai from "@/service/ai.service";
import * as ehsService from "@/service/ehs.service";
import { requireUser } from "@/service/auth.service";

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

function field(formData: FormData, key: string): string | undefined {
  const v = formData.get(key);
  return typeof v === "string" ? v : undefined;
}

async function actor() {
  const user = await requireUser();
  return { id: user.id, name: user.name, role: user.role };
}

// Info: (20260721 - Luphia) 手動新增環安衛稽核紀錄
export async function createEhsAction(formData: FormData) {
  const projectId = field(formData, "projectId");
  if (!projectId) return;
  await ehsService.addAudit(
    {
      projectId,
      type: field(formData, "type"),
      auditedAt: field(formData, "auditedAt"),
      inspector: field(formData, "inspector"),
      location: field(formData, "location"),
      result: field(formData, "result"),
      findings: field(formData, "findings"),
      dueDate: field(formData, "dueDate"),
    },
    await actor(),
  );
  revalidatePath("/ehs");
}

// Info: (20260721 - Luphia) 快速修改稽核結果
export async function setEhsResultAction(id: string, result: string) {
  await ehsService.setResult(id, result, await actor());
  revalidatePath("/ehs");
}

// Info: (20260721 - Luphia) 新增追蹤紀錄
export async function addEhsNoteAction(formData: FormData) {
  const auditId = field(formData, "auditId");
  const body = field(formData, "body");
  if (!auditId || !body) return;
  await ehsService.addNote(auditId, body, await actor());
  revalidatePath("/ehs");
}

// Info: (20260721 - Luphia) 上傳／拍攝文件
export async function uploadEhsFileAction(formData: FormData) {
  const auditId = field(formData, "auditId");
  const file = formData.get("file");
  if (!auditId || !(file instanceof File) || file.size === 0) return;
  await ehsService.addAttachment(auditId, file, await actor());
  revalidatePath("/ehs");
}
