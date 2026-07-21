import * as submittalRepo from "@/repository/submittal.repository";

export function listSubmittals(projectId?: string) {
  return submittalRepo.listWithProject(projectId);
}
