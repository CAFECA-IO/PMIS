import * as projectRepo from "@/repository/project.repository";

/** Projects that have work items, for the schedule/progress view. */
export function listSchedule() {
  return projectRepo.listWithWorkItems();
}
