import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Markdown } from "@/components/markdown";

export const metadata = { title: "範例報告（圖表管線驗收） — PMIS" };

// Info: (20260803 - Julian) A 線驗收用的寫死 mock 報告：涵蓋 mermaid + 四種 custom-* 圍欄 + 畸形 fallback。
// 注意：此頁資料純屬示範、非資料庫實際數據；用陣列 join 以避免在 template literal 內跳脫反引號。
const SAMPLE_REPORT = [
  "# 桃園國際機場第三航廈新建統包工程｜2026-07-20 ~ 2026-07-26 週報",
  "> 本報告為 **AI 生成草稿**，數據由系統彙整、圖表由既有數據集展開；核定前請人工確認。",
  "",
  "## 前言",
  "本週監造重點為航廈鋼構吊裝查驗與帷幕單元進場。整體進度 **48%**，較預定 52% 落後 4%。",
  "",
  "## 論述與分析",
  "本週新增缺失 14 件、結案 11 件，未結案累計 22 件。送審 9 件、通過 6 件。",
  "",
  "### 工程分項狀態",
  "```mermaid",
  "pie showData",
  "  title 工程分項狀態",
  '  "已完成" : 12',
  '  "施工中" : 9',
  '  "未開始" : 4',
  '  "待驗收" : 3',
  "```",
  "",
  "### 本期 vs 上期 各類事項件數",
  "```custom-tornado",
  "title: 本期 vs 上期 事項件數",
  "unit: 件",
  "上期 <-> 本期",
  "新增缺失, 18, 14",
  "查驗, 26, 31",
  "送審, 6, 9",
  "環安衛稽核, 5, 7",
  "```",
  "",
  "### 未結案缺失 重大性矩陣",
  "```custom-matrix",
  "title: 未結案缺失 重大性",
  "xAxis: 低機率 <-> 高機率",
  "yAxis: 輕微 <-> 嚴重",
  "xScale: 5",
  "yScale: 5",
  "帷幕滲水, 5, 4, 帷幕",
  "消防管線衝突, 3, 3, 機電",
  "電扶梯定位, 2, 2, 機電",
  "標線不清, 4, 1, 安衛",
  "鋼構銲道, 3, 5, 結構",
  "```",
  "",
  "### 缺失改善耗時分布（天）",
  "```custom-histogram",
  "title: 缺失改善耗時分布",
  "xAxis: 改善耗時（天）",
  "yAxis: 件數",
  "trend: normal",
  "0-4, 5",
  "4-8, 12",
  "8-12, 9",
  "12-16, 4",
  "16-20, 1",
  "```",
  "",
  "### 各分項送審審查天數離散度",
  "```custom-boxplot",
  "title: 各分項送審審查天數",
  "yAxis: 天數",
  "unit: 天",
  "設計, 3, 5, 8, 12, 17",
  ' 施工, 2, 4, 6, 10, 15, "22"',
  "材料設備, 1, 3, 5, 7, 11",
  "```",
  "",
  "### 護欄示範（畸形 DSL 應顯示友善訊息，不崩）",
  "```custom-tornado",
  "title: 這段故意壞掉",
  "結構, 不是數字, 200",
  "```",
  "",
  "## 總結",
  "建議優先處理帷幕與鋼構類高嚴重度缺失，並縮短施工類送審的審查週期。",
].join("\n");

export default function ReportDemoPage() {
  return (
    <div>
      <PageHeader
        section="06 專案與系統設定"
        title="範例報告（圖表管線驗收）"
        description="驗收 markdown → parser → 圖表 的渲染鏈路：含 mermaid 與四種自訂圖表，末段為畸形 DSL 的 fallback 示範。此頁為寫死的示範資料，非資料庫實際數據。"
      />
      <div className="p-4 sm:p-8">
        <Card>
          <CardContent className="pt-6">
            <Markdown content={SAMPLE_REPORT} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
