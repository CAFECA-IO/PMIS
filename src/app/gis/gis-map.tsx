"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type * as LType from "leaflet";
import { Layers, MapPin, Route as RouteIcon, Hexagon, X, Pencil, Crosshair } from "lucide-react";

import "leaflet/dist/leaflet.css";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  addFeatureAction,
  deleteFeatureAction,
  setProjectLocationAction,
} from "./actions";

export type MapLayer = {
  id: string;
  category: string;
  title: string;
  source: string;
  wmtsCode: string | null;
  color: string | null;
  opacity: number;
  isBase: boolean;
  isDefault: boolean;
};

export type MapFeature = {
  id: string;
  name: string;
  type: string;
  geojson: string;
  color: string | null;
  note: string | null;
  linkModule: string | null;
  linkId: string | null;
};

export type LinkTargets = {
  defects: { id: string; label: string }[];
  ehs: { id: string; label: string }[];
};

export type MapPin = {
  id: string;
  code: string;
  name: string;
  location: string | null;
  lat: number | null;
  lng: number | null;
};

type DrawMode = "MARKER" | "ROUTE" | "AREA" | "SITE" | null;

const TAIWAN_CENTER: [number, number] = [23.8, 120.95];
const CARTO_LIGHT =
  "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
const CATEGORY_LABEL: Record<string, string> = {
  RISK: "災害潛勢",
  FACILITY: "敏感設施",
  TRANSPORT: "交通",
  LAND: "地籍 / 土地",
  ADMIN: "行政 / 統計",
  STATS: "社經統計",
};
const MODULE_HREF: Record<string, string> = {
  DEFECT: "/quality",
  EHS: "/ehs",
};
const MODULE_LABEL: Record<string, string> = {
  DEFECT: "缺失 (PMIS-07)",
  EHS: "環安衛 (PMIS-05)",
};
const TYPE_LABEL: Record<string, string> = {
  MARKER: "地標",
  ROUTE: "路線",
  AREA: "範圍",
};

export function GisMap({
  layers,
  features,
  pins,
  selectedProjectId,
  canEdit,
  linkTargets,
}: {
  layers: MapLayer[];
  features: MapFeature[];
  pins: MapPin[];
  selectedProjectId?: string;
  canEdit: boolean;
  linkTargets?: LinkTargets;
}) {
  const router = useRouter();
  const mapEl = useRef<HTMLDivElement | null>(null);
  const LRef = useRef<typeof LType | null>(null);
  const mapRef = useRef<LType.Map | null>(null);
  const baseRef = useRef<LType.TileLayer | null>(null);
  const overlayRefs = useRef<Map<string, LType.TileLayer>>(new Map());
  const vectorRefs = useRef<Map<string, LType.GeoJSON>>(new Map());
  const featureGroupRef = useRef<LType.LayerGroup | null>(null);
  const draftLayerRef = useRef<LType.Polyline | LType.Polygon | null>(null);
  const draftPtsRef = useRef<[number, number][]>([]);
  const drawModeRef = useRef<DrawMode>(null);
  const selectedRef = useRef<string | undefined>(selectedProjectId);
  selectedRef.current = selectedProjectId;

  const bases = layers.filter((l) => l.isBase);
  const overlays = layers.filter((l) => !l.isBase);

  const [baseId, setBaseId] = useState<string>(
    bases.find((b) => b.isDefault)?.id ?? bases[0]?.id ?? "osm",
  );
  const [active, setActive] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(overlays.map((l) => [l.id, l.isDefault])),
  );
  const [opacity, setOpacity] = useState<Record<string, number>>(() =>
    Object.fromEntries(overlays.map((l) => [l.id, l.opacity])),
  );
  const [drawMode, setDrawMode] = useState<DrawMode>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [form, setForm] = useState<{
    geojson: string;
    type: string;
    name: string;
    note: string;
    color: string;
    link: string; // "MODULE:ID" 或 ""
  } | null>(null);
  const [saving, setSaving] = useState(false);

  const hasLinkTargets =
    !!linkTargets &&
    (linkTargets.defects.length > 0 || linkTargets.ehs.length > 0);

  const baseUrl = (code: string | null) =>
    code ? `/api/gis/tiles/${code}/{z}/{x}/{y}` : CARTO_LIGHT;

  // Info: 初始化地圖（僅一次）
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !mapEl.current || mapRef.current) return;
      LRef.current = L;

      const map = L.map(mapEl.current, {
        center: TAIWAN_CENTER,
        zoom: 8,
        zoomControl: true,
      });
      mapRef.current = map;
      featureGroupRef.current = L.layerGroup().addTo(map);

      // Info: 點擊繪製
      map.on("click", (e: LType.LeafletMouseEvent) => {
        const mode = drawModeRef.current;
        if (!mode) return;
        const L2 = LRef.current;
        if (!L2) return;
        if (mode === "SITE") {
          const pid = selectedRef.current;
          setDrawModeInternal(null);
          if (pid) {
            void setProjectLocationAction(pid, e.latlng.lat, e.latlng.lng).then(
              (r) => {
                if (r.ok) router.refresh();
              },
            );
          }
          return;
        }
        if (mode === "MARKER") {
          openForm("MARKER", {
            type: "Point",
            coordinates: [e.latlng.lng, e.latlng.lat],
          });
          setDrawModeInternal(null);
          return;
        }
        draftPtsRef.current.push([e.latlng.lat, e.latlng.lng]);
        redrawDraft();
      });

      renderBase();
      renderOverlays();
      renderFeatures();
      fitToContext();
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Info: 底圖切換
  useEffect(() => {
    renderBase();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseId]);

  // Info: 疊加圖層開關 / 透明度
  useEffect(() => {
    renderOverlays();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, opacity]);

  // Info: 圖徵 / 專案切換
  useEffect(() => {
    renderFeatures();
    fitToContext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [features, pins, selectedProjectId]);

  function renderBase() {
    const L = LRef.current;
    const map = mapRef.current;
    if (!L || !map) return;
    if (baseRef.current) {
      map.removeLayer(baseRef.current);
      baseRef.current = null;
    }
    const b = bases.find((x) => x.id === baseId);
    const layer = L.tileLayer(baseUrl(b?.wmtsCode ?? null), {
      subdomains: b?.wmtsCode ? "abc" : "abcd",
      maxZoom: 20,
      attribution: b?.wmtsCode
        ? "© 內政部國土測繪中心 NLSC"
        : "© OpenStreetMap contributors © CARTO",
    });
    layer.addTo(map);
    layer.bringToBack();
    baseRef.current = layer;
  }

  function renderOverlays() {
    const L = LRef.current;
    const map = mapRef.current;
    if (!L || !map) return;
    for (const l of overlays) {
      const on = !!active[l.id];
      // 向量圖層（如 SEGIS 統計面量）：無 wmtsCode，以 GeoJSON choropleth 呈現
      if (!l.wmtsCode) {
        void ensureVectorLayer(l, on);
        continue;
      }
      const existing = overlayRefs.current.get(l.id);
      if (on && !existing) {
        const tl = L.tileLayer(baseUrl(l.wmtsCode), {
          subdomains: "abc",
          opacity: (opacity[l.id] ?? l.opacity) / 100,
          maxZoom: 20,
        });
        tl.addTo(map);
        overlayRefs.current.set(l.id, tl);
      } else if (on && existing) {
        existing.setOpacity((opacity[l.id] ?? l.opacity) / 100);
      } else if (!on && existing) {
        map.removeLayer(existing);
        overlayRefs.current.delete(l.id);
      }
    }
  }

  async function ensureVectorLayer(l: MapLayer, on: boolean) {
    const L = LRef.current;
    const map = mapRef.current;
    if (!L || !map) return;
    const existing = vectorRefs.current.get(l.id);
    const fillOpacity = (opacity[l.id] ?? l.opacity) / 100;

    if (!on) {
      if (existing) {
        map.removeLayer(existing);
        vectorRefs.current.delete(l.id);
      }
      return;
    }
    if (existing) {
      existing.setStyle(() => ({ fillOpacity }));
      return;
    }
    // 尚未載入 → 取向量資料並建立 choropleth
    try {
      const res = await fetch(`/api/gis/vector/${l.id}`);
      if (!res.ok) return;
      const fc = (await res.json()) as {
        features: { properties?: Record<string, unknown> }[];
      };
      const values = fc.features
        .map((f) => Number(f.properties?.value))
        .filter((n) => Number.isFinite(n));
      const max = values.length ? Math.max(...values) : 1;
      const base = l.color ?? "#2563eb";
      const gj = L.geoJSON(fc as unknown as GeoJSON.GeoJsonObject, {
        style: (feat) => {
          const v = Number(feat?.properties?.value);
          return {
            color: "#ffffff",
            weight: 1,
            fillColor: base,
            fillOpacity: Number.isFinite(v)
              ? fillOpacity * (0.25 + 0.75 * (v / max))
              : fillOpacity * 0.25,
          };
        },
        onEachFeature: (feat, lyr) => {
          const p = feat.properties as Record<string, unknown> | null;
          const label = p?.label ?? p?.name ?? "";
          const v = p?.value;
          lyr.bindPopup(
            `<b>${escapeHtml(String(label))}</b>${v != null ? `<br/>數值：${escapeHtml(String(v))}` : ""}`,
          );
        },
      });
      // 若期間已被關閉則不加入
      if (!active[l.id]) return;
      gj.addTo(map);
      vectorRefs.current.set(l.id, gj);
    } catch {
      // 忽略載入失敗
    }
  }

  function divIcon(color: string, glyph: string) {
    const L = LRef.current;
    if (!L) return undefined;
    return L.divIcon({
      className: "",
      html: `<div style="background:${color};width:18px;height:18px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center"><span style="transform:rotate(45deg);font-size:10px;color:#fff">${glyph}</span></div>`,
      iconSize: [18, 18],
      iconAnchor: [9, 18],
    });
  }

  function renderFeatures() {
    const L = LRef.current;
    const group = featureGroupRef.current;
    if (!L || !group) return;
    group.clearLayers();

    // 專案座標 pin
    for (const p of pins) {
      if (p.lat == null || p.lng == null) continue;
      const isSel = p.id === selectedProjectId;
      const m = L.marker([p.lat, p.lng], {
        icon: divIcon(isSel ? "#1d4ed8" : "#64748b", "工"),
      });
      m.bindPopup(
        `<b>${escapeHtml(p.name)}</b><br/><span style="color:#64748b">${escapeHtml(
          p.code,
        )} · ${escapeHtml(p.location ?? "")}</span>`,
      );
      m.addTo(group);
    }

    // 專案自訂圖徵
    for (const f of features) {
      let geom: { type: string; coordinates: unknown };
      try {
        geom = JSON.parse(f.geojson);
      } catch {
        continue;
      }
      const color = f.color ?? "#7c3aed";
      const linkHtml =
        f.linkModule && MODULE_HREF[f.linkModule] && selectedProjectId
          ? `<br/><a href="${MODULE_HREF[f.linkModule]}?project=${selectedProjectId}" style="color:#2563eb;text-decoration:underline">🔗 檢視${MODULE_LABEL[f.linkModule] ?? "關聯項目"}</a>`
          : "";
      const popup = `<b>${escapeHtml(f.name)}</b> <span style="color:#94a3b8">(${
        TYPE_LABEL[f.type] ?? f.type
      })</span>${f.note ? `<br/>${escapeHtml(f.note)}` : ""}${linkHtml}${
        canEdit
          ? `<br/><button data-del="${f.id}" style="margin-top:6px;color:#dc2626;cursor:pointer;background:none;border:none;padding:0;text-decoration:underline">刪除</button>`
          : ""
      }`;

      if (geom.type === "Point") {
        const [lng, lat] = geom.coordinates as [number, number];
        const m = L.marker([lat, lng], { icon: divIcon(color, "★") });
        m.bindPopup(popup);
        m.addTo(group);
      } else if (geom.type === "LineString") {
        const latlngs = (geom.coordinates as [number, number][]).map(
          ([lng, lat]) => [lat, lng] as [number, number],
        );
        const line = L.polyline(latlngs, { color, weight: 4, dashArray: "6 4" });
        line.bindPopup(popup);
        line.addTo(group);
      } else if (geom.type === "Polygon") {
        const ring = (geom.coordinates as [number, number][][])[0].map(
          ([lng, lat]) => [lat, lng] as [number, number],
        );
        const poly = L.polygon(ring, {
          color,
          weight: 2,
          fillOpacity: 0.15,
        });
        poly.bindPopup(popup);
        poly.addTo(group);
      }
    }
  }

  // Info: popup 內刪除按鈕（事件委派）
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const handler = (e: LType.LeafletEvent) => {
      const node = (e as LType.PopupEvent).popup.getElement();
      const btn = node?.querySelector<HTMLButtonElement>("button[data-del]");
      if (!btn) return;
      btn.onclick = async () => {
        const id = btn.getAttribute("data-del");
        if (!id) return;
        await deleteFeatureAction(id);
        map.closePopup();
        router.refresh();
      };
    };
    map.on("popupopen", handler);
    return () => {
      map.off("popupopen", handler);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function redrawDraft() {
    const L = LRef.current;
    const map = mapRef.current;
    if (!L || !map) return;
    if (draftLayerRef.current) {
      map.removeLayer(draftLayerRef.current);
      draftLayerRef.current = null;
    }
    const pts = draftPtsRef.current;
    if (pts.length === 0) return;
    const mode = drawModeRef.current;
    if (mode === "AREA" && pts.length >= 3) {
      draftLayerRef.current = L.polygon(pts, {
        color: "#ea580c",
        weight: 2,
        fillOpacity: 0.1,
        dashArray: "4 4",
      }).addTo(map);
    } else {
      draftLayerRef.current = L.polyline(pts, {
        color: "#ea580c",
        weight: 3,
        dashArray: "4 4",
      }).addTo(map);
    }
  }

  function clearDraft() {
    const map = mapRef.current;
    draftPtsRef.current = [];
    if (draftLayerRef.current && map) {
      map.removeLayer(draftLayerRef.current);
      draftLayerRef.current = null;
    }
  }

  function setDrawModeInternal(mode: DrawMode) {
    drawModeRef.current = mode;
    setDrawMode(mode);
    const container = mapRef.current?.getContainer();
    if (container) container.style.cursor = mode ? "crosshair" : "";
  }

  function startDraw(mode: DrawMode) {
    clearDraft();
    setForm(null);
    setDrawModeInternal(drawMode === mode ? null : mode);
  }

  function finishDraw() {
    const mode = drawModeRef.current;
    const pts = draftPtsRef.current;
    if (mode === "ROUTE" && pts.length >= 2) {
      openForm("ROUTE", {
        type: "LineString",
        coordinates: pts.map(([lat, lng]) => [lng, lat]),
      });
    } else if (mode === "AREA" && pts.length >= 3) {
      const ring = pts.map(([lat, lng]) => [lng, lat]);
      ring.push(ring[0]);
      openForm("AREA", { type: "Polygon", coordinates: [ring] });
    }
    setDrawModeInternal(null);
  }

  function openForm(type: string, geom: { type: string; coordinates: unknown }) {
    setForm({
      geojson: JSON.stringify(geom),
      type,
      name: "",
      note: "",
      color:
        type === "MARKER" ? "#2563eb" : type === "ROUTE" ? "#ea580c" : "#7c3aed",
      link: "",
    });
  }

  async function submitForm() {
    if (!form || !selectedProjectId || !form.name.trim()) return;
    setSaving(true);
    const [linkModule, linkId] = form.link
      ? (form.link.split(":") as [string, string])
      : [undefined, undefined];
    const res = await addFeatureAction({
      projectId: selectedProjectId,
      name: form.name,
      type: form.type,
      geojson: form.geojson,
      color: form.color,
      note: form.note || undefined,
      linkModule,
      linkId,
    });
    setSaving(false);
    if (res.ok) {
      setForm(null);
      clearDraft();
      router.refresh();
    }
  }

  function fitToContext() {
    const L = LRef.current;
    const map = mapRef.current;
    if (!L || !map) return;
    const sel = pins.find((p) => p.id === selectedProjectId);
    if (sel && sel.lat != null && sel.lng != null) {
      map.setView([sel.lat, sel.lng], 16);
      return;
    }
    const pts = pins
      .filter((p) => p.lat != null && p.lng != null)
      .map((p) => [p.lat as number, p.lng as number] as [number, number]);
    if (pts.length > 1) {
      map.fitBounds(L.latLngBounds(pts).pad(0.2));
    } else if (pts.length === 1) {
      map.setView(pts[0], 14);
    }
  }

  const grouped = overlays.reduce<Record<string, MapLayer[]>>((acc, l) => {
    (acc[l.category] ??= []).push(l);
    return acc;
  }, {});

  return (
    <div className="relative h-[calc(100vh-8.5rem)] min-h-[480px] w-full overflow-hidden rounded-xl border">
      <div ref={mapEl} className="absolute inset-0 z-0 bg-[#f7f8fa]" />

      {/* 圖層面板切換（手機） */}
      <button
        type="button"
        onClick={() => setPanelOpen((v) => !v)}
        className="absolute left-3 top-3 z-[1000] flex items-center gap-1.5 rounded-md bg-card px-3 py-2 text-sm font-medium shadow-md lg:hidden"
      >
        <Layers className="size-4" /> 圖層
      </button>

      {/* 圖層面板 */}
      <div
        className={cn(
          "absolute left-3 top-3 z-[999] max-h-[calc(100%-1.5rem)] w-64 overflow-y-auto rounded-lg border bg-card/95 p-3 shadow-lg backdrop-blur",
          "lg:block",
          panelOpen ? "block" : "hidden",
        )}
      >
        <div className="mb-2 flex items-center justify-between">
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <Layers className="size-4" /> 圖層
          </p>
          <button
            type="button"
            className="lg:hidden"
            onClick={() => setPanelOpen(false)}
          >
            <X className="size-4" />
          </button>
        </div>

        <p className="mb-1 text-xs font-medium text-muted-foreground">底圖</p>
        <div className="mb-3 space-y-1">
          {bases.map((b) => (
            <label key={b.id} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="base"
                checked={baseId === b.id}
                onChange={() => setBaseId(b.id)}
              />
              {b.title}
            </label>
          ))}
        </div>

        {Object.entries(grouped).map(([cat, ls]) => (
          <div key={cat} className="mb-3">
            <p className="mb-1 text-xs font-medium text-muted-foreground">
              {CATEGORY_LABEL[cat] ?? cat}
            </p>
            <div className="space-y-1.5">
              {ls.map((l) => (
                <div key={l.id}>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={!!active[l.id]}
                      onChange={(e) =>
                        setActive((s) => ({ ...s, [l.id]: e.target.checked }))
                      }
                    />
                    <span
                      className="inline-block size-2.5 rounded-sm"
                      style={{ background: l.color ?? "#94a3b8" }}
                    />
                    <span className="flex-1">{l.title}</span>
                  </label>
                  {active[l.id] && (
                    <input
                      type="range"
                      min={10}
                      max={100}
                      value={opacity[l.id] ?? l.opacity}
                      onChange={(e) =>
                        setOpacity((s) => ({
                          ...s,
                          [l.id]: Number(e.target.value),
                        }))
                      }
                      className="mt-1 w-full accent-primary"
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
        <p className="mt-2 text-[10px] leading-tight text-muted-foreground">
          圖資來源：內政部國土測繪中心 (NLSC)。僅供參考，界址與潛勢以主管機關公告為準。
        </p>
      </div>

      {/* 繪圖工具（需選定專案且有權限） */}
      {canEdit && selectedProjectId && (
        <div className="absolute right-3 top-3 z-[999] flex flex-col gap-1.5 rounded-lg border bg-card/95 p-2 shadow-lg backdrop-blur">
          <p className="flex items-center gap-1 px-1 text-xs font-semibold text-muted-foreground">
            <Pencil className="size-3.5" /> 自訂圖徵
          </p>
          <ToolButton
            active={drawMode === "MARKER"}
            onClick={() => startDraw("MARKER")}
            icon={<MapPin className="size-4" />}
            label="地標"
          />
          <ToolButton
            active={drawMode === "ROUTE"}
            onClick={() => startDraw("ROUTE")}
            icon={<RouteIcon className="size-4" />}
            label="路線"
          />
          <ToolButton
            active={drawMode === "AREA"}
            onClick={() => startDraw("AREA")}
            icon={<Hexagon className="size-4" />}
            label="範圍"
          />
          <div className="border-t pt-1">
            <ToolButton
              active={drawMode === "SITE"}
              onClick={() => startDraw("SITE")}
              icon={<Crosshair className="size-4" />}
              label="設定工地位置"
            />
          </div>
          {(drawMode === "ROUTE" || drawMode === "AREA") && (
            <div className="flex flex-col gap-1 border-t pt-1">
              <Button size="sm" className="h-7 text-xs" onClick={finishDraw}>
                完成
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                onClick={() => {
                  clearDraft();
                  setDrawModeInternal(null);
                }}
              >
                取消
              </Button>
            </div>
          )}
        </div>
      )}

      {canEdit && !selectedProjectId && (
        <div className="absolute right-3 top-3 z-[999] max-w-52 rounded-lg border bg-card/95 p-2.5 text-xs text-muted-foreground shadow-lg backdrop-blur">
          選擇單一專案後即可新增自訂地標、路線與範圍。
        </div>
      )}

      {/* 新增圖徵表單 */}
      {form && (
        <div className="absolute inset-x-0 bottom-3 z-[1001] mx-auto w-[min(92%,420px)] rounded-lg border bg-card p-3 shadow-xl">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold">
              新增{TYPE_LABEL[form.type] ?? "圖徵"}
            </p>
            <button
              type="button"
              onClick={() => {
                setForm(null);
                clearDraft();
              }}
            >
              <X className="size-4" />
            </button>
          </div>
          <div className="space-y-2">
            <Input
              placeholder="名稱（必填）"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              autoFocus
            />
            <Input
              placeholder="備註（選填）"
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
            />
            {hasLinkTargets && (
              <select
                value={form.link}
                onChange={(e) => setForm({ ...form, link: e.target.value })}
                className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
              >
                <option value="">不連結模組項目（選填）</option>
                {linkTargets!.defects.length > 0 && (
                  <optgroup label="缺失 (PMIS-07)">
                    {linkTargets!.defects.map((d) => (
                      <option key={d.id} value={`DEFECT:${d.id}`}>
                        {d.label}
                      </option>
                    ))}
                  </optgroup>
                )}
                {linkTargets!.ehs.length > 0 && (
                  <optgroup label="環安衛 (PMIS-05)">
                    {linkTargets!.ehs.map((a) => (
                      <option key={a.id} value={`EHS:${a.id}`}>
                        {a.label}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            )}
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground">顏色</label>
              <input
                type="color"
                value={form.color}
                onChange={(e) => setForm({ ...form, color: e.target.value })}
                className="h-7 w-10 cursor-pointer rounded border"
              />
              <div className="flex-1" />
              <Button
                size="sm"
                disabled={saving || !form.name.trim()}
                onClick={submitForm}
              >
                {saving ? "儲存中…" : "儲存"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 圖例：自訂圖徵 */}
      {features.length > 0 && (
        <div className="absolute bottom-3 left-3 z-[998] hidden rounded-lg border bg-card/95 px-3 py-2 text-xs shadow-lg backdrop-blur sm:block">
          <span className="font-medium">本專案圖徵：</span>
          <span className="text-muted-foreground">
            {features.length} 項（點擊圖示查看／刪除）
          </span>
        </div>
      )}
    </div>
  );
}

function ToolButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "hover:bg-accent hover:text-accent-foreground",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
