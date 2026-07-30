import { classify } from "@/service/docExtract.service";
import {
  CHAT_DATASETS,
  datasetSpec,
  type ChatDatasetSpec,
} from "@/constant/chat-retrieval";

/**
 * 費思對話的兩段式檢索（純函式，無 I/O，便於單元測試）。
 *
 * 問題 ——
 * 對話管線沒有工具呼叫，模型無從自己去翻資料庫；但使用者問的是
 * 「這個案子的監造問題」，光靠通識只能給空話，或更糟：憑常識編造數字。
 *
 * 作法 ——
 *  第一段（規劃）：把問題與「本專案有哪些檔案、有哪些資料可查」的清單交給模型，
 *    由它回答需不需要查、要查哪幾份。刻意讓它能回答「不需要」——
 *    「材料送審流程怎麼跑」是通則問題，硬去讀合約只是多花錢又更慢。
 *  第二段（回答）：把選中的內容讀出來注入上下文再回答。
 *
 * 本模組負責清單成形、把模型的挑選對回實際檔案、控制閱讀量，
 * 以及產生給使用者看的「參考了什麼」說明。實際讀檔與查表在
 * chatContext.service.ts。
 */

// ── 清單 ────────────────────────────────────────────────────

/** 檔案的可讀性：可轉文字、需模型原生判讀（PDF／影像）、無法閱讀。 */
export type FileReadability = "text" | "native" | "none";

/**
 * 檔案來源。虛擬來源的取檔路徑不同，故須隨身帶著。
 *
 * 不含簽核文件附件：那批資料在模型上沒有專案歸屬，
 * 放進來等於讓別案的文件成為本案答案的依據（見 fileManager.inventory）。
 */
export type FileSource = "project" | "faith" | "ehs";

export type RawFile = {
  id: string;
  source: FileSource;
  name: string;
  /** 顯示路徑，如「捷運藍線 / 契約文件」。 */
  path: string;
  mimeType: string | null;
  size: number;
  updatedAt: string | null;
};

export type ManifestFile = RawFile & {
  /** 給模型指認用的短代號，如 F3。 */
  ref: string;
  readability: FileReadability;
};

export type ManifestDataset = { id: string; label: string; hint: string };

export type RetrievalManifest = {
  projectName: string;
  files: ManifestFile[];
  datasets: ManifestDataset[];
  /** 檔案數超過清單上限而被截斷；模型與使用者都該知道清單不完整。 */
  filesTruncated: boolean;
  /** 專案內的檔案總數（截斷前）。 */
  totalFiles: number;
};

/**
 * 清單最多列幾份檔案。
 *
 * 上限存在的理由是規劃那一段的輸入長度：每份檔案約占 30～60 字，
 * 80 份仍在幾千 token 內，再多則規劃本身變貴，且模型挑選品質下降。
 */
export const MAX_MANIFEST_FILES = 80;

/** 依 MIME 與檔名判斷可讀性。副檔名為輔，因為 Office 的 MIME 常不可靠。 */
export function readabilityOf(
  mimeType: string | null,
  name: string,
): FileReadability {
  const kind = classify(mimeType ?? "", name);
  if (kind === "native") return "native";
  if (kind === "unknown") return "none";
  return "text";
}

/**
 * 組出檢索清單。
 *
 * 排序刻意把讀不到的檔案排到最後 —— 清單被截斷時，該犧牲的是
 * 反正也讀不出內容的檔案；但仍保留在清單上，讓費思能回答
 * 「有這份文件，但格式我讀不了」，而不是假裝它不存在。
 * 同一可讀性內以更新時間新者為先。
 */
export function buildManifest(input: {
  projectName: string;
  files: RawFile[];
  datasets: ManifestDataset[];
}): RetrievalManifest {
  const rank: Record<FileReadability, number> = { text: 0, native: 1, none: 2 };
  const scored = input.files.map((f) => ({
    ...f,
    readability: readabilityOf(f.mimeType, f.name),
  }));

  scored.sort((a, b) => {
    const byKind = rank[a.readability] - rank[b.readability];
    if (byKind !== 0) return byKind;
    const at = a.updatedAt ?? "";
    const bt = b.updatedAt ?? "";
    if (at !== bt) return at < bt ? 1 : -1;
    return a.name.localeCompare(b.name, "zh-Hant");
  });

  const kept = scored.slice(0, MAX_MANIFEST_FILES);
  return {
    projectName: input.projectName,
    files: kept.map((f, i) => ({ ...f, ref: `F${i + 1}` })),
    datasets: input.datasets,
    filesTruncated: scored.length > kept.length,
    totalFiles: scored.length,
  };
}

/** 依使用者的模組權限過濾可查的資料表。 */
export function allowedDatasets(
  canAccess: (moduleKey: string) => boolean,
  specs: ChatDatasetSpec[] = CHAT_DATASETS,
): ManifestDataset[] {
  return specs
    .filter((d) => canAccess(d.module))
    .map((d) => ({ id: d.id, label: d.label, hint: d.hint }));
}

const READABILITY_NOTE: Record<FileReadability, string> = {
  text: "可讀",
  native: "可讀（原檔判讀，成本較高）",
  none: "無法閱讀",
};

/** 檔案大小的可讀格式。 */
function sizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** 規劃階段交給模型的清單文字。 */
export function describeManifest(manifest: RetrievalManifest): string {
  const lines: string[] = [`專案：${manifest.projectName}`];

  lines.push("", "可調閱的檔案（以代號指認）：");
  if (manifest.files.length === 0) {
    lines.push("（本專案目前沒有任何檔案）");
  } else {
    for (const f of manifest.files) {
      const parts = [
        `${f.ref}. ${f.name}`,
        `位置：${f.path}`,
        `大小：${sizeLabel(f.size)}`,
        READABILITY_NOTE[f.readability],
      ];
      if (f.updatedAt) parts.push(`更新：${f.updatedAt.slice(0, 10)}`);
      lines.push(`- ${parts.join("｜")}`);
    }
    if (manifest.filesTruncated) {
      lines.push(
        `（檔案共 ${manifest.totalFiles} 份，僅列出上方 ${manifest.files.length} 份）`,
      );
    }
  }

  lines.push("", "可查詢的系統資料：");
  if (manifest.datasets.length === 0) {
    lines.push("（此使用者無可查詢的模組資料）");
  } else {
    for (const d of manifest.datasets) lines.push(`- ${d.id}：${d.label}，${d.hint}`);
  }

  return lines.join("\n");
}

// ── 把模型的挑選對回實際資料 ──────────────────────────────────

/** 模型回傳的檢索計畫。 */
export type RetrievalPlan = {
  reason?: string;
  needed?: boolean;
  files?: string[];
  datasets?: string[];
};

export type ResolvedPlan = {
  needed: boolean;
  reason: string;
  files: ManifestFile[];
  datasets: ManifestDataset[];
  /** 對不上清單的代號；只記錄不報錯，供紀錄檔追查模型是否在編代號。 */
  unknownRefs: string[];
};

/**
 * 把計畫對回實際檔案與資料表。
 *
 * 兩個刻意的容錯 ——
 *  1. 對不上的代號一律丟棄。模型偶爾會自己編一個 F99，
 *     若照著去取檔會變成「找不到檔案」的錯誤中斷整次回答。
 *  2. needed 為否卻仍列了東西時，以列出的內容為準。
 *     實際觀察到的矛盾多是模型漏改旗標，而非真的不需要；
 *     此時讀了頂多多花一次成本，不讀則直接答錯。
 */
export function resolvePlan(
  manifest: RetrievalManifest,
  plan: RetrievalPlan | null,
): ResolvedPlan {
  const empty: ResolvedPlan = {
    needed: false,
    reason: plan?.reason?.trim() || "",
    files: [],
    datasets: [],
    unknownRefs: [],
  };
  if (!plan) return { ...empty, reason: "無法取得檢索規劃" };

  const byRef = new Map(manifest.files.map((f) => [f.ref.toUpperCase(), f]));
  const files: ManifestFile[] = [];
  const unknownRefs: string[] = [];
  const seen = new Set<string>();

  for (const raw of plan.files ?? []) {
    const ref = String(raw).trim().toUpperCase();
    if (!ref || seen.has(ref)) continue;
    seen.add(ref);
    const hit = byRef.get(ref);
    if (hit) files.push(hit);
    else unknownRefs.push(ref);
  }

  const allowed = new Map(manifest.datasets.map((d) => [d.id, d]));
  const datasets: ManifestDataset[] = [];
  const seenSets = new Set<string>();
  for (const raw of plan.datasets ?? []) {
    const id = String(raw).trim();
    if (!id || seenSets.has(id)) continue;
    seenSets.add(id);
    const hit = allowed.get(id);
    if (hit) datasets.push(hit);
    else unknownRefs.push(id);
  }

  const picked = files.length > 0 || datasets.length > 0;
  return {
    needed: plan.needed === true || picked,
    reason: plan.reason?.trim() || "",
    files,
    datasets,
    unknownRefs,
  };
}

// ── 閱讀量控制 ──────────────────────────────────────────────

/** 一次最多讀幾份可轉文字的檔案。 */
export const MAX_TEXT_FILES = 3;
/** 一次最多送幾份原檔（PDF／影像）。這類最貴，故比文字更嚴。 */
export const MAX_NATIVE_FILES = 2;
/** 原檔合計大小上限。 */
export const MAX_NATIVE_BYTES = 15 * 1024 * 1024;
/** 一次最多查幾份系統資料。 */
export const MAX_DATASETS = 4;

export type SkipWhy =
  | "unreadable"
  | "too-many"
  | "too-large";

export const SKIP_REASON: Record<SkipWhy, string> = {
  unreadable: "格式無法閱讀",
  "too-many": "超過本次可閱讀的份數",
  "too-large": "原檔合計超過大小上限",
};

export type Budgeted = {
  /** 轉文字後注入上下文的檔案。 */
  text: ManifestFile[];
  /** 以原檔交模型判讀的檔案。 */
  native: ManifestFile[];
  skipped: { file: ManifestFile; why: SkipWhy }[];
  datasets: ManifestDataset[];
  droppedDatasets: ManifestDataset[];
};

/**
 * 套用閱讀上限。
 *
 * 被擠掉的檔案一律記在 skipped 並回報給使用者 —— 靜靜少讀一份，
 * 使用者會拿到一個看起來完整、實際上少了一份依據的答案，
 * 那比明說「這份沒讀」危險得多。
 */
export function applyBudget(plan: ResolvedPlan): Budgeted {
  const text: ManifestFile[] = [];
  const native: ManifestFile[] = [];
  const skipped: { file: ManifestFile; why: SkipWhy }[] = [];
  let nativeBytes = 0;

  for (const f of plan.files) {
    if (f.readability === "none") {
      skipped.push({ file: f, why: "unreadable" });
      continue;
    }
    if (f.readability === "text") {
      if (text.length >= MAX_TEXT_FILES) skipped.push({ file: f, why: "too-many" });
      else text.push(f);
      continue;
    }
    if (native.length >= MAX_NATIVE_FILES) {
      skipped.push({ file: f, why: "too-many" });
      continue;
    }
    if (nativeBytes + f.size > MAX_NATIVE_BYTES) {
      skipped.push({ file: f, why: "too-large" });
      continue;
    }
    nativeBytes += f.size;
    native.push(f);
  }

  return {
    text,
    native,
    skipped,
    datasets: plan.datasets.slice(0, MAX_DATASETS),
    droppedDatasets: plan.datasets.slice(MAX_DATASETS),
  };
}

// ── 注入上下文 ──────────────────────────────────────────────

/** 單一文件注入的字數上限。 */
export const MAX_TEXT_CHARS_PER_FILE = 30_000;
/** 整段上下文的字數上限。 */
export const MAX_CONTEXT_CHARS = 90_000;

export function capText(
  text: string,
  max = MAX_TEXT_CHARS_PER_FILE,
): { text: string; truncated: boolean } {
  if (text.length <= max) return { text, truncated: false };
  return { text: text.slice(0, max), truncated: true };
}

export type ContextSection = {
  /** 區塊標題，如「文件：01.契約本文(正).docx」。 */
  title: string;
  body: string;
};

/**
 * 塞不下時，區塊至少要留多少字才值得放進去。
 * 低於此值的殘篇讀起來像雜訊，不如明說未納入。
 */
const MIN_USEFUL_CHARS = 500;

/**
 * 組出注入模型的上下文。
 *
 * 開頭那句交代來源與使用規則是必要的 —— 沒有它，模型會把這段
 * 當成使用者說的話，於是「根據你提供的資料」這種錯誤歸屬就會出現；
 * 更麻煩的是它會覺得可以自由補完缺漏的欄位。
 *
 * 塞不下時的取捨：先截斷、不整份丟棄。
 * 順序反映模型的優先度，第一份通常就是契約；
 * 若「整份塞不下就跳過」，會發生把契約丟掉卻留下一條小附註的荒謬結果。
 */
export function contextBlock(sections: ContextSection[]): string | null {
  const usable = sections.filter((s) => s.body.trim().length > 0);
  if (usable.length === 0) return null;

  const head =
    "以下是系統自本專案實際調閱的資料，供你回答時引用。" +
    "只依據這些內容作答；資料未涵蓋的部分請明說不足，不要推測或補齊。";

  const out: string[] = [head];
  let used = head.length;
  const dropped: string[] = [];

  for (const s of usable) {
    const prefix = `\n\n【${s.title}】\n`;
    const body = s.body.trim();
    const room = MAX_CONTEXT_CHARS - used - prefix.length;

    if (room >= body.length) {
      out.push(prefix + body);
      used += prefix.length + body.length;
      continue;
    }
    if (room >= MIN_USEFUL_CHARS) {
      out.push(`${prefix}${body.slice(0, room)}\n（此段因長度限制僅節錄前段）`);
      used = MAX_CONTEXT_CHARS;
      continue;
    }
    dropped.push(s.title);
  }

  if (dropped.length > 0) {
    out.push(`\n\n（因長度限制，未納入：${dropped.join("、")}）`);
  }
  return out.join("");
}

/** 單一資料表最多列幾筆。超過則列前段並註明總筆數。 */
export const MAX_ROWS_PER_DATASET = 40;

/**
 * 把查表結果排成模型讀得懂的表格。
 *
 * 用制表符而非 JSON：同樣的資訊，表格的 token 數約只有 JSON 的一半，
 * 而模型對「首行是欄名」的表格辨識度很好。
 * 空值一律寫「—」，因為留空會讓欄位對不齊而錯位。
 */
export function renderTable(
  headers: string[],
  rows: (string | number | null | undefined)[][],
  cap = MAX_ROWS_PER_DATASET,
): string {
  if (rows.length === 0) return "（無資料）";
  const cell = (v: string | number | null | undefined) => {
    if (v === null || v === undefined) return "—";
    const s = String(v).replace(/[\t\n]+/g, " ").trim();
    return s === "" ? "—" : s;
  };
  const shown = rows.slice(0, cap);
  const lines = [headers.join("\t"), ...shown.map((r) => r.map(cell).join("\t"))];
  if (rows.length > shown.length) {
    lines.push(`（共 ${rows.length} 筆，僅列出前 ${shown.length} 筆）`);
  }
  return lines.join("\n");
}

/** 日期只取到日。時分秒對監造問題沒有意義，卻占字數。 */
export function dayOf(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const s = value instanceof Date ? value.toISOString() : String(value);
  return s.slice(0, 10);
}

// ── 給使用者看的說明 ────────────────────────────────────────

/**
 * 回答附上的來源說明。
 *
 * 這是可追溯性的最後一哩：使用者看到答案時要能判斷它是讀了合約得出的，
 * 還是模型的通識。沒讀任何東西時回 null，不要留一行空的「參考」。
 */
export function retrievalNote(budgeted: Budgeted): string | null {
  const read = [
    ...budgeted.text.map((f) => f.name),
    ...budgeted.native.map((f) => f.name),
    ...budgeted.datasets.map((d) => d.label),
  ];
  const parts: string[] = [];
  if (read.length > 0) parts.push(`參考：${read.join("、")}`);

  const missed = [
    ...budgeted.skipped.map((s) => `${s.file.name}（${SKIP_REASON[s.why]}）`),
    ...budgeted.droppedDatasets.map((d) => `${d.label}（超過本次可查的份數）`),
  ];
  if (missed.length > 0) parts.push(`未讀：${missed.join("、")}`);

  return parts.length > 0 ? parts.join("｜") : null;
}

/** 紀錄檔用的一行摘要，讓挑錯檔的情況事後可追。 */
export function planSummary(plan: ResolvedPlan, budgeted: Budgeted): string {
  const bits = [
    plan.needed ? "需檢索" : "不需檢索",
    `檔案 ${budgeted.text.length + budgeted.native.length}/${plan.files.length}`,
    `資料 ${budgeted.datasets.length}/${plan.datasets.length}`,
  ];
  if (plan.unknownRefs.length > 0) {
    bits.push(`無效代號 ${plan.unknownRefs.join(",")}`);
  }
  if (plan.reason) bits.push(`理由：${plan.reason}`);
  return bits.join("｜");
}

/** 目錄中所有合法的資料表 id，供 responseSchema 的 enum 使用。 */
export function datasetIds(datasets: ManifestDataset[]): string[] {
  return datasets.map((d) => d.id).filter((id) => Boolean(datasetSpec(id)));
}
