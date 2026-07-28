import { unzipSync, strFromU8 } from "fflate";

/**
 * 文件文字擷取：把 Office (docx/xlsx/pptx) 與純文字檔轉為純文字，
 * 供 AI 判讀。PDF 與影像不在此處理——Gemini 可原生讀取，直接以 inlineData 送出。
 *
 * 注意：此模組僅供伺服器端使用（會引入 fflate）。前端只需 accept 字串，
 * 請改用 @/constant/ai 的 WIZARD_DOC_ACCEPT。
 */

/** 交由 Gemini 原生判讀（不需先轉文字）的 MIME。 */
const NATIVE_MIME = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
]);

const OOXML: Record<string, "docx" | "xlsx" | "pptx"> = {
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-excel.sheet.macroEnabled.12": "xlsx",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation":
    "pptx",
};

const PLAIN_MIME = new Set([
  "text/plain",
  "text/csv",
  "text/markdown",
  "application/json",
  "text/tab-separated-values",
]);

const EXT: Record<string, "docx" | "xlsx" | "pptx" | "plain" | "native"> = {
  docx: "docx",
  xlsx: "xlsx",
  xlsm: "xlsx",
  pptx: "pptx",
  txt: "plain",
  csv: "plain",
  tsv: "plain",
  md: "plain",
  json: "plain",
  pdf: "native",
  png: "native",
  jpg: "native",
  jpeg: "native",
  webp: "native",
};

/** 送交模型的文字上限，避免超出 token 預算。 */
const MAX_CHARS = 120_000;

function extOf(name?: string) {
  const m = /\.([a-z0-9]+)$/i.exec(name?.trim() ?? "");
  return m ? m[1].toLowerCase() : "";
}

/** 判斷此檔應如何處理。MIME 常不可靠（尤其 Office），故以副檔名為輔。 */
export function classify(
  mimeType: string,
  name?: string,
): "docx" | "xlsx" | "pptx" | "plain" | "native" | "unknown" {
  const mt = (mimeType || "").toLowerCase();
  if (NATIVE_MIME.has(mt)) return "native";
  if (OOXML[mt]) return OOXML[mt];
  if (PLAIN_MIME.has(mt)) return "plain";
  return EXT[extOf(name)] ?? "unknown";
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodeEntities(s: string) {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, body: string) => {
    if (body[0] === "#") {
      const code =
        body[1] === "x" || body[1] === "X"
          ? parseInt(body.slice(2), 16)
          : parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[body.toLowerCase()] ?? whole;
  });
}

/** 移除所有 XML 標籤並還原實體，壓縮多餘空白但保留換行。 */
function stripTags(xml: string) {
  return decodeEntities(xml.replace(/<[^>]*>/g, ""))
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

type Zip = Record<string, Uint8Array>;

function readXml(zip: Zip, path: string): string | null {
  const f = zip[path];
  return f ? strFromU8(f) : null;
}

// ── docx ────────────────────────────────────────────────────
function fromDocx(zip: Zip): string {
  const parts = [
    "word/document.xml",
    ...Object.keys(zip).filter((p) =>
      /^word\/(header|footer)\d*\.xml$/.test(p),
    ),
  ];
  const out: string[] = [];
  for (const p of parts) {
    const xml = readXml(zip, p);
    if (!xml) continue;
    // 先把結構性標記換成純文字換行/定位，再剝除其餘標籤
    const marked = xml
      .replace(/<w:tab\b[^>]*\/>/g, "\t")
      .replace(/<w:br\b[^>]*\/>/g, "\n")
      .replace(/<\/w:p>/g, "\n")
      .replace(/<\/w:tc>/g, "\t")
      .replace(/<\/w:tr>/g, "\n");
    // 儲存格內的段落換行會夾在欄位之間，收斂成單一定位字元讓表格維持一列
    const text = stripTags(marked)
      .replace(/\n+\t/g, "\t")
      .replace(/\t+\n/g, "\n");
    if (text) out.push(text);
  }
  return out.join("\n\n");
}

// ── pptx ────────────────────────────────────────────────────
function slideNo(path: string) {
  const m = /(\d+)\.xml$/.exec(path);
  return m ? Number(m[1]) : 0;
}

function fromPptx(zip: Zip): string {
  const slides = Object.keys(zip)
    .filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
    .sort((a, b) => slideNo(a) - slideNo(b));

  const out: string[] = [];
  for (const p of slides) {
    const xml = readXml(zip, p);
    if (!xml) continue;
    const marked = xml
      .replace(/<a:br\b[^>]*\/>/g, "\n")
      .replace(/<\/a:p>/g, "\n");
    const text = stripTags(marked);
    // 同時帶入該張投影片的備忘稿
    const notes = readXml(
      zip,
      `ppt/notesSlides/notesSlide${slideNo(p)}.xml`,
    );
    const noteText = notes
      ? stripTags(notes.replace(/<\/a:p>/g, "\n"))
      : "";
    if (text || noteText) {
      out.push(
        `— 投影片 ${slideNo(p)} —\n${text}` +
          (noteText ? `\n[備忘稿] ${noteText}` : ""),
      );
    }
  }
  return out.join("\n\n");
}

// ── xlsx ────────────────────────────────────────────────────
/** 共用字串表：<si> 內可能有多個 <t> run，需串接。 */
function sharedStrings(zip: Zip): string[] {
  const xml = readXml(zip, "xl/sharedStrings.xml");
  if (!xml) return [];
  const items = xml.match(/<si\b[\s\S]*?<\/si>/g) ?? [];
  return items.map((si) => {
    const runs = si.match(/<t\b[^>]*>([\s\S]*?)<\/t>/g) ?? [];
    return decodeEntities(
      runs.map((r) => r.replace(/<[^>]*>/g, "")).join(""),
    );
  });
}

/** 依 workbook.xml + rels 還原「工作表名稱 → sheet 檔路徑」。 */
function sheetOrder(zip: Zip): { name: string; path: string }[] {
  const wb = readXml(zip, "xl/workbook.xml");
  const rels = readXml(zip, "xl/_rels/workbook.xml.rels");
  const fallback = Object.keys(zip)
    .filter((p) => /^xl\/worksheets\/sheet\d+\.xml$/.test(p))
    .sort((a, b) => slideNo(a) - slideNo(b))
    .map((p, i) => ({ name: `工作表${i + 1}`, path: p }));
  if (!wb || !rels) return fallback;

  const relMap = new Map<string, string>();
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
    const tag = m[0];
    const id = /Id="([^"]+)"/.exec(tag)?.[1];
    const target = /Target="([^"]+)"/.exec(tag)?.[1];
    if (!id || !target) continue;
    const path = target.replace(/^\/?(xl\/)?/, "xl/");
    relMap.set(id, path);
  }

  const sheets: { name: string; path: string }[] = [];
  for (const m of wb.matchAll(/<sheet\b[^>]*\/?>/g)) {
    const tag = m[0];
    const name = /name="([^"]*)"/.exec(tag)?.[1];
    const rid = /r:id="([^"]+)"/.exec(tag)?.[1];
    const path = rid ? relMap.get(rid) : undefined;
    if (name && path && zip[path]) {
      sheets.push({ name: decodeEntities(name), path });
    }
  }
  return sheets.length ? sheets : fallback;
}

function fromXlsx(zip: Zip): string {
  const strings = sharedStrings(zip);
  const out: string[] = [];

  for (const { name, path } of sheetOrder(zip)) {
    const xml = readXml(zip, path);
    if (!xml) continue;
    const lines: string[] = [];

    for (const rowM of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      const cells: string[] = [];
      for (const cM of rowM[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
        const attrs = cM[1];
        const body = cM[2];
        const type = /t="([^"]+)"/.exec(attrs)?.[1];
        let value = "";
        if (type === "s") {
          const idx = Number(
            /<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? "-1",
          );
          value = strings[idx] ?? "";
        } else if (type === "inlineStr") {
          const runs = body.match(/<t\b[^>]*>([\s\S]*?)<\/t>/g) ?? [];
          value = decodeEntities(
            runs.map((r) => r.replace(/<[^>]*>/g, "")).join(""),
          );
        } else {
          value = decodeEntities(
            /<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? "",
          );
        }
        cells.push(value.replace(/\s+/g, " ").trim());
      }
      // 略過整列皆空的列
      if (cells.some((c) => c !== "")) lines.push(cells.join("\t"));
    }

    if (lines.length) out.push(`— 工作表：${name} —\n${lines.join("\n")}`);
  }
  return out.join("\n\n");
}

export type ExtractResult =
  | { kind: "native" }
  | { kind: "text"; text: string; truncated: boolean }
  | { kind: "unsupported" };

/**
 * 將檔案內容轉為純文字。
 * - native：PDF/影像，交由模型原生判讀（回傳不含文字）
 * - text：已擷取的文字
 * - unsupported：無法處理的格式
 */
export function extractDocumentText(
  data: Uint8Array,
  mimeType: string,
  name?: string,
): ExtractResult {
  const kind = classify(mimeType, name);
  if (kind === "native") return { kind: "native" };
  if (kind === "unknown") return { kind: "unsupported" };

  let text = "";
  if (kind === "plain") {
    text = strFromU8(data);
  } else {
    let zip: Zip;
    try {
      zip = unzipSync(data) as Zip;
    } catch {
      return { kind: "unsupported" };
    }
    text =
      kind === "docx"
        ? fromDocx(zip)
        : kind === "xlsx"
          ? fromXlsx(zip)
          : fromPptx(zip);
  }

  text = text.replace(/\r\n/g, "\n").trim();
  if (!text) return { kind: "unsupported" };

  const truncated = text.length > MAX_CHARS;
  return {
    kind: "text",
    text: truncated ? text.slice(0, MAX_CHARS) : text,
    truncated,
  };
}
