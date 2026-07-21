import * as ehsRepo from "@/repository/ehs.repository";

export function listEhsAudits() {
  return ehsRepo.listWithProject();
}
