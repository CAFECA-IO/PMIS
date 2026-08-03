/**
 * Info: (20260803 - Julian)
 * 自訂圖表派發元件：由 fence 語言判斷圖種、以 parser 解析 DSL、渲染對應圖表。
 * 解析失敗只顯示友善訊息，永不讓報告渲染崩潰。純 SVG、可 SSR。
 */
import {
  detectCustomChartType,
  parseCustomChart,
} from "@/lib/custom-chart-parser";
import { CUSTOM_CHART_TYPE } from "@/constant/custom-chart";
import { MatrixChart } from "@/components/matrix-chart";
import { TornadoChart } from "@/components/tornado-chart";
import { HistogramChart } from "@/components/histogram-chart";
import { BoxPlotChart } from "@/components/box-plot-chart";

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-4 flex h-[420px] w-full items-center justify-center rounded-xl border bg-muted/30 p-3">
      {children}
    </div>
  );
}

export function CustomChart({
  lang,
  source,
}: {
  lang: string;
  source: string;
}) {
  const type = detectCustomChartType(lang);
  if (!type) return null;

  const result = parseCustomChart(type, source);
  if (!result.ok) {
    return (
      <p className="my-4 text-sm text-muted-foreground">
        （圖表無法繪製：{result.message}）
      </p>
    );
  }

  switch (result.type) {
    case CUSTOM_CHART_TYPE.MATRIX:
      return (
        <Frame>
          <MatrixChart data={result.data} />
        </Frame>
      );
    case CUSTOM_CHART_TYPE.TORNADO:
      return (
        <Frame>
          <TornadoChart data={result.data} />
        </Frame>
      );
    case CUSTOM_CHART_TYPE.HISTOGRAM:
      return (
        <Frame>
          <HistogramChart data={result.data} />
        </Frame>
      );
    case CUSTOM_CHART_TYPE.BOXPLOT:
      return (
        <Frame>
          <BoxPlotChart data={result.data} />
        </Frame>
      );
    default:
      return null;
  }
}
