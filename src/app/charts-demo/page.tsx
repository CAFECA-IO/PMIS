import { PageHeader } from "@/components/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { MatrixChart } from "@/components/matrix-chart";
import { TornadoChart } from "@/components/tornado-chart";
import { HistogramChart } from "@/components/histogram-chart";
import { BoxPlotChart } from "@/components/box-plot-chart";
import type {
  MatrixChartData,
  TornadoChartData,
  HistogramChartData,
  BoxplotChartData,
} from "@/components/chart-primitives";

export const metadata = { title: "自訂圖表展示 — PMIS" };

// ─── 範例資料（Phase 4：先以假資料 demo，後續改接 service）───────────

const matrixSample: MatrixChartData = {
  title: "工程風險矩陣",
  xAxis: { min: "低", max: "高", scale: 5 },
  yAxis: { min: "輕微", max: "嚴重", scale: 5 },
  points: [
    { label: "邊坡滑動", x: 3, y: 4.5, group: "安全" },
    { label: "鋼筋腐蝕", x: 2, y: 3, group: "品質" },
    { label: "工序延誤", x: 4, y: 3.5, group: "進度" },
    { label: "物價上漲", x: 4.5, y: 2.5, group: "成本" },
    { label: "介面衝突", x: 3.5, y: 2, group: "進度" },
    { label: "試體不合格", x: 2.5, y: 4, group: "品質" },
    { label: "墜落事故", x: 2, y: 5, group: "安全" },
  ],
};

const tornadoCompareSample: TornadoChartData = {
  title: "各分項預算 vs 實際",
  unit: "萬元",
  leftSeries: "預算",
  rightSeries: "實際",
  bars: [
    { category: "土方工程", left: 1200, right: 1350 },
    { category: "結構工程", left: 4800, right: 4620 },
    { category: "機電工程", left: 2600, right: 2810 },
    { category: "裝修工程", left: 1800, right: 1740 },
    { category: "假設工程", left: 900, right: 1020 },
  ],
};

const tornadoSensitivitySample: TornadoChartData = {
  title: "總工期敏感度分析",
  unit: "天",
  mode: "sensitivity",
  baseline: 540,
  bars: [
    { category: "結構進度", left: 500, right: 590 },
    { category: "天候影響", left: 520, right: 575 },
    { category: "機電交付", left: 528, right: 566 },
    { category: "審查時程", left: 534, right: 558 },
  ],
};

const histogramSample: HistogramChartData = {
  title: "混凝土抗壓強度分布",
  xAxis: "強度區間 (MPa)",
  yAxis: "試體數",
  trend: "normal",
  bins: [
    { label: "26–28", count: 2 },
    { label: "28–30", count: 6 },
    { label: "30–32", count: 14 },
    { label: "32–34", count: 21 },
    { label: "34–36", count: 15 },
    { label: "36–38", count: 7 },
    { label: "38–40", count: 3 },
  ],
};

const boxplotSample: BoxplotChartData = {
  title: "各標段回填壓實度",
  yAxis: "壓實度",
  unit: "%",
  boxes: [
    {
      label: "A 標",
      min: 92,
      q1: 94.5,
      median: 96,
      q3: 97.5,
      max: 99,
      outliers: [88],
    },
    { label: "B 標", min: 90, q1: 93, median: 95, q3: 96.5, max: 98 },
    {
      label: "C 標",
      min: 91,
      q1: 94,
      median: 95.5,
      q3: 97,
      max: 98.5,
      outliers: [101, 87],
    },
    { label: "D 標", min: 93, q1: 95, median: 96.5, q3: 98, max: 99.5 },
  ],
};

function ChartFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-[420px] w-full items-center justify-center rounded-xl border bg-muted/30 p-3">
      {children}
    </div>
  );
}

export default function ChartsDemoPage() {
  return (
    <div>
      <PageHeader
        section="06 專案與系統設定"
        title="自訂圖表展示"
        description="自 iSunFA 移植的四種圖表（矩陣圖、龍捲風圖、直方圖、箱型圖），純 SVG、灰階配色、數值靜態繪製。"
      />
      <div className="grid gap-4 p-4 sm:p-8 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>矩陣圖</CardTitle>
            <CardDescription>四象限散佈，群組以灰階濃淡區分。</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartFrame>
              <MatrixChart data={matrixSample} />
            </ChartFrame>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>直方圖</CardTitle>
            <CardDescription>已分箱頻率，含常態趨勢線。</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartFrame>
              <HistogramChart data={histogramSample} />
            </ChartFrame>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>龍捲風圖（比較模式）</CardTitle>
            <CardDescription>左右對稱雙數列，依總量排序。</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartFrame>
              <TornadoChart data={tornadoCompareSample} />
            </ChartFrame>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>龍捲風圖（敏感度模式）</CardTitle>
            <CardDescription>以基準值切色的水平區間長條。</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartFrame>
              <TornadoChart data={tornadoSensitivitySample} />
            </ChartFrame>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>箱型圖</CardTitle>
            <CardDescription>五數綜合 + 離群點，數值靜態標示。</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartFrame>
              <BoxPlotChart data={boxplotSample} />
            </ChartFrame>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
