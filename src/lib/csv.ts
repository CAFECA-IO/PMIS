/**
 * Info: (20260803 - Julian)
 * 通用單行 CSV 解析（RFC 4180 引號規則）：支援雙引號包夾含逗號/引號的欄位，`""` 表示跳脫的引號；每個欄位回傳前會 trim。
 */
export function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      fields.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  fields.push(current.trim());
  return fields;
}
