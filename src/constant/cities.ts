// Info: (20260721 - Luphia) 台灣縣市（含 ISO 3166-2:TW 代碼）
export type City = { name: string; code: string; alias?: string };

export const TW_CITIES: City[] = [
  { name: "臺北市", code: "TPE", alias: "台北市" },
  { name: "新北市", code: "NWT" },
  { name: "桃園市", code: "TAO" },
  { name: "臺中市", code: "TXG", alias: "台中市" },
  { name: "臺南市", code: "TNN", alias: "台南市" },
  { name: "高雄市", code: "KHH" },
  { name: "基隆市", code: "KEE" },
  { name: "新竹市", code: "HSZ" },
  { name: "新竹縣", code: "HSQ" },
  { name: "苗栗縣", code: "MIA" },
  { name: "彰化縣", code: "CHA" },
  { name: "南投縣", code: "NAN" },
  { name: "雲林縣", code: "YUN" },
  { name: "嘉義市", code: "CYI" },
  { name: "嘉義縣", code: "CYQ" },
  { name: "屏東縣", code: "PIF" },
  { name: "宜蘭縣", code: "ILA" },
  { name: "花蓮縣", code: "HUA" },
  { name: "臺東縣", code: "TTT", alias: "台東縣" },
  { name: "澎湖縣", code: "PEN" },
  { name: "金門縣", code: "KIN" },
  { name: "連江縣", code: "LIE" },
];

// Info: (20260721 - Luphia) 依名稱、別名或代碼過濾縣市（不分大小寫）
export function searchCities(query: string): City[] {
  const q = query.trim().toLowerCase();
  if (!q) return TW_CITIES;
  return TW_CITIES.filter(
    (c) =>
      c.name.toLowerCase().includes(q) ||
      c.code.toLowerCase().includes(q) ||
      (c.alias?.toLowerCase().includes(q) ?? false),
  );
}
