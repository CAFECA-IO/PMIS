import * as ehsRepo from "@/repository/ehs.repository";

export function listEhsAudits(projectId?: string) {
  return ehsRepo.listWithProject(projectId);
}
