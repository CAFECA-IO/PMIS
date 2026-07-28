"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Cctv,
  Play,
  Pause,
  Radio,
  Rewind,
  AlertTriangle,
  ShieldAlert,
  Activity,
} from "lucide-react";

import { cn } from "@/lib/utils";

type Severity = "critical" | "warning" | "info";

type Box = { x: number; y: number; w: number; h: number };

type Sensor = {
  id: string;
  name: string;
  unit: string;
  value: number;
  min: number;
  max: number;
  warnAbove: number;
  history: number[];
};

type MonEvent = {
  id: number;
  ts: number;
  kind: "camera" | "sensor";
  sourceId: string;
  sourceName: string;
  type: string;
  severity: Severity;
  message: string;
  cameraId?: string;
  box?: Box;
};

const CAMERAS = [
  { id: "CAM-1", name: "工區入口門禁" },
  { id: "CAM-2", name: "塔吊作業區" },
  { id: "CAM-3", name: "鋼筋加工區" },
  { id: "CAM-4", name: "地下室開挖面" },
];

const INITIAL_SENSORS: Sensor[] = [
  { id: "tilt", name: "結構傾斜", unit: "mm/m", value: 1.2, min: 0, max: 5, warnAbove: 3, history: [] },
  { id: "settle", name: "地表沉陷", unit: "mm", value: 4, min: 0, max: 30, warnAbove: 15, history: [] },
  { id: "noise", name: "噪音", unit: "dB", value: 68, min: 40, max: 105, warnAbove: 85, history: [] },
  { id: "pm25", name: "粉塵 PM2.5", unit: "µg/m³", value: 35, min: 0, max: 150, warnAbove: 75, history: [] },
  { id: "power", name: "總用電", unit: "kW", value: 220, min: 0, max: 400, warnAbove: 320, history: [] },
  { id: "gas", name: "可燃氣體", unit: "%LEL", value: 3, min: 0, max: 25, warnAbove: 10, history: [] },
];

const CAMERA_EVENTS: { type: string; severity: Severity }[] = [
  { type: "未戴安全帽", severity: "critical" },
  { type: "未穿反光背心", severity: "warning" },
  { type: "人員進入吊掛危險區", severity: "critical" },
  { type: "車輛與人員動線衝突", severity: "warning" },
  { type: "明火／動火作業", severity: "critical" },
  { type: "人員跌倒偵測", severity: "critical" },
  { type: "區域滯留逾時", severity: "info" },
];

const SEV: Record<Severity, { label: string; badge: string; dot: string; box: string }> = {
  critical: {
    label: "危急",
    badge: "bg-destructive text-white",
    dot: "bg-destructive",
    box: "border-destructive",
  },
  warning: {
    label: "注意",
    badge: "bg-warning-soft text-warning",
    dot: "bg-warning",
    box: "border-warning",
  },
  info: {
    label: "提示",
    badge: "bg-muted text-muted-foreground",
    dot: "bg-muted-foreground",
    box: "border-muted-foreground",
  },
};

let seq = 1;
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));

function fmtTime(ts: number) {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export function MonitoringBoard({ projectName }: { projectName?: string }) {
  const [sensors, setSensors] = useState<Sensor[]>(INITIAL_SENSORS);
  const [events, setEvents] = useState<MonEvent[]>([]);
  const [running, setRunning] = useState(true);
  const [now, setNow] = useState(0);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const startRef = useRef(0);

  const reviewing = selectedId !== null;

  // Info: (20260721 - Luphia) 模擬迴圈：每 2 秒更新感測值並可能產生事件（僅在啟動且非回溯時）
  useEffect(() => {
    startRef.current = Date.now();
    const id = requestAnimationFrame(() => setNow(Date.now()));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    if (!running || reviewing) return;
    const timer = setInterval(() => {
      const t = Date.now();
      setNow(t);
      const newEvents: MonEvent[] = [];

      setSensors((prev) =>
        prev.map((s) => {
          let v = s.value + rand(-1, 1) * (s.max - s.min) * 0.04;
          if (Math.random() < 0.08) v += (s.max - s.min) * 0.25; // Info: (20260721 - Luphia) 偶發尖峰
          v = clamp(Math.round(v * 10) / 10, s.min, s.max);
          if (v > s.warnAbove && Math.random() < 0.5) {
            newEvents.push({
              id: seq++,
              ts: t,
              kind: "sensor",
              sourceId: s.id,
              sourceName: s.name,
              type: `${s.name}超標`,
              severity: v > s.warnAbove * 1.15 ? "critical" : "warning",
              message: `${s.name} ${v}${s.unit}（門檻 ${s.warnAbove}${s.unit}）`,
            });
          }
          return { ...s, value: v, history: [...s.history, v].slice(-24) };
        }),
      );

      // Info: (20260721 - Luphia) 攝影機偵測事件
      if (Math.random() < 0.55) {
        const cam = CAMERAS[Math.floor(Math.random() * CAMERAS.length)];
        const ev = CAMERA_EVENTS[Math.floor(Math.random() * CAMERA_EVENTS.length)];
        newEvents.push({
          id: seq++,
          ts: t,
          kind: "camera",
          sourceId: cam.id,
          sourceName: cam.name,
          type: ev.type,
          severity: ev.severity,
          message: `${cam.name} 偵測到「${ev.type}」`,
          cameraId: cam.id,
          box: {
            x: rand(8, 62),
            y: rand(12, 55),
            w: rand(18, 30),
            h: rand(26, 42),
          },
        });
      }

      if (newEvents.length) {
        setEvents((prev) => [...newEvents.reverse(), ...prev].slice(0, 120));
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [running, reviewing]);

  const selectedEvent = useMemo(
    () => events.find((e) => e.id === selectedId) ?? null,
    [events, selectedId],
  );

  // Info: (20260721 - Luphia) 各攝影機當前標注（回溯時顯示選定事件；即時時顯示近 6 秒事件）
  const cameraBox = useMemo(() => {
    const map: Record<string, MonEvent | undefined> = {};
    if (reviewing && selectedEvent?.cameraId) {
      map[selectedEvent.cameraId] = selectedEvent;
      return map;
    }
    for (const cam of CAMERAS) {
      map[cam.id] = events.find(
        (e) => e.cameraId === cam.id && now - e.ts < 6000,
      );
    }
    return map;
  }, [events, now, reviewing, selectedEvent]);

  const attention = events.filter((e) => e.severity !== "info");
  const criticalCount = events.filter((e) => e.severity === "critical").length;

  const oldest = events.length ? events[events.length - 1].ts : now;
  const span = Math.max(now - oldest, 1);

  function selectEvent(id: number) {
    setSelectedId(id);
    setRunning(false);
  }
  function backToLive() {
    setSelectedId(null);
    setRunning(true);
    setNow(Date.now());
  }

  return (
    <div className="space-y-5">
      {/* Info: (20260721 - Luphia) 控制列 */}
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium",
            reviewing
              ? "bg-muted text-muted-foreground"
              : "bg-destructive/10 text-destructive",
          )}
        >
          {reviewing ? (
            <>
              <Rewind className="size-3.5" /> 回溯檢視
            </>
          ) : (
            <>
              <span className="size-2 animate-pulse rounded-full bg-destructive" />
              即時監測
            </>
          )}
        </span>

        {reviewing ? (
          <button
            type="button"
            onClick={backToLive}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Radio className="size-4" /> 返回即時
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setRunning((r) => !r)}
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent"
          >
            {running ? <Pause className="size-4" /> : <Play className="size-4" />}
            {running ? "暫停" : "繼續"}
          </button>
        )}

        <div className="ml-auto flex items-center gap-4 text-xs text-muted-foreground">
          {projectName ? (
            <span className="inline-flex items-center gap-1">
              <Cctv className="size-4" />
              {projectName}
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1">
            <ShieldAlert className="size-4 text-destructive" />
            危急 {criticalCount}
          </span>
          <span className="inline-flex items-center gap-1">
            <AlertTriangle className="size-4 text-warning" />
            需注意 {attention.length}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        {/* Info: (20260721 - Luphia) 攝影機牆 */}
        <div className="xl:col-span-2">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {CAMERAS.map((cam) => {
              const box = cameraBox[cam.id];
              const dimmed = reviewing && selectedEvent?.cameraId !== cam.id;
              return (
                <div
                  key={cam.id}
                  className={cn(
                    "relative aspect-video overflow-hidden rounded-lg border bg-neutral-900 text-white",
                    dimmed && "opacity-40",
                  )}
                  style={{
                    backgroundImage:
                      "radial-gradient(circle at 30% 20%, rgba(120,140,170,0.25), transparent 60%), radial-gradient(circle at 75% 80%, rgba(80,90,110,0.3), transparent 55%)",
                  }}
                >
                  {/* Info: (20260721 - Luphia) 掃描線 */}
                  <div className="pointer-events-none absolute inset-x-0 top-0 h-8 bg-gradient-to-b from-white/10 to-transparent cam-scan" />
                  {/* Info: (20260721 - Luphia) 頂列資訊 */}
                  <div className="absolute inset-x-0 top-0 flex items-center justify-between px-2 py-1 text-[10px]">
                    <span className="font-mono">{cam.id}</span>
                    <span className="inline-flex items-center gap-1">
                      <span
                        className={cn(
                          "size-1.5 rounded-full",
                          reviewing ? "bg-muted-foreground" : "animate-pulse bg-destructive",
                        )}
                      />
                      {reviewing ? "回溯" : "LIVE"}
                    </span>
                  </div>
                  {/* Info: (20260721 - Luphia) 標注框 */}
                  {box?.box ? (
                    <div
                      className={cn(
                        "absolute rounded border-2",
                        SEV[box.severity].box,
                      )}
                      style={{
                        left: `${box.box.x}%`,
                        top: `${box.box.y}%`,
                        width: `${box.box.w}%`,
                        height: `${box.box.h}%`,
                      }}
                    >
                      <span
                        className={cn(
                          "absolute -top-5 left-0 whitespace-nowrap rounded px-1 py-0.5 text-[10px] font-medium",
                          SEV[box.severity].badge,
                        )}
                      >
                        {box.type}
                      </span>
                    </div>
                  ) : null}
                  {/* Info: (20260721 - Luphia) 底列 */}
                  <div className="absolute inset-x-0 bottom-0 flex items-center justify-between px-2 py-1 text-[10px] text-white/80">
                    <span className="inline-flex items-center gap-1">
                      <Cctv className="size-3" />
                      {cam.name}
                    </span>
                    <span className="font-mono">
                      {box ? fmtTime(box.ts) : now ? fmtTime(now) : "--:--:--"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Info: (20260721 - Luphia) 時間軸 */}
          <div className="mt-4 rounded-lg border p-3">
            <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Activity className="size-3.5" /> 事件時間軸（點選回溯）
              </span>
              <span className="font-mono">
                {events.length ? `${fmtTime(oldest)} – ${fmtTime(now)}` : "尚無事件"}
              </span>
            </div>
            <div className="relative h-10 rounded bg-muted/50">
              {events.map((e) => {
                const left = ((e.ts - oldest) / span) * 100;
                return (
                  <button
                    key={e.id}
                    type="button"
                    title={`${fmtTime(e.ts)} ${e.type}`}
                    onClick={() => selectEvent(e.id)}
                    className={cn(
                      "absolute top-1 h-8 w-1.5 -translate-x-1/2 rounded-full transition-transform hover:scale-y-110",
                      SEV[e.severity].dot,
                      selectedId === e.id && "ring-2 ring-foreground",
                    )}
                    style={{ left: `${clamp(left, 0, 100)}%` }}
                  />
                );
              })}
            </div>
          </div>
        </div>

        {/* Info: (20260721 - Luphia) 右側：感測器 + 事件流 / 回溯詳情 */}
        <div className="space-y-4">
          {/* Info: (20260721 - Luphia) AIoT 感測器 */}
          <div className="rounded-lg border p-3">
            <div className="mb-2 text-sm font-medium">AIoT 感測器</div>
            <div className="grid grid-cols-2 gap-2">
              {sensors.map((s) => {
                const warn = s.value > s.warnAbove;
                return (
                  <div
                    key={s.id}
                    className={cn(
                      "rounded-md border p-2",
                      warn && "border-destructive/40 bg-destructive/5",
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-muted-foreground">
                        {s.name}
                      </span>
                      {warn ? (
                        <AlertTriangle className="size-3 text-destructive" />
                      ) : null}
                    </div>
                    <div
                      className={cn(
                        "mt-0.5 text-lg font-semibold tabular-nums",
                        warn && "text-destructive",
                      )}
                    >
                      {s.value}
                      <span className="ml-0.5 text-[10px] font-normal text-muted-foreground">
                        {s.unit}
                      </span>
                    </div>
                    <Spark values={s.history} warn={warn} />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Info: (20260721 - Luphia) 回溯詳情 或 事件流 */}
          {reviewing && selectedEvent ? (
            <div className="rounded-lg border p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium">回溯詳情</span>
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 text-[10px] font-medium",
                    SEV[selectedEvent.severity].badge,
                  )}
                >
                  {SEV[selectedEvent.severity].label}
                </span>
              </div>
              <div className="space-y-1 text-sm">
                <div className="font-medium">{selectedEvent.type}</div>
                <div className="text-xs text-muted-foreground">
                  {selectedEvent.message}
                </div>
                <div className="text-xs text-muted-foreground">
                  來源：{selectedEvent.sourceName}（{selectedEvent.sourceId}）
                </div>
                <div className="font-mono text-xs text-muted-foreground">
                  時間：{fmtTime(selectedEvent.ts)}
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border p-3">
              <div className="mb-2 text-sm font-medium">
                即時事件 ({events.length})
              </div>
              <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
                {events.length === 0 ? (
                  <p className="text-xs text-muted-foreground">監測中，尚無事件…</p>
                ) : (
                  events.slice(0, 40).map((e) => (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => selectEvent(e.id)}
                      className="flex w-full items-start gap-2 rounded-md border px-2 py-1.5 text-left text-xs hover:bg-accent"
                    >
                      <span
                        className={cn(
                          "mt-1 size-2 shrink-0 rounded-full",
                          SEV[e.severity].dot,
                        )}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="font-medium">{e.type}</span>
                        <span className="block truncate text-muted-foreground">
                          {e.sourceName}
                        </span>
                      </span>
                      <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                        {fmtTime(e.ts)}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Spark({ values, warn }: { values: number[]; warn: boolean }) {
  if (values.length < 2) {
    return <div className="mt-1 h-5" />;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * 100;
      const y = 100 - ((v - min) / range) * 100;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="mt-1 h-5 w-full">
      <polyline
        points={pts}
        fill="none"
        stroke={warn ? "var(--destructive)" : "var(--primary)"}
        strokeWidth={4}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
