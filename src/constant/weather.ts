import { Cloud, Sun, Umbrella, Wind } from "lucide-react";

/** 天氣選項。value 直接就是存進 DB 與報表呈現的字串（列表與月報都原樣輸出）。 */
export const WEATHER_OPTIONS: { value: string; Icon: React.ElementType }[] = [
  { value: "晴", Icon: Sun },
  { value: "陰", Icon: Cloud },
  { value: "雨", Icon: Umbrella },
  { value: "颱風", Icon: Wind },
];
