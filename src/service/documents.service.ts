import * as mediaRepo from "@/repository/media.repository";

export async function getDocuments() {
  const [media, reports] = await Promise.all([
    mediaRepo.listAssets(),
    mediaRepo.listReports(),
  ]);
  return { media, reports };
}
