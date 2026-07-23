"use server";

import { revalidatePath } from "next/cache";

import * as documentsService from "@/service/documents.service";
import { requireUser } from "@/service/auth.service";
import { currentUserCanEdit } from "@/service/access.service";

function field(formData: FormData, key: string): string | undefined {
  const v = formData.get(key);
  return typeof v === "string" ? v : undefined;
}

async function actor() {
  const user = await requireUser();
  return { id: user.id, role: user.role, name: user.name };
}

export async function uploadDocumentAction(formData: FormData) {
  if (!(await currentUserCanEdit("/documents"))) return;
  const projectId = field(formData, "projectId");
  const file = formData.get("file");
  if (!projectId || !(file instanceof File) || file.size === 0) return;
  await documentsService.uploadDocument(
    {
      projectId,
      title: field(formData, "title"),
      category: field(formData, "category"),
    },
    file,
    await actor(),
  );
  revalidatePath("/documents");
}

export async function deleteDocumentAction(id: string) {
  if (!(await currentUserCanEdit("/documents"))) return;
  await documentsService.deleteDocument(id, await actor());
  revalidatePath("/documents");
}
