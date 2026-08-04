/**
 * Info: (20260803 - Julian)
 * 圖表展開器：把 LLM 產出的 ```pmis-chart 指令（僅含 dataset id + type，不含數字）
 * 換成由程式從白名單數據集決定論展開的 ```custom-* / ```mermaid 圍欄。
 * 這是零捏造的關鍵閘門：數字全來自 dataset.data，LLM 碰不到。永不 throw。
 */
import { CUSTOM_CHART_TYPE } from "@/constant/custom-chart";
import type { ChartKind, ReportDataset } from "@/service/report-datasets";

const FENCE = "```";

/** CSV 欄位序列化：含逗號/引號/前後空白時以雙引號包夾並跳脫。 */
function csvField(value: string): string {
  if (/[",]/.test(value) || value !== value.trim()) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

const num = (n: number): string => String(n);

/** 雙極軸序列化：min <-> max；僅有 max 則只寫 max。 */
function axisLine(axis: { min?: string; max?: string }): string | null {
  if (axis.min && axis.max) return `${axis.min} <-> ${axis.max}`;
  if (axis.max) return axis.max;
  if (axis.min) return axis.min;
  return null;
}

/** 將一組數據集依指定圖種序列化為完整的 markdown 圍欄（含前後空行）。 */
export function datasetToDsl(dataset: ReportDataset, kind: ChartKind): string {
  const { data, title } = dataset;
  const lines: string[] = [];

  if (kind === "pie" && data.shape === "categorical") {
    lines.push(`${FENCE}mermaid`, "pie showData", `  title ${title}`);
    // Info: (20260803 - Julian) mermaid pie 標籤須以雙引號包夾（沿用既有 pie() 慣例）
    for (const e of data.entries) {
      lines.push(`  "${e.label.replace(/"/g, "")}" : ${num(e.value)}`);
    }
    lines.push(FENCE);
  } else if (kind === CUSTOM_CHART_TYPE.TORNADO && data.shape === "paired") {
    lines.push(`${FENCE}${CUSTOM_CHART_TYPE.TORNADO}`, `title: ${title}`);
    if (data.unit) lines.push(`unit: ${data.unit}`);
    lines.push(`${data.leftName} <-> ${data.rightName}`);
    for (const r of data.rows) {
      lines.push(`${csvField(r.category)}, ${num(r.left)}, ${num(r.right)}`);
    }
    lines.push(FENCE);
  } else if (kind === CUSTOM_CHART_TYPE.MATRIX && data.shape === "points") {
    lines.push(`${FENCE}${CUSTOM_CHART_TYPE.MATRIX}`, `title: ${title}`);
    const xa = axisLine(data.xAxis);
    const ya = axisLine(data.yAxis);
    if (xa) lines.push(`xAxis: ${xa}`);
    if (ya) lines.push(`yAxis: ${ya}`);
    if (data.xAxis.scale !== undefined) lines.push(`xScale: ${num(data.xAxis.scale)}`);
    if (data.yAxis.scale !== undefined) lines.push(`yScale: ${num(data.yAxis.scale)}`);
    for (const p of data.points) {
      const base = `${csvField(p.label)}, ${num(p.x)}, ${num(p.y)}`;
      lines.push(p.group ? `${base}, ${csvField(p.group)}` : base);
    }
    lines.push(FENCE);
  } else if (kind === CUSTOM_CHART_TYPE.HISTOGRAM && data.shape === "bins") {
    lines.push(`${FENCE}${CUSTOM_CHART_TYPE.HISTOGRAM}`, `title: ${title}`);
    if (data.xLabel) lines.push(`xAxis: ${data.xLabel}`);
    if (data.yLabel) lines.push(`yAxis: ${data.yLabel}`);
    if (data.trend) lines.push(`trend: ${data.trend}`);
    for (const b of data.bins) lines.push(`${csvField(b.label)}, ${num(b.count)}`);
    lines.push(FENCE);
  } else if (kind === CUSTOM_CHART_TYPE.BOXPLOT && data.shape === "boxes") {
    lines.push(`${FENCE}${CUSTOM_CHART_TYPE.BOXPLOT}`, `title: ${title}`);
    if (data.yLabel) lines.push(`yAxis: ${data.yLabel}`);
    if (data.unit) lines.push(`unit: ${data.unit}`);
    for (const b of data.boxes) {
      const five = `${csvField(b.label)}, ${num(b.min)}, ${num(b.q1)}, ${num(b.median)}, ${num(b.q3)}, ${num(b.max)}`;
      lines.push(
        b.outliers && b.outliers.length > 0
          ? `${five}, ${csvField(b.outliers.map(num).join(";"))}`
          : five,
      );
    }
    lines.push(FENCE);
  } else {
    return "";
  }

  return `\n${lines.join("\n")}\n`;
}

/** 解析單一 pmis-chart 指令 body 的 dataset 與 type。 */
function parseDirective(body: string): { dataset?: string; type?: string } {
  const out: { dataset?: string; type?: string } = {};
  for (const raw of body.split("\n")) {
    const line = raw.trim();
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (key === "dataset") out.dataset = value;
    else if (key === "type") out.type = value;
  }
  return out;
}

const DIRECTIVE_RE = /```pmis-chart[ \t]*\n([\s\S]*?)```/g;

/**
 * 把 markdown 內所有 pmis-chart 指令換成真數據 DSL 圍欄。
 * 未知 id / 不允許的 type / 形狀不符一律安全丟棄並留註記，報告不因此崩壞。
 */
export function expandChartDirectives(
  markdown: string,
  datasets: ReportDataset[],
): string {
  const byId = new Map(datasets.map((d) => [d.id, d]));

  return markdown.replace(DIRECTIVE_RE, (_full, body: string) => {
    const { dataset: id, type } = parseDirective(body);
    if (!id) return "\n_（圖表指令缺少 dataset）_\n";

    const ds = byId.get(id);
    if (!ds) return `\n_（找不到數據集：${id}）_\n`;

    const kind = (type ?? ds.allowedCharts[0]) as ChartKind;
    if (!ds.allowedCharts.includes(kind)) {
      return `\n_（數據集「${ds.title}」不支援圖種：${type ?? ""}）_\n`;
    }

    const dsl = datasetToDsl(ds, kind);
    if (!dsl.trim()) return `\n_（無法展開圖表：${id}）_\n`;

    // Info: (20260803 - Julian) 治理：圖後附來源引用
    return `${dsl}\n_資料來源：${ds.source}_\n`;
  });
}
