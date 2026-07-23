"use server";

import { revalidatePath } from "next/cache";

import * as todoService from "@/service/todo.service";
import { requireUser } from "@/service/auth.service";
import { currentUserCanEdit } from "@/service/access.service";

// Info: (20260721 - Luphia) 標記待辦為已讀
export async function markReadAction(id: string) {
  await requireUser();
  if (!(await currentUserCanEdit("/todos"))) return;
  await todoService.markRead(id);
  revalidatePath("/todos");
}

// Info: (20260721 - Luphia) 變更待辦狀態
export async function setTodoStatusAction(id: string, status: string) {
  await requireUser();
  if (!(await currentUserCanEdit("/todos"))) return;
  await todoService.setStatus(id, status);
  revalidatePath("/todos");
}
