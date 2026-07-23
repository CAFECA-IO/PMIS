import { NextResponse } from "next/server";

import * as gisService from "@/service/gis.service";
import { getCurrentUser } from "@/service/auth.service";

export const runtime = "nodejs";

/**
 * PMIS-12 — 供前端讀取圖層向量 GeoJSON（choropleth 面量 / 向量套疊）。
 * 資料來自 GisLayerSeed.filePath 掛載的本地 seed 檔。
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("未登入", { status: 401 });

  const { id } = await params;
  const geojson = await gisService.getLayerGeoJSON(id);
  if (geojson == null) return new NextResponse("查無圖層向量資料", { status: 404 });

  return new NextResponse(geojson, {
    headers: {
      "Content-Type": "application/geo+json; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
