import * as todoRepo from "@/repository/todo.repository";

export function listTodos() {
  return todoRepo.listWithProject();
}
