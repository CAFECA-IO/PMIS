"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import type * as LType from "leaflet";
import { MapPin, ExternalLink } from "lucide-react";

import "leaflet/dist/leaflet.css";
import { withProject } from "@/lib/project-link";

export type MiniFeature = {
  id: string;
  name: string;
  type: string;
  geojson: string;
  color: string | null;
};
export type MiniOverlay = {
  id: string;
  title: string;
  wmtsCode: string;
  color: string | null;
  opacity: number;
};

const CARTO_LIGHT =
  "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function ProjectMiniMap({
  projectId,
  lat,
  lng,
  features,
  overlays,
}: {
  projectId: string;
  lat: number;
  lng: number;
  features: MiniFeature[];
  overlays: MiniOverlay[];
}) {
  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LType.Map | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !mapEl.current || mapRef.current) return;

      const map = L.map(mapEl.current, {
        center: [lat, lng],
        zoom: 16,
        zoomControl: false,
        attributionControl: false,
      });
      mapRef.current = map;

      L.tileLayer(CARTO_LIGHT, { subdomains: "abcd", maxZoom: 20 }).addTo(map);

      for (const o of overlays) {
        L.tileLayer(`/api/gis/tiles/${o.wmtsCode}/{z}/{x}/{y}`, {
          subdomains: "abc",
          opacity: o.opacity / 100,
          maxZoom: 20,
        }).addTo(map);
      }

      const siteIcon = L.divIcon({
        className: "",
        html: `<div style="background:#1d4ed8;width:18px;height:18px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.4)"></div>`,
        iconSize: [18, 18],
        iconAnchor: [9, 18],
      });
      L.marker([lat, lng], { icon: siteIcon }).addTo(map).bindPopup("工地位置");

      for (const f of features) {
        let geom: { type: string; coordinates: unknown };
        try {
          geom = JSON.parse(f.geojson);
        } catch {
          continue;
        }
        const color = f.color ?? "#7c3aed";
        const popup = `<b>${escapeHtml(f.name)}</b>`;
        if (geom.type === "Point") {
          const [g0, g1] = geom.coordinates as [number, number];
          L.circleMarker([g1, g0], {
            radius: 6,
            color,
            fillColor: color,
            fillOpacity: 0.8,
          })
            .addTo(map)
            .bindPopup(popup);
        } else if (geom.type === "LineString") {
          const pts = (geom.coordinates as [number, number][]).map(
            ([a, b]) => [b, a] as [number, number],
          );
          L.polyline(pts, { color, weight: 4, dashArray: "6 4" })
            .addTo(map)
            .bindPopup(popup);
        } else if (geom.type === "Polygon") {
          const ring = (geom.coordinates as [number, number][][])[0].map(
            ([a, b]) => [b, a] as [number, number],
          );
          L.polygon(ring, { color, weight: 2, fillOpacity: 0.15 })
            .addTo(map)
            .bindPopup(popup);
        }
      }
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [lat, lng, features, overlays]);

  return (
    <div className="space-y-2">
      <div
        ref={mapEl}
        className="h-[300px] w-full overflow-hidden rounded-lg border bg-[#f7f8fa]"
      />
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>底圖 OSM · 疊圖 內政部國土測繪中心（僅供參考）</span>
        <Link
          href={withProject("/gis", projectId)}
          className="inline-flex items-center gap-1 text-primary hover:underline"
        >
          <ExternalLink className="size-3.5" /> 在 GIS 地圖開啟
        </Link>
      </div>
    </div>
  );
}

export function MiniMapEmpty({ projectId }: { projectId: string }) {
  return (
    <div className="flex h-[200px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-center text-sm text-muted-foreground">
      <MapPin className="size-6" />
      <p>此專案尚未設定工地座標。</p>
      <Link
        href={withProject("/gis", projectId)}
        className="inline-flex items-center gap-1 text-primary hover:underline"
      >
        <ExternalLink className="size-3.5" /> 前往 GIS 地圖設定位置
      </Link>
    </div>
  );
}
