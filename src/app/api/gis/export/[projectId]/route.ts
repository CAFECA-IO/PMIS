import { NextResponse } from "next/server";

import * as gisService from "@/service/gis.service";
import { getCurrentUser } from "@/service/auth.service";

export const runtime = "nodejs";

type Geometry =
  | { type: "Point"; coordinates: [number, number] }
  | { type: "LineString"; coordinates: [number, number][] }
  | { type: "Polygon"; coordinates: [number, number][][] };

type Feature = {
  properties: { name?: string; note?: string | null };
  geometry: Geometry | null;
};

function xml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function coordStr(c: [number, number]): string {
  return `${c[0]},${c[1]}`;
}

function geojsonToKml(geojson: string): string {
  const fc = JSON.parse(geojson) as { features: Feature[] };
  const placemarks = fc.features
    .map((f) => {
      const g = f.geometry;
      if (!g) return "";
      let geo = "";
      if (g.type === "Point") {
        geo = `<Point><coordinates>${coordStr(g.coordinates)}</coordinates></Point>`;
      } else if (g.type === "LineString") {
        geo = `<LineString><coordinates>${g.coordinates
          .map(coordStr)
          .join(" ")}</coordinates></LineString>`;
      } else if (g.type === "Polygon") {
        geo = `<Polygon><outerBoundaryIs><LinearRing><coordinates>${g.coordinates[0]
          .map(coordStr)
          .join(" ")}</coordinates></LinearRing></outerBoundaryIs></Polygon>`;
      }
      return `<Placemark><name>${xml(f.properties.name ?? "")}</name>${
        f.properties.note ? `<description>${xml(f.properties.note)}</description>` : ""
      }${geo}</Placemark>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document>
${placemarks}
</Document></kml>`;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("未登入", { status: 401 });

  const { projectId } = await params;
  const format = new URL(request.url).searchParams.get("format") ?? "geojson";

  const geojson = await gisService.exportFeatures(projectId, {
    id: user.id,
    role: user.role,
  });
  if (geojson == null) return new NextResponse("無權限或查無專案", { status: 403 });

  if (format === "kml") {
    return new NextResponse(geojsonToKml(geojson), {
      headers: {
        "Content-Type": "application/vnd.google-earth.kml+xml; charset=utf-8",
        "Content-Disposition": `attachment; filename="gis-${projectId}.kml"`,
      },
    });
  }

  return new NextResponse(geojson, {
    headers: {
      "Content-Type": "application/geo+json; charset=utf-8",
      "Content-Disposition": `attachment; filename="gis-${projectId}.geojson"`,
    },
  });
}
