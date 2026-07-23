import fs from "node:fs";
import path from "node:path";

import * as gisRepo from "@/repository/gis.repository";
import * as memberRepo from "@/repository/projectMember.repository";
import * as defectRepo from "@/repository/defect.repository";
import * as ehsRepo from "@/repository/ehs.repository";
import * as reminderRepo from "@/repository/reminder.repository";
import * as projectService from "@/service/project.service";
import { canSeeAllProjects } from "@/lib/auth";
import {
  pointInGeometry,
  distanceToGeometry,
  type Position,
  type Geometry,
} from "@/lib/geo";
import type { AccountRole } from "@/generated/prisma/enums";

export type Actor = { id: string; role: AccountRole };

export const FEATURE_TYPES = ["MARKER", "ROUTE", "AREA"] as const;
export type FeatureType = (typeof FEATURE_TYPES)[number];

async function canAccess(projectId: string, actor: Actor): Promise<boolean> {
  if (canSeeAllProjects(actor.role)) return true;
  return Boolean(await memberRepo.exists(projectId, actor.id));
}

export function listLayers() {
  return gisRepo.listLayers();
}

export type MapData = {
  pins: gisRepo.ProjectPin[];
  features: gisRepo.GisFeatureRow[];
  selectedProjectId?: string;
};

/** 依檢視者可見專案彙整地圖資料（座標 pin + 選定專案的自訂圖徵）。 */
export async function getMapData(
  viewer: projectService.Viewer,
  selectedProjectId?: string,
): Promise<MapData> {
  const allowed = await projectService.listProjects(viewer);
  const allowedIds = allowed.map((p) => p.id);
  const pins = await gisRepo.listProjectPins(allowedIds);

  const selected =
    selectedProjectId && allowedIds.includes(selectedProjectId)
      ? selectedProjectId
      : undefined;
  const features = selected ? await gisRepo.listFeatures(selected) : [];
  return { pins, features, selectedProjectId: selected };
}

function makeId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export const LINK_MODULES = ["DEFECT", "EHS"] as const;
export type LinkModule = (typeof LINK_MODULES)[number];

export type AddFeatureInput = {
  projectId: string;
  name: string;
  type: string;
  geojson: string;
  color?: string;
  note?: string;
  linkModule?: string;
  linkId?: string;
};

/** 新增專案自訂圖徵（點/線/面）。回傳是否成功。 */
export async function addFeature(
  input: AddFeatureInput,
  actor: Actor,
): Promise<boolean> {
  if (!input.projectId || !input.name?.trim() || !input.geojson) return false;
  if (!(await canAccess(input.projectId, actor))) return false;

  const type = (FEATURE_TYPES as readonly string[]).includes(input.type)
    ? (input.type as FeatureType)
    : "MARKER";

  // Info: 驗證 geojson 幾何格式
  try {
    const geom = JSON.parse(input.geojson) as { type?: string; coordinates?: unknown };
    if (!geom || typeof geom.type !== "string" || geom.coordinates == null) return false;
  } catch {
    return false;
  }

  const linkModule = (LINK_MODULES as readonly string[]).includes(
    input.linkModule ?? "",
  )
    ? (input.linkModule as LinkModule)
    : null;

  await gisRepo.createFeature({
    id: makeId("gf"),
    projectId: input.projectId,
    name: input.name.trim(),
    type,
    geojson: input.geojson,
    color: input.color?.trim() || null,
    note: input.note?.trim() || null,
    linkModule,
    linkId: linkModule ? input.linkId?.trim() || null : null,
    createdBy: actor.id,
  });
  return true;
}

export type LinkTarget = { id: string; label: string };
export type LinkTargets = { defects: LinkTarget[]; ehs: LinkTarget[] };

/** 可供圖徵連結的專案項目（缺失 / 環安衛稽核）。 */
export async function listLinkTargets(
  projectId: string,
  viewer: projectService.Viewer,
): Promise<LinkTargets> {
  if (!(await canAccess(projectId, { id: viewer.id, role: viewer.role }))) {
    return { defects: [], ehs: [] };
  }
  const [defects, audits] = await Promise.all([
    defectRepo.listWithProject(projectId),
    ehsRepo.listWithProject(projectId),
  ]);
  return {
    defects: defects.slice(0, 50).map((d) => ({ id: d.id, label: d.title })),
    ehs: audits.slice(0, 50).map((a) => ({
      id: a.id,
      label: `${a.type}｜${a.location ?? a.findings ?? "稽核"}`,
    })),
  };
}

export type MiniOverlay = {
  id: string;
  title: string;
  wmtsCode: string;
  color: string | null;
  opacity: number;
};
export type ProjectMiniMap = {
  lat: number | null;
  lng: number | null;
  features: gisRepo.GisFeatureRow[];
  overlays: MiniOverlay[];
};

/** 供 PMIS-03 專案總覽嵌入的精簡地圖資料（座標 + 圖徵 + 預設疊圖）。 */
export async function getProjectMiniMap(
  projectId: string,
  viewer: projectService.Viewer,
): Promise<ProjectMiniMap | null> {
  if (!(await canAccess(projectId, { id: viewer.id, role: viewer.role }))) {
    return null;
  }
  const [pins, features, layers] = await Promise.all([
    gisRepo.listProjectPins([projectId]),
    gisRepo.listFeatures(projectId),
    gisRepo.listLayers(),
  ]);
  const overlays: MiniOverlay[] = layers
    .filter((l) => !l.isBase && l.isDefault && l.wmtsCode)
    .map((l) => ({
      id: l.id,
      title: l.title,
      wmtsCode: l.wmtsCode as string,
      color: l.color,
      opacity: l.opacity,
    }));
  const pin = pins[0];
  return {
    lat: pin?.lat ?? null,
    lng: pin?.lng ?? null,
    features,
    overlays,
  };
}

/** 讀取圖層的向量 GeoJSON（供前端 choropleth / 向量套疊）。 */
export async function getLayerGeoJSON(id: string): Promise<string | null> {
  const layers = await gisRepo.listLayers();
  const layer = layers.find((l) => l.id === id);
  if (!layer?.filePath) return null;
  try {
    const abs = path.join(process.cwd(), layer.filePath);
    return fs.readFileSync(abs, "utf8");
  } catch {
    return null;
  }
}

/** 刪除（軟刪除）圖徵。 */
export async function deleteFeature(id: string, actor: Actor): Promise<boolean> {
  const projectId = await gisRepo.getFeatureProjectId(id);
  if (!projectId || !(await canAccess(projectId, actor))) return false;
  await gisRepo.softDeleteFeature(id);
  return true;
}

// ── 周邊風險摘要（本地向量空間查詢 + 現場模組狀態）──────────────────

type GeoFeature = { properties?: Record<string, unknown>; geometry: Geometry };

function loadFeatures(filePath: string): GeoFeature[] {
  try {
    const abs = path.join(process.cwd(), filePath);
    const raw = fs.readFileSync(abs, "utf8");
    const fc = JSON.parse(raw) as { features?: GeoFeature[] };
    return Array.isArray(fc.features) ? fc.features : [];
  } catch {
    return [];
  }
}

function propStr(p: Record<string, unknown> | undefined, ...keys: string[]): string | undefined {
  if (!p) return undefined;
  for (const k of keys) {
    const v = p[k];
    if (typeof v === "string" && v.trim()) return v;
  }
  return undefined;
}

export type RiskZone = {
  title: string;
  color: string | null;
  status: "hit" | "clear" | "unknown";
  label?: string;
};
export type NearbyFacility = {
  title: string;
  color: string | null;
  name?: string;
  distanceM?: number;
};
export type ModuleStatus = {
  openDefects: number;
  defectTitles: string[];
  ehsFindings: number;
  ehsLatest?: string;
  upcomingReminders: number;
  reminderTitles: string[];
};
export type SiteRisk = {
  hasSite: boolean;
  lat?: number;
  lng?: number;
  zones: RiskZone[];
  facilities: NearbyFacility[];
  moduleStatus: ModuleStatus;
};

const RISK_CATEGORIES = new Set(["RISK"]);
const FACILITY_CATEGORIES = new Set(["FACILITY"]);

/** 產生選定專案的周邊風險摘要。 */
export async function getSiteRisk(
  projectId: string,
  viewer: projectService.Viewer,
): Promise<SiteRisk | null> {
  if (!(await canAccess(projectId, { id: viewer.id, role: viewer.role }))) {
    return null;
  }
  const pins = await gisRepo.listProjectPins([projectId]);
  const pin = pins[0];
  const moduleStatus = await getModuleStatus(projectId);

  if (!pin || pin.lat == null || pin.lng == null) {
    return { hasSite: false, zones: [], facilities: [], moduleStatus };
  }
  const point: Position = [pin.lng, pin.lat];
  const layers = await gisRepo.listLayers();

  const zones: RiskZone[] = [];
  const facilities: NearbyFacility[] = [];

  for (const l of layers) {
    if (RISK_CATEGORIES.has(l.category)) {
      if (!l.filePath) {
        zones.push({ title: l.title, color: l.color, status: "unknown" });
        continue;
      }
      const feats = loadFeatures(l.filePath);
      const hitFeat = feats.find((f) => pointInGeometry(point, f.geometry));
      zones.push({
        title: l.title,
        color: l.color,
        status: hitFeat ? "hit" : "clear",
        label: hitFeat
          ? propStr(hitFeat.properties, "label", "level", "name")
          : undefined,
      });
    } else if (FACILITY_CATEGORIES.has(l.category) && l.filePath) {
      const feats = loadFeatures(l.filePath);
      let best: { d: number; name?: string } | null = null;
      for (const f of feats) {
        const d = distanceToGeometry(point, f.geometry);
        if (!best || d < best.d) {
          best = { d, name: propStr(f.properties, "name", "label") };
        }
      }
      if (best) {
        facilities.push({
          title: l.title,
          color: l.color,
          name: best.name,
          distanceM: Math.round(best.d),
        });
      }
    }
  }

  return { hasSite: true, lat: pin.lat, lng: pin.lng, zones, facilities, moduleStatus };
}

async function getModuleStatus(projectId: string): Promise<ModuleStatus> {
  const [defects, audits, reminders] = await Promise.all([
    defectRepo.listWithProject(projectId),
    ehsRepo.listWithProject(projectId),
    reminderRepo.listWithProject(),
  ]);

  const openDefects = defects.filter(
    (d) => d.status === "OPEN" || d.status === "IN_PROGRESS",
  );
  const ehsFindings = audits.filter(
    (a) => a.result === "FAIL" || a.result === "IMPROVING",
  );
  const now = Date.now();
  const soon = now + 30 * 24 * 60 * 60 * 1000;
  const upcoming = reminders.filter((r) => {
    if (r.projectId !== projectId) return false;
    const t = new Date(r.dueDate).getTime();
    return t >= now && t <= soon;
  });

  return {
    openDefects: openDefects.length,
    defectTitles: openDefects.slice(0, 3).map((d) => d.title),
    ehsFindings: ehsFindings.length,
    ehsLatest: ehsFindings[0]?.findings ?? undefined,
    upcomingReminders: upcoming.length,
    reminderTitles: upcoming.slice(0, 3).map((r) => r.title),
  };
}

/** 以確定性方式產生風險摘要文字（同時作為 AI 提示與 AI 不可用時的回退）。 */
export function buildRiskBriefingText(risk: SiteRisk): string {
  const lines: string[] = [];
  const hits = risk.zones.filter((z) => z.status === "hit");
  if (hits.length) {
    lines.push(
      `位於：${hits.map((z) => z.label || z.title).join("、")}`,
    );
  }
  const clears = risk.zones.filter((z) => z.status === "clear");
  if (clears.length) lines.push(`未落於：${clears.map((z) => z.title).join("、")}`);
  const unknowns = risk.zones.filter((z) => z.status === "unknown");
  if (unknowns.length)
    lines.push(`尚未匯入資料（請於地圖檢視）：${unknowns.map((z) => z.title).join("、")}`);
  for (const f of risk.facilities) {
    lines.push(
      `最近${f.title}${f.name ? `「${f.name}」` : ""}約 ${f.distanceM} 公尺`,
    );
  }
  const m = risk.moduleStatus;
  if (m.openDefects) lines.push(`未結案缺失 ${m.openDefects} 件`);
  if (m.ehsFindings) lines.push(`環安衛待改善 ${m.ehsFindings} 項`);
  if (m.upcomingReminders) lines.push(`30 日內到期提醒 ${m.upcomingReminders} 項`);
  return lines.length ? lines.join("；") + "。" : "目前無明顯周邊風險項目。";
}

/** 手動設定工地座標（地圖點選）。 */
export async function setProjectLocation(
  projectId: string,
  lat: number,
  lng: number,
  actor: Actor,
): Promise<boolean> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < 21 || lat > 26.5 || lng < 118 || lng > 122.5) return false; // 臺灣範圍粗檢
  if (!(await canAccess(projectId, actor))) return false;
  await gisRepo.setProjectLatLng(projectId, lat, lng);
  return true;
}

/**
 * 以 TGOS 地址定位服務由專案地址回填座標（需環境變數 TGOS_APP_ID / TGOS_API_KEY）。
 * 未設定金鑰或呼叫失敗時回傳 null，由呼叫端提示改用手動點選定位。
 */
export async function geocodeProject(
  projectId: string,
  actor: Actor,
): Promise<{ lat: number; lng: number } | null> {
  if (!(await canAccess(projectId, actor))) return null;
  const appId = process.env.TGOS_APP_ID;
  const apiKey = process.env.TGOS_API_KEY;
  if (!appId || !apiKey) return null;

  const pins = await gisRepo.listProjectPins([projectId]);
  const address = pins[0]?.location;
  if (!address) return null;

  try {
    const url =
      `https://gis.tgos.tw/TGGeocode/TGGeocodeJson?` +
      new URLSearchParams({
        oAppId: appId,
        oAPIKey: apiKey,
        oAddress: address,
        oSRS: "EPSG:4326",
        oResultDataType: "JSON",
      }).toString();
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      Info?: { Number?: number }[];
      Geocode?: { X?: string | number; Y?: string | number }[];
    };
    const g = data.Geocode?.[0];
    if (!g) return null;
    const lng = Number(g.X);
    const lat = Number(g.Y);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    await gisRepo.setProjectLatLng(projectId, lat, lng);
    return { lat, lng };
  } catch {
    return null;
  }
}

/** 匯出專案圖徵為 GeoJSON FeatureCollection。 */
export async function exportFeatures(
  projectId: string,
  viewer: projectService.Viewer,
): Promise<string | null> {
  if (!(await canAccess(projectId, { id: viewer.id, role: viewer.role }))) {
    return null;
  }
  const rows = await gisRepo.listFeatures(projectId);
  const features = rows.map((f) => {
    let geometry: unknown = null;
    try {
      geometry = JSON.parse(f.geojson);
    } catch {
      geometry = null;
    }
    return {
      type: "Feature",
      properties: {
        name: f.name,
        type: f.type,
        note: f.note,
        color: f.color,
      },
      geometry,
    };
  });
  return JSON.stringify({ type: "FeatureCollection", features }, null, 2);
}
