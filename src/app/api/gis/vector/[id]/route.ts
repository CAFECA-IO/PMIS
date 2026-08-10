import { NextResponse } from "next/server";

import * as gisService from "@/service/gis.service";
import { getCurrentUser } from "@/service/auth.service";
import { jsonFail } from "@/lib/api-response";
import { API_ERRORS } from "@/lib/api-error";

export const runtime = "nodejs";

/**
 * Info: (20260723 - Luphia) PMIS-12 — 供前端讀取圖層向量 GeoJSON（choropleth 面量 / 向量套疊）。
 * 資料來自 GisLayerSeed.filePath 掛載的本地 seed 檔。
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return jsonFail(API_ERRORS.AU_NOT_SIGNED_IN);

  const { id } = await params;
  const geojson = await gisService.getLayerGeoJSON(id);
  if (geojson == null) return jsonFail(API_ERRORS.NF_LAYER_VECTOR_NOT_FOUND);

  return new NextResponse(geojson, {
    headers: {
      "Content-Type": "application/geo+json; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
