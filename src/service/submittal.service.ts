import * as submittalRepo from "@/repository/submittal.repository";

export function listSubmittals() {
  return submittalRepo.listWithProject();
}
