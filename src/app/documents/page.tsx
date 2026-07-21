import * as documentsService from "@/service/documents.service";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { mediaTypeMeta, reportStatusMeta } from "@/constant/pmis";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "資料庫 — PMIS" };

function formatSize(kb: number | null | undefined) {
  if (kb == null) return "—";
  if (kb >= 1024) return `${(kb / 1024).toFixed(1)} MB`;
  return `${kb} KB`;
}

export default async function DocumentsPage() {
  const { media, reports } = await documentsService.getDocuments();

  return (
    <>
      <PageHeader
        title="文件 / 照片 / 影片資料庫"
        description="PMIS-08 · 工程監造紀錄、照片、影片、文件與監造報表雲端管理"
      />
      <div className="space-y-6 p-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">數位檔案 ({media.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>類型</TableHead>
                  <TableHead>名稱</TableHead>
                  <TableHead>分類</TableHead>
                  <TableHead>上傳者</TableHead>
                  <TableHead>拍攝/建立</TableHead>
                  <TableHead className="text-right">大小</TableHead>
                  <TableHead>專案</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {media.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>
                      <Badge variant={mediaTypeMeta[m.type].variant}>
                        {mediaTypeMeta[m.type].label}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">{m.title}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {m.category ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {m.uploadedBy ?? "—"}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {formatDate(m.capturedAt ?? m.createdAt)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {formatSize(m.fileSizeKb)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {m.project.name}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              監造報表 ({reports.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>報表日期</TableHead>
                  <TableHead>天氣</TableHead>
                  <TableHead>施工概況</TableHead>
                  <TableHead>填報者</TableHead>
                  <TableHead>專案</TableHead>
                  <TableHead>狀態</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reports.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="tabular-nums">
                      {formatDate(r.reportDate)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {r.weather ?? "—"}
                    </TableCell>
                    <TableCell className="max-w-sm truncate text-muted-foreground">
                      {r.summary ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {r.filedBy ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {r.project.name}
                    </TableCell>
                    <TableCell>
                      <Badge variant={reportStatusMeta[r.status].variant}>
                        {reportStatusMeta[r.status].label}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
