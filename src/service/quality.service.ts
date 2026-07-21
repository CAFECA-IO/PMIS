import * as inspectionRepo from "@/repository/inspection.repository";
import * as defectRepo from "@/repository/defect.repository";

export async function getQuality() {
  const [inspections, defects] = await Promise.all([
    inspectionRepo.listWithRelations(),
    defectRepo.listWithProject(),
  ]);
  return { inspections, defects };
}
