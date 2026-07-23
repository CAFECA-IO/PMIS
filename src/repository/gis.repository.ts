import { prisma } from "./client";

/**
 * Info: (20260722)
 * PMIS-12 GIS 地圖資料存取層。
 *
 * 因本模組於離線沙箱環境無法重新產生 Prisma Client（schema-engine 需下載），
 * 故 GisFeature / GisLayerSeed 以 raw SQL 存取；schema.prisma 仍保留正式模型定義，
 * 開發者於本機執行 `prisma db push` / `db:reset` 後即與此一致。
 */

export type GisLayer = {
  id: string;
  category: string;
  title: string;
  source: string;
  wmtsCode: string | null;
  format: string;
  year: number;
  color: string | null;
  opacity: number;
  sortOrder: number;
  isBase: boolean;
  isDefault: boolean;
  filePath: string | null;
};

export type GisFeatureRow = {
  id: string;
  projectId: string;
  name: string;
  type: string;
  geojson: string;
  color: string | null;
  note: string | null;
  linkModule: string | null;
  linkId: string | null;
  visible: boolean;
};

export type ProjectPin = {
  id: string;
  code: string;
  name: string;
  location: string | null;
  lat: number | null;
  lng: number | null;
};

type RawLayer = Omit<GisLayer, "isBase" | "isDefault"> & {
  isBase: number | boolean;
  isDefault: number | boolean;
};

type RawFeature = Omit<GisFeatureRow, "visible"> & { visible: number | boolean };

const bool = (v: number | boolean): boolean => v === true || v === 1;

export async function listLayers(): Promise<GisLayer[]> {
  const rows = await prisma.$queryRawUnsafe<RawLayer[]>(
    `SELECT "id","category","title","source","wmtsCode","format","year","color","opacity","sortOrder","isBase","isDefault","filePath"
     FROM "GisLayerSeed" WHERE "active" = 1 ORDER BY "sortOrder" ASC, "title" ASC`,
  );
  return rows.map((r) => ({ ...r, isBase: bool(r.isBase), isDefault: bool(r.isDefault) }));
}

export async function listFeatures(projectId: string): Promise<GisFeatureRow[]> {
  const rows = await prisma.$queryRawUnsafe<RawFeature[]>(
    `SELECT "id","projectId","name","type","geojson","color","note","linkModule","linkId","visible"
     FROM "GisFeature" WHERE "projectId" = ? AND "deletedAt" IS NULL ORDER BY "createdAt" ASC`,
    projectId,
  );
  return rows.map((r) => ({ ...r, visible: bool(r.visible) }));
}

export type CreateFeatureData = {
  id: string;
  projectId: string;
  name: string;
  type: string;
  geojson: string;
  color?: string | null;
  note?: string | null;
  linkModule?: string | null;
  linkId?: string | null;
  createdBy?: string | null;
};

export async function createFeature(data: CreateFeatureData): Promise<void> {
  await prisma.$executeRawUnsafe(
    `INSERT INTO "GisFeature"
       ("id","projectId","name","type","geojson","color","note","linkModule","linkId","visible","createdBy","updatedAt")
     VALUES (?,?,?,?,?,?,?,?,?,1,?,datetime('now'))`,
    data.id,
    data.projectId,
    data.name,
    data.type,
    data.geojson,
    data.color ?? null,
    data.note ?? null,
    data.linkModule ?? null,
    data.linkId ?? null,
    data.createdBy ?? null,
  );
}

export async function softDeleteFeature(id: string): Promise<void> {
  await prisma.$executeRawUnsafe(
    `UPDATE "GisFeature" SET "deletedAt" = datetime('now') WHERE "id" = ?`,
    id,
  );
}

export async function getFeatureProjectId(id: string): Promise<string | null> {
  const rows = await prisma.$queryRawUnsafe<{ projectId: string }[]>(
    `SELECT "projectId" FROM "GisFeature" WHERE "id" = ? AND "deletedAt" IS NULL LIMIT 1`,
    id,
  );
  return rows[0]?.projectId ?? null;
}

export async function setProjectLatLng(
  projectId: string,
  lat: number,
  lng: number,
): Promise<void> {
  await prisma.$executeRawUnsafe(
    `UPDATE "Project" SET "lat" = ?, "lng" = ? WHERE "id" = ?`,
    lat,
    lng,
    projectId,
  );
}

/** 專案座標（供地圖定位）；lat/lng 為 raw SQL 讀取，避免依賴需重新產生的 Prisma model。 */
export async function listProjectPins(projectIds?: string[]): Promise<ProjectPin[]> {
  if (projectIds && projectIds.length === 0) return [];
  let sql = `SELECT "id","code","name","location","lat","lng" FROM "Project" WHERE "deletedAt" IS NULL`;
  const params: unknown[] = [];
  if (projectIds) {
    sql += ` AND "id" IN (${projectIds.map(() => "?").join(",")})`;
    params.push(...projectIds);
  }
  sql += ` ORDER BY "createdAt" ASC`;
  return prisma.$queryRawUnsafe<ProjectPin[]>(sql, ...params);
}
