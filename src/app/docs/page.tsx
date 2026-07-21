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
      key: "guide",
      label: "功能說明",
      content: readContent("src/content/feature-guide.md"),
    },
    {
      key: "ai",
      label: "AI 流程優化",
      content: readContent("src/content/ai-optimization.md"),
    },
  ];

  return (
    <>
      <PageHeader
        title="功能說明"
        description="系統功能總覽與 AI 流程優化設計"
      />
      <div className="p-8">
        <Card className="mx-auto max-w-4xl overflow-hidden">
          <DocViewer docs={docs} />
        </Card>
      </div>
    </>
  );
}
