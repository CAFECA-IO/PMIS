import fs from "node:fs";
import path from "node:path";

import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Markdown } from "@/components/markdown";

export const metadata = { title: "監造月報範本（格式確認） — PMIS" };

// Info: (20260803 - Julian) 直接讀 docs 的範本檔，維持單一來源；改範本即改此頁。
function readTemplate() {
  return fs.readFileSync(
    path.join(process.cwd(), "docs/監造月報範本.md"),
    "utf8",
  );
}

// Info: (20260803 - Julian) 去掉檔頭的設計說明段（--- 之前），只留報告本體
function reportBody(raw: string) {
  const idx = raw.indexOf("\n---\n");
  return idx === -1 ? raw : raw.slice(idx + 5).trim();
}

export default function ReportDemoPage() {
  const body = reportBody(readTemplate());

  return (
    <div>
      <PageHeader
        section="06 專案與系統設定"
        title="監造月報範本（格式確認）"
        description="五層式月報的實際渲染結果：識別資訊 → 本月摘要 → 進度分析 → 工作事項 → 簽章。數值為示意 mock data，非資料庫實際資料。"
      />
      <div className="p-4 sm:p-8">
        <Card>
          <CardContent className="pt-6">
            <Markdown content={body} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
