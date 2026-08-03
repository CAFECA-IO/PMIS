/**
 * Info: (20260803 - Julian)
 * 自訂圖表 DSL 解析器：將 markdown fence 內的 DSL 文字安全解析為圖表資料物件。
 * 純函式、決定論、不呼叫 LLM、不做數值計算；任何錯誤皆以結果物件回傳，對外永不 throw。
 * 自 iSunFA lib/utils/custom_chart_parser 移植；zod 結構驗證改為手寫型別守衛（PMIS 不用 zod）。
 */
import {
  CUSTOM_CHART_TYPE,
  CUSTOM_CHART_TYPES,
  CUSTOM_CHART_CONFIG_KEY,
  CUSTOM_CHART_PARSE_ERROR_CODE,
  CUSTOM_CHART_COMMENT_PREFIX,
  CUSTOM_CHART_PAIR_SEPARATORS,
  HEX_COLOR_REGEX,
  type CustomChartType,
  type CustomChartParseErrorCode,
} from "@/constant/custom-chart";
import type {
  MatrixAxis,
  MatrixChartData,
  TornadoChartData,
  TornadoMode,
  HistogramChartData,
  HistogramTrendType,
  BoxplotChartData,
} from "@/components/chart-primitives";
import { parseCsvLine } from "@/lib/csv";

// Info: (20260803 - Julian) 防呆上限，避免超大輸入拖垮解析
const MAX_INPUT_LENGTH = 20000;
const MAX_DATA_ROWS = 1000;

const TORNADO_MODES: readonly TornadoMode[] = ["compare", "sensitivity"];
const HISTOGRAM_TRENDS: readonly HistogramTrendType[] = ["normal"];

// Info: (20260803 - Julian) 各圖表允許的設定 key，用來區分設定列與資料列
const CONFIG_KEYS_BY_TYPE: Record<CustomChartType, Set<string>> = {
  [CUSTOM_CHART_TYPE.MATRIX]: new Set<string>([
    CUSTOM_CHART_CONFIG_KEY.TITLE,
    CUSTOM_CHART_CONFIG_KEY.X_AXIS,
    CUSTOM_CHART_CONFIG_KEY.Y_AXIS,
    CUSTOM_CHART_CONFIG_KEY.X_SCALE,
    CUSTOM_CHART_CONFIG_KEY.Y_SCALE,
    CUSTOM_CHART_CONFIG_KEY.QUADRANT_COLORS,
  ]),
  [CUSTOM_CHART_TYPE.TORNADO]: new Set<string>([
    CUSTOM_CHART_CONFIG_KEY.TITLE,
    CUSTOM_CHART_CONFIG_KEY.UNIT,
    CUSTOM_CHART_CONFIG_KEY.MODE,
    CUSTOM_CHART_CONFIG_KEY.BASELINE,
    CUSTOM_CHART_CONFIG_KEY.LEFT_COLOR,
    CUSTOM_CHART_CONFIG_KEY.RIGHT_COLOR,
  ]),
  [CUSTOM_CHART_TYPE.HISTOGRAM]: new Set<string>([
    CUSTOM_CHART_CONFIG_KEY.TITLE,
    CUSTOM_CHART_CONFIG_KEY.X_AXIS,
    CUSTOM_CHART_CONFIG_KEY.Y_AXIS,
    CUSTOM_CHART_CONFIG_KEY.TREND,
    CUSTOM_CHART_CONFIG_KEY.TREND_COLOR,
  ]),
  [CUSTOM_CHART_TYPE.BOXPLOT]: new Set<string>([
    CUSTOM_CHART_CONFIG_KEY.TITLE,
    CUSTOM_CHART_CONFIG_KEY.Y_AXIS,
    CUSTOM_CHART_CONFIG_KEY.UNIT,
  ]),
};

/** 公開解析結果：成功時帶圖種與對應資料，失敗時帶錯誤碼與訊息。永不 throw。 */
export type CustomChartParseResult =
  | { ok: true; type: typeof CUSTOM_CHART_TYPE.MATRIX; data: MatrixChartData }
  | { ok: true; type: typeof CUSTOM_CHART_TYPE.TORNADO; data: TornadoChartData }
  | {
      ok: true;
      type: typeof CUSTOM_CHART_TYPE.HISTOGRAM;
      data: HistogramChartData;
    }
  | { ok: true; type: typeof CUSTOM_CHART_TYPE.BOXPLOT; data: BoxplotChartData }
  | { ok: false; code: CustomChartParseErrorCode; message: string };

// Info: (20260803 - Julian) 內部解析錯誤，攜帶錯誤碼；於公開 API 邊界轉為結果物件
class CustomChartParseError extends Error {
  public readonly code: CustomChartParseErrorCode;

  constructor(code: CustomChartParseErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

const malformed = (message: string): CustomChartParseError =>
  new CustomChartParseError(
    CUSTOM_CHART_PARSE_ERROR_CODE.MALFORMED_ROW,
    message,
  );

/** 字串轉有限數字；空字串或非數字則拋 INVALID_NUMBER（不做任何計算）。 */
const toNumber = (raw: string, ctx: string): number => {
  const trimmed = raw.trim();
  const n = Number(trimmed);
  if (trimmed === "" || !Number.isFinite(n)) {
    throw new CustomChartParseError(
      CUSTOM_CHART_PARSE_ERROR_CODE.INVALID_NUMBER,
      `「${ctx}」不是有效數字：「${raw}」`,
    );
  }
  return n;
};

const optionalNumber = (
  raw: string | undefined,
  ctx: string,
): number | undefined => (raw === undefined ? undefined : toNumber(raw, ctx));

/** 判斷欄位是否為有效數字（供龍捲風圖偵測標題列 vs 資料列，不做計算）。 */
const isNumericField = (raw: string | undefined): boolean => {
  if (raw === undefined) return false;
  const trimmed = raw.trim();
  return trimmed !== "" && Number.isFinite(Number(trimmed));
};

/** 移除 VS16（emoji 變體選擇符）以相容 ↔️。 */
const stripVariationSelector = (raw: string): string =>
  raw.replace(/️/g, "");

/**
 * 新式標題列：單一 CSV 欄位且含配對分隔符（如 `悲觀 <-> 樂觀`）。回傳分隔後各段；
 * 非新式標題列回 null。必須以「欄數 === 1」為前提，避免類別名含分隔符的資料列被誤判。
 */
const splitPairHeader = (fields: string[]): string[] | null => {
  if (fields.length !== 1) return null;
  const cleaned = stripVariationSelector(fields[0]);
  for (const sep of CUSTOM_CHART_PAIR_SEPARATORS) {
    if (cleaned.includes(sep)) {
      return cleaned.split(sep).map((s) => s.trim());
    }
  }
  return null;
};

/** Legacy 三欄式標題列：`類別欄, 左數列, 右數列`，以「第 2、3 欄皆非數字」推測。 */
const isLegacyTornadoHeaderFields = (fields: string[]): boolean =>
  fields.length >= 3 && !isNumericField(fields[1]) && !isNumericField(fields[2]);

/** 由標題列欄位取出左右數列名稱；非標題列回 null，新式分段超過 2 段亦回 null。 */
const getTornadoHeaderSeries = (
  fields: string[],
): { leftSeries?: string; rightSeries?: string } | null => {
  const pair = splitPairHeader(fields);
  if (pair) {
    if (pair.length !== 2) return null;
    return {
      leftSeries: pair[0] || undefined,
      rightSeries: pair[1] || undefined,
    };
  }
  if (!isLegacyTornadoHeaderFields(fields)) return null;
  return {
    leftSeries: fields[1].trim() || undefined,
    rightSeries: fields[2].trim() || undefined,
  };
};

/** 新式標題列是否分段過多（如 `A <-> B <-> C`），供 fail fast。 */
const isMalformedPairHeader = (fields: string[]): boolean => {
  const pair = splitPairHeader(fields);
  return pair !== null && pair.length !== 2;
};

/**
 * 解析雙極軸文字：分隔符左邊為 min 端、右邊為 max 端（順序即語意）。
 * 先移除 VS16 以相容 ↔️。無分隔符則整串視為 max 端標籤。
 */
const parseAxis = (value: string, scale: number | undefined): MatrixAxis => {
  const cleaned = stripVariationSelector(value).trim();
  const axis: MatrixAxis = {};
  if (scale !== undefined) axis.scale = scale;

  for (const sep of CUSTOM_CHART_PAIR_SEPARATORS) {
    const idx = cleaned.indexOf(sep);
    if (idx !== -1) {
      const min = cleaned.slice(0, idx).trim();
      const max = cleaned.slice(idx + sep.length).trim();
      if (min) axis.min = min;
      if (max) axis.max = max;
      return axis;
    }
  }

  if (cleaned) axis.max = cleaned;
  return axis;
};

/**
 * 前處理：正規化換行、去註解與空行、逐行 trim，並分流設定列（key: value）與資料列（CSV）。
 * 設定列判定：冒號在逗號之前，且冒號前的 key 屬於該圖表的白名單。
 */
const preprocess = (
  type: CustomChartType,
  raw: string,
): { config: Map<string, string>; dataLines: string[] } => {
  const allowed = CONFIG_KEYS_BY_TYPE[type];
  const config = new Map<string, string>();
  const dataLines: string[] = [];

  const lines = raw.replace(/\r\n?/g, "\n").split("\n");
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith(CUSTOM_CHART_COMMENT_PREFIX)) continue;

    const colonIdx = line.indexOf(":");
    const commaIdx = line.indexOf(",");
    const isConfig =
      colonIdx !== -1 &&
      (commaIdx === -1 || colonIdx < commaIdx) &&
      allowed.has(line.slice(0, colonIdx).trim().toLowerCase());

    if (isConfig) {
      const key = line.slice(0, colonIdx).trim().toLowerCase();
      const value = line.slice(colonIdx + 1).trim();
      config.set(key, value);
    } else {
      dataLines.push(line);
    }
  }

  return { config, dataLines };
};

const buildMatrix = (
  config: Map<string, string>,
  dataLines: string[],
): MatrixChartData => {
  const title = config.get(CUSTOM_CHART_CONFIG_KEY.TITLE) || undefined;
  const xScale = optionalNumber(
    config.get(CUSTOM_CHART_CONFIG_KEY.X_SCALE),
    "xScale",
  );
  const yScale = optionalNumber(
    config.get(CUSTOM_CHART_CONFIG_KEY.Y_SCALE),
    "yScale",
  );
  const xAxis = parseAxis(config.get(CUSTOM_CHART_CONFIG_KEY.X_AXIS) ?? "", xScale);
  const yAxis = parseAxis(config.get(CUSTOM_CHART_CONFIG_KEY.Y_AXIS) ?? "", yScale);

  const quadrantRaw = config.get(CUSTOM_CHART_CONFIG_KEY.QUADRANT_COLORS);
  const quadrantColors = quadrantRaw
    ? parseCsvLine(quadrantRaw)
        .map((c) => c.trim())
        .filter((c) => c !== "")
        .map((c) => {
          if (!HEX_COLOR_REGEX.test(c)) {
            throw malformed(`象限底色非有效 HEX：「${c}」`);
          }
          return c;
        })
    : [];

  const groupColors: Record<string, string> = {};

  const points = dataLines.map((line) => {
    const f = parseCsvLine(line);
    if (f.length < 3) {
      throw malformed(`矩陣資料列需至少 3 欄（label, x, y）：「${line}」`);
    }
    const label = f[0];
    if (!label) throw malformed(`矩陣資料列缺少標籤：「${line}」`);
    const group = f[3]?.trim() || undefined;

    const color = f[4]?.trim();
    if (color) {
      if (!HEX_COLOR_REGEX.test(color)) {
        throw malformed(`矩陣資料列的群組顏色非有效 HEX：「${color}」`);
      }
      if (group && groupColors[group] === undefined) {
        groupColors[group] = color;
      }
    }

    const base = { label, x: toNumber(f[1], "x"), y: toNumber(f[2], "y") };
    return group ? { ...base, group } : base;
  });

  return {
    ...(title ? { title } : {}),
    xAxis,
    yAxis,
    points,
    ...(Object.keys(groupColors).length > 0 ? { groupColors } : {}),
    ...(quadrantColors.length > 0 ? { quadrantColors } : {}),
  };
};

const buildTornado = (
  config: Map<string, string>,
  dataLines: string[],
): TornadoChartData => {
  const title = config.get(CUSTOM_CHART_CONFIG_KEY.TITLE) || undefined;
  const unit = config.get(CUSTOM_CHART_CONFIG_KEY.UNIT) || undefined;

  const modeRaw = config
    .get(CUSTOM_CHART_CONFIG_KEY.MODE)
    ?.trim()
    .toLowerCase();
  let mode: TornadoMode | undefined;
  if (modeRaw !== undefined && modeRaw !== "") {
    const matched = TORNADO_MODES.find((m) => m === modeRaw);
    if (!matched) {
      throw malformed(
        `不支援的龍捲風圖型別：「${modeRaw}」（僅支援 compare / sensitivity）`,
      );
    }
    mode = matched;
  }

  const baseline = optionalNumber(
    config.get(CUSTOM_CHART_CONFIG_KEY.BASELINE),
    "baseline",
  );

  const parseSeriesColor = (
    raw: string | undefined,
    ctx: string,
  ): string | undefined => {
    const color = raw?.trim();
    if (!color) return undefined;
    if (!HEX_COLOR_REGEX.test(color)) {
      throw malformed(`龍捲風「${ctx}」顏色非有效 HEX：「${color}」`);
    }
    return color;
  };
  const leftColor = parseSeriesColor(
    config.get(CUSTOM_CHART_CONFIG_KEY.LEFT_COLOR),
    "leftColor",
  );
  const rightColor = parseSeriesColor(
    config.get(CUSTOM_CHART_CONFIG_KEY.RIGHT_COLOR),
    "rightColor",
  );

  const firstFields = parseCsvLine(dataLines[0]);
  if (isMalformedPairHeader(firstFields)) {
    throw malformed(`龍捲風標題列僅能有左右兩個數列名稱：「${dataLines[0]}」`);
  }
  const headerSeries = getTornadoHeaderSeries(firstFields);
  const hasHeader = headerSeries !== null;

  const leftSeries = headerSeries?.leftSeries;
  const rightSeries = headerSeries?.rightSeries;

  const rows = hasHeader ? dataLines.slice(1) : dataLines;
  if (rows.length === 0) {
    throw new CustomChartParseError(
      CUSTOM_CHART_PARSE_ERROR_CODE.NO_DATA_ROWS,
      "龍捲風圖僅有標題列，缺少資料列",
    );
  }

  const bars = rows.map((line) => {
    const f = parseCsvLine(line);
    if (f.length !== 3) {
      throw malformed(
        `龍捲風資料列需 3 欄（category, ${leftSeries ?? "left"}, ${rightSeries ?? "right"}）：「${line}」`,
      );
    }
    const category = f[0].trim();
    if (!category) throw malformed(`龍捲風資料列缺少項目名稱：「${line}」`);
    return {
      category,
      left: toNumber(f[1], leftSeries ?? "left"),
      right: toNumber(f[2], rightSeries ?? "right"),
    };
  });

  return {
    ...(title ? { title } : {}),
    ...(unit ? { unit } : {}),
    ...(mode ? { mode } : {}),
    ...(baseline !== undefined ? { baseline } : {}),
    ...(leftSeries ? { leftSeries } : {}),
    ...(rightSeries ? { rightSeries } : {}),
    ...(leftColor ? { leftColor } : {}),
    ...(rightColor ? { rightColor } : {}),
    bars,
  };
};

const buildHistogram = (
  config: Map<string, string>,
  dataLines: string[],
): HistogramChartData => {
  const title = config.get(CUSTOM_CHART_CONFIG_KEY.TITLE) || undefined;
  const xAxis = config.get(CUSTOM_CHART_CONFIG_KEY.X_AXIS) || undefined;
  const yAxis = config.get(CUSTOM_CHART_CONFIG_KEY.Y_AXIS) || undefined;

  const trendRaw = config.get(CUSTOM_CHART_CONFIG_KEY.TREND)?.toLowerCase();
  let trend: HistogramTrendType | undefined;
  if (trendRaw !== undefined) {
    const match = HISTOGRAM_TRENDS.find((t) => t === trendRaw);
    if (!match) {
      throw malformed(
        `不支援的 trend 類型：「${trendRaw}」（目前僅支援 normal）`,
      );
    }
    trend = match;
  }

  const trendColorRaw = config.get(CUSTOM_CHART_CONFIG_KEY.TREND_COLOR)?.trim();
  let trendColor: string | undefined;
  if (trendColorRaw) {
    if (!HEX_COLOR_REGEX.test(trendColorRaw)) {
      throw malformed(`趨勢線顏色非有效 HEX：「${trendColorRaw}」`);
    }
    trendColor = trendColorRaw;
  }

  const bins = dataLines.map((line) => {
    const f = parseCsvLine(line);
    if (f.length !== 2) {
      throw malformed(`直方圖資料列需 2 欄（bin, count）：「${line}」`);
    }
    const label = f[0];
    if (!label) throw malformed(`直方圖資料列缺少分箱標籤：「${line}」`);
    return { label, count: toNumber(f[1], "count") };
  });

  return {
    ...(title ? { title } : {}),
    ...(xAxis ? { xAxis } : {}),
    ...(yAxis ? { yAxis } : {}),
    ...(trend ? { trend } : {}),
    ...(trendColor ? { trendColor } : {}),
    bins,
  };
};

const buildBox = (
  config: Map<string, string>,
  dataLines: string[],
): BoxplotChartData => {
  const title = config.get(CUSTOM_CHART_CONFIG_KEY.TITLE) || undefined;
  const yAxis = config.get(CUSTOM_CHART_CONFIG_KEY.Y_AXIS) || undefined;
  const unit = config.get(CUSTOM_CHART_CONFIG_KEY.UNIT) || undefined;

  const boxes = dataLines.map((line) => {
    const f = parseCsvLine(line);
    if (f.length < 6 || f.length > 7) {
      throw malformed(
        `盒鬚圖資料列需 6 或 7 欄（label, min, q1, median, q3, max[, outliers]）：「${line}」`,
      );
    }
    const label = f[0];
    if (!label) throw malformed(`盒鬚圖資料列缺少標籤：「${line}」`);

    const box = {
      label,
      min: toNumber(f[1], "min"),
      q1: toNumber(f[2], "q1"),
      median: toNumber(f[3], "median"),
      q3: toNumber(f[4], "q3"),
      max: toNumber(f[5], "max"),
    };

    if (f.length === 7 && f[6].trim() !== "") {
      const outliers = f[6]
        .split(";")
        .map((s) => s.trim())
        .filter((s) => s !== "")
        .map((s) => toNumber(s, "outlier"));
      if (outliers.length > 0) return { ...box, outliers };
    }
    return box;
  });

  return {
    ...(title ? { title } : {}),
    ...(yAxis ? { yAxis } : {}),
    ...(unit ? { unit } : {}),
    boxes,
  };
};

// ── 手寫結構守衛（取代 zod；確保陣列非空、必填數值有限、標籤非空）──────────
const isFiniteNum = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);
const isNonEmptyStr = (v: unknown): v is string =>
  typeof v === "string" && v.length > 0;

const validateMatrix = (d: MatrixChartData): boolean =>
  d.points.length > 0 &&
  d.points.every(
    (p) => isNonEmptyStr(p.label) && isFiniteNum(p.x) && isFiniteNum(p.y),
  );

const validateTornado = (d: TornadoChartData): boolean =>
  d.bars.length > 0 &&
  d.bars.every(
    (b) =>
      isNonEmptyStr(b.category) && isFiniteNum(b.left) && isFiniteNum(b.right),
  );

const validateHistogram = (d: HistogramChartData): boolean =>
  d.bins.length > 0 &&
  d.bins.every((b) => isNonEmptyStr(b.label) && isFiniteNum(b.count));

const validateBox = (d: BoxplotChartData): boolean =>
  d.boxes.length > 0 &&
  d.boxes.every(
    (b) =>
      isNonEmptyStr(b.label) &&
      isFiniteNum(b.min) &&
      isFiniteNum(b.q1) &&
      isFiniteNum(b.median) &&
      isFiniteNum(b.q3) &&
      isFiniteNum(b.max) &&
      (b.outliers === undefined || b.outliers.every(isFiniteNum)),
  );

/** 由 Markdown fence 語言判斷是否為自訂圖表；非自訂圖表回 null。 */
export function detectCustomChartType(lang: string): CustomChartType | null {
  const normalized = (lang ?? "").trim().toLowerCase();
  return CUSTOM_CHART_TYPES.find((t) => t === normalized) ?? null;
}

const fail = (
  code: CustomChartParseErrorCode,
  message: string,
): CustomChartParseResult => ({ ok: false, code, message });

/**
 * 自訂圖表核心解析器：將 DSL 字串安全解析為圖表資料。
 * 純函式、決定論、不呼叫 LLM、不做數值計算；任何錯誤皆以結果物件回傳，對外永不 throw。
 */
export function parseCustomChart(
  type: CustomChartType,
  raw: string,
): CustomChartParseResult {
  const { EMPTY_CONTENT, MALFORMED_ROW, NO_DATA_ROWS, SCHEMA_VALIDATION_FAILED } =
    CUSTOM_CHART_PARSE_ERROR_CODE;
  try {
    if (typeof raw !== "string" || raw.trim() === "") {
      return fail(EMPTY_CONTENT, "圖表內容為空");
    }
    if (raw.length > MAX_INPUT_LENGTH) {
      return fail(MALFORMED_ROW, "圖表內容過長");
    }

    const { config, dataLines } = preprocess(type, raw);
    if (dataLines.length === 0) {
      return fail(NO_DATA_ROWS, "缺少資料列");
    }
    if (dataLines.length > MAX_DATA_ROWS) {
      return fail(MALFORMED_ROW, "資料列數過多");
    }

    switch (type) {
      case CUSTOM_CHART_TYPE.MATRIX: {
        const data = buildMatrix(config, dataLines);
        if (!validateMatrix(data)) {
          return fail(SCHEMA_VALIDATION_FAILED, "矩陣圖結構驗證失敗");
        }
        return { ok: true, type: CUSTOM_CHART_TYPE.MATRIX, data };
      }
      case CUSTOM_CHART_TYPE.TORNADO: {
        const data = buildTornado(config, dataLines);
        if (!validateTornado(data)) {
          return fail(SCHEMA_VALIDATION_FAILED, "龍捲風圖結構驗證失敗");
        }
        return { ok: true, type: CUSTOM_CHART_TYPE.TORNADO, data };
      }
      case CUSTOM_CHART_TYPE.HISTOGRAM: {
        const data = buildHistogram(config, dataLines);
        if (!validateHistogram(data)) {
          return fail(SCHEMA_VALIDATION_FAILED, "直方圖結構驗證失敗");
        }
        return { ok: true, type: CUSTOM_CHART_TYPE.HISTOGRAM, data };
      }
      case CUSTOM_CHART_TYPE.BOXPLOT: {
        const data = buildBox(config, dataLines);
        if (!validateBox(data)) {
          return fail(SCHEMA_VALIDATION_FAILED, "箱型圖結構驗證失敗");
        }
        return { ok: true, type: CUSTOM_CHART_TYPE.BOXPLOT, data };
      }
      default:
        return fail(
          CUSTOM_CHART_PARSE_ERROR_CODE.UNKNOWN_TYPE,
          `未知的自訂圖表類型：${String(type)}`,
        );
    }
  } catch (error) {
    if (error instanceof CustomChartParseError) {
      return fail(error.code, error.message);
    }
    // Info: (20260803 - Julian) 未預期錯誤一律收斂為驗證失敗，確保 render 不崩潰
    return fail(SCHEMA_VALIDATION_FAILED, "解析發生未預期錯誤");
  }
}
