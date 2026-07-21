import * as todoRepo from "@/repository/todo.repository";
import type { TodoStatus } from "@/generated/prisma/enums";

export function listTodos() {
  return todoRepo.listWithProject();
}

// Info: (20260721 - Luphia) 標記已讀
export async function markRead(id: string) {
  await todoRepo.markRead(id);
}

const VALID: TodoStatus[] = ["PENDING", "IN_PROGRESS", "DONE", "OVERDUE"];

// Info: (20260721 - Luphia) 變更待辦狀態（已處理 = DONE）
export async function setStatus(id: string, status: string) {
  const next: TodoStatus = VALID.includes(status as TodoStatus)
    ? (status as TodoStatus)
    : "PENDING";
  await todoRepo.setStatus(id, next);
}
