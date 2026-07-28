"use server";

import { revalidatePath } from "next/cache";

import * as fileManager from "@/service/fileManager.service";
import { requireUser } from "@/service/auth.service";
import { currentUserCanEdit } from "@/service/access.service";

/** 檔案管理的變更操作。上傳走 route handler（不受 server action 主體上限限制）。 */

async function editor() {
  const user = await requireUser();
  return { id: user.id, role: user.role };
}

export async function createFolderAction(
  projectId: string,
  parentId: string | null,
  name: string,
) {
  if (!(await currentUserCanEdit("/documents"))) {
    return { ok: false as const, error: "權限不足。" };
  }
  const result = await fileManager.createFolder(
    projectId,
    parentId,
    name,
    await editor(),
  );
  if (result.ok) revalidatePath("/documents");
  return result;
}

export async function deleteFolderAction(projectId: string, folderId: string) {
  if (!(await currentUserCanEdit("/documents"))) {
    return { ok: false as const, error: "權限不足。" };
  }
  const result = await fileManager.deleteFolder(
    projectId,
    folderId,
    await editor(),
  );
  if (result.ok) revalidatePath("/documents");
  return result;
}

export async function deleteFileAction(projectId: string, fileId: string) {
  if (!(await currentUserCanEdit("/documents"))) {
    return { ok: false as const, error: "權限不足。" };
  }
  const result = await fileManager.deleteFile(
    projectId,
    fileId,
    await editor(),
  );
  if (result.ok) revalidatePath("/documents");
  return result;
}
