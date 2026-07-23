import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export const runtime = "nodejs";

// Info: 離線圖磚磁碟快取（重複瀏覽不重打 NLSC）。
const CACHE_DIR = path.join(os.tmpdir(), "pmis-gis-tiles");

function cachePath(layer: string, z: string, x: string, y: string): string {
  return path.join(CACHE_DIR, layer, z, x, `${y}.bin`);
}

async function readCache(
  file: string,
): Promise<{ body: Buffer; contentType: string } | null> {
  try {
    const [body, meta] = await Promise.all([
      fs.readFile(file),
      fs.readFile(`${file}.type`, "utf8").catch(() => "image/png"),
    ]);
    return { body, contentType: meta };
  } catch {
    return null;
  }
}

async function writeCache(file: string, body: Buffer, contentType: string) {
  try {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, body);
    await fs.writeFile(`${file}.type`, contentType);
  } catch {
    // Info: 快取失敗不影響回應
  }
}

/**
 * Info: (20260722)
 * PMIS-12 國土測繪圖資服務雲（NLSC）WMTS 圖磚代理。
 *
 * 前端（Leaflet）以 /api/gis/tiles/{layer}/{z}/{x}/{y} 請求，
 * 後端轉呼 NLSC REST WMTS：
 *   https://wmts.nlsc.gov.tw/wmts/{layer}/default/GoogleMapsCompatible/{z}/{y}/{x}
 * （WMTS 座標順序為 TileMatrix/TileRow/TileCol = z/y/x）。
 *
 * 以後端代理可統一處理來源、避免 CORS/Referer 限制，並加入快取。
 */

const NLSC_BASE = "https://wmts.nlsc.gov.tw/wmts";
const ALLOWED = /^[A-Za-z0-9_]+$/;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ seg: string[] }> },
) {
  const { seg } = await params;
  if (!seg || seg.length !== 4) {
    return new NextResponse("Bad tile request", { status: 400 });
  }
  const [layer, z, x, y] = seg;

  // Info: 白名單參數，避免 SSRF / 路徑注入
  if (!ALLOWED.test(layer) || ![z, x, y].every((n) => /^\d+$/.test(n))) {
    return new NextResponse("Invalid tile parameters", { status: 400 });
  }

  const file = cachePath(layer, z, x, y);
  const cached = await readCache(file);
  if (cached) {
    return new NextResponse(new Uint8Array(cached.body), {
      headers: {
        "Content-Type": cached.contentType,
        "Cache-Control": "public, max-age=86400, s-maxage=604800",
        "X-Tile-Cache": "HIT",
      },
    });
  }

  const upstream = `${NLSC_BASE}/${layer}/default/GoogleMapsCompatible/${z}/${y}/${x}`;

  try {
    const res = await fetch(upstream, {
      headers: {
        // Info: 部分政府服務會檢查 UA / Referer
        "User-Agent": "Mozilla/5.0 (PMIS GIS tile proxy)",
        Referer: "https://maps.nlsc.gov.tw/",
        Accept: "image/*,*/*",
      },
      cache: "force-cache",
    });

    if (!res.ok) {
      return new NextResponse(null, { status: res.status });
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get("content-type") ?? "image/png";
    await writeCache(file, buffer, contentType);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400, s-maxage=604800",
        "X-Tile-Cache": "MISS",
      },
    });
  } catch {
    return new NextResponse(null, { status: 502 });
  }
}
