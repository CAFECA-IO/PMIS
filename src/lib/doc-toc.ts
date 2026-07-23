// Info: (20260722 - Luphia) 文件標題錨點：由標題文字產生穩定 id，供目錄跳轉與標題共用

/** 將標題文字轉為錨點 id（保留中英數字，其餘轉為連字號） */
export function slugifyHeading(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

export type TocItem = { id: string; text: string; level: 2 | 3 };

/**
 * 從 Markdown 內容擷取 h2／h3 標題作為章節目錄。
 * 會略過 mermaid／程式碼區塊內的 # 行，避免誤判。
 */
export function extractToc(markdown: string): TocItem[] {
  const items: TocItem[] = [];
  let inFence = false;
  for (const line of markdown.split("\n")) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = /^(#{2,3})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!m) continue;
    const level = m[1].length as 2 | 3;
    const text = m[2].replace(/[*`]/g, "").trim();
    items.push({ id: slugifyHeading(text), text, level });
  }
  return items;
}
