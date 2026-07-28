import * as obligationRepo from "@/repository/obligation.repository";
import * as focusRepo from "@/repository/screenFocus.repository";
import { canSeeAllProjects } from "@/lib/auth";
import type { Viewer } from "@/service/project.service";
import {
  filterObligations,
  sortObligations,
  summarizeObligations,
  type ObligationFilter,
  type ObligationRow,
  type ObligationStats,
} from "./obligation-view";
import type {
  ObligationRisk,
  ObligationStage,
  ObligationStatus,
  ObligationTrigger,
} from "@/constant/obligation";

/**
 * 履約事項的讀取流程：先依可存取專案取資料，再交由純函式
 * （obligation-view）篩選、統計與排序，UI 只負責呈現。
 */

export type ObligationListResult = {
  rows: ObligationRow[];
  /** 統計卡以「篩選前」的全體為母數，讓數字不隨篩選跳動。 */
  stats: ObligationStats;
  total: number;
};

const iso = (d: Date | null) => (d ? d.toISOString() : null);

export async function listObligations(
  viewer: Viewer,
  projectId?: string,
  filter: ObligationFilter = {},
): Promise<ObligationListResult> {
  // 非管理者僅能看到自己被指派的專案
  const allowed = await focusRepo.accessibleProjectIds(
    canSeeAllProjects(viewer.role),
    viewer.id,
  );
  // 指定專案時取交集，避免以 URL 參數越權讀取他人專案
  const scope =
    projectId && projectId !== "all"
      ? allowed.filter((id) => id === projectId)
      : allowed;

  const raw = await obligationRepo.listForView(scope);
  const rows: ObligationRow[] = raw.map((r) => ({
      id: r.id,
      code: r.code,
      title: r.title,
      stage: r.stage as ObligationStage,
      risk: r.risk as ObligationRisk,
      triggerType: r.triggerType as ObligationTrigger,
      status: r.status as ObligationStatus,
      dueDate: iso(r.dueDate),
      actualDate: iso(r.actualDate),
      ownerUnit: r.ownerUnit,
      ownerName: r.ownerName,
      contractBasis: r.contractBasis,
    projectName: r.project?.name ?? null,
  }));

  return {
    rows: sortObligations(filterObligations(rows, filter)),
    stats: summarizeObligations(rows),
    total: rows.length,
  };
}
