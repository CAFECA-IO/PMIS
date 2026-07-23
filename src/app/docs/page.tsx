import fs from "node:fs";
import path from "node:path";

import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { DocViewer, type Doc } from "@/components/doc-viewer";

export const metadata = { title: "功能說明 — PMIS" };

function readContent(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

export default function DocsPage() {
  const docs: Doc[] = [
    {
      key: "overview",
      label: "系統總覽",
      description: "系統定位、功能模組地圖與 14 模組總覽表",
      content: readContent("src/content/overview.md"),
    },
    {
      key: "common",
      label: "共通功能",
      description: "登入權限、費思 AI、專案切換、統一新建等跨模組共用機制",
      content: readContent("src/content/common.md"),
    },
    {
      key: "modules",
      label: "模組詳解",
      description: "PMIS-01～14 各模組功能、S-Curve 資料連動與查驗流程",
      content: readContent("src/content/modules.md"),
    },
    {
      key: "ai",
      label: "AI 流程優化",
      description: "在既有監造流程疊加 AI 能力的設計藍圖與導入規劃",
      content: readContent("src/content/ai-optimization.md"),
    },
    {
      key: "gis",
      label: "GIS 操作說明",
      description: "PMIS-12 地圖圖層、周邊風險判讀與自訂圖徵操作指南",
      content: readContent("src/content/gis-guide.md"),
    },
  ];

  return (
    <>
      <PageHeader
        title="功能說明"
        description="系統功能總覽、模組詳解與 AI 流程優化設計"
      />
      <div className="p-4 sm:p-8">
        <Card className="mx-auto max-w-5xl overflow-hidden">
          <DocViewer docs={docs} />
        </Card>
      </div>
    </>
  );
}
