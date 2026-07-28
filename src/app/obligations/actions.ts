"use server";

import { revalidatePath } from "next/cache";

import * as projectService from "@/service/project.service";
import { currentUserCanEdit } from "@/service/access.service";

/** 表格上的「完成」：寫入實際完成日並轉為 DONE。 */
export async function completeObligationAction(id: string) {
  if (!(await currentUserCanEdit("/obligations"))) return;
  await projectService.completeObligation(id);
  revalidatePath("/obligations");
  revalidatePath("/projects");
  revalidatePath("/schedule");
  revalidatePath("/");
}
