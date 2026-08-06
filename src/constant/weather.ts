import { Cloud, CloudLightning, Sun, Umbrella, Wind } from "lucide-react";

/** 天氣選項。value 直接就是存進 DB 與報表呈現的字串（列表與月報都原樣輸出）。 */
export const WEATHER_OPTIONS: { value: string; Icon: React.ElementType }[] = [
  { value: "晴", Icon: Sun },
  { value: "陰", Icon: Cloud },
  { value: "雨", Icon: Umbrella },
  { value: "雷", Icon: CloudLightning },
  { value: "颱風", Icon: Wind },
];

/**
 * 依天氣字串取對應圖示。
 * Info: (20260806 - Julian) 先精確比對；未命中再以「較劇烈者優先」的順序做子字串比對，
 * 讓「晴時多雲」「晴轉雨」等複合描述也能取到最具代表性的圖示；皆未命中回 null。
 */
const WEATHER_SEVERITY: readonly string[] = ["颱風", "雷", "雨", "陰", "晴"];

export const getWeatherIcon = (weather: string) => {
  const text = weather.trim();
  if (!text) return null;

  const exact = WEATHER_OPTIONS.find((w) => w.value === text);
  if (exact) return exact.Icon;

  const hit = WEATHER_SEVERITY.find((v) => text.includes(v));
  return hit ? (WEATHER_OPTIONS.find((w) => w.value === hit)?.Icon ?? null) : null;
};
