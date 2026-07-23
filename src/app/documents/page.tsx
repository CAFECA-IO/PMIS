import Link from "next/link";

import * as documentsService from "@/service/documents.service";
import * as projectService from "@/service/project.service";
import { requireUser } from "@/service/auth.service";
import { assertModuleAccess, canEditModule } from "@/service/access.service";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { CreateRecordDialog } from "@/components/ui/create-record-dialog";
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
import { uploadDocumentAction } from "./actions";
import { DocumentDeleteButton } from "./document-delete-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "資料庫 — PMIS" };

function formatSize(kb: number | null | undefined) {
  if (kb == null) return "—";
  if (kb >= 1024) return `${(kb / 1024).toFixed(1)} MB`;
  return `${kb} KB`;
}

function formatBytes(bytes: number) {
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

export default async function DocumentsPage() {
  const user = await requireUser();
  const perms = await assertModuleAccess(user, "/documents");
  const canEdit = canEditModule(perms, "/documents");
  const { media, reports, uploads } = await documentsService.getDocuments();
  const projects = await projectService.listProjects(user);

  return (
    <>
      <PageHeader
        title="文件 / 照片 / 影片資料庫"
        description="PMIS-13 · 工程監造紀錄、照片、影片、文件與監造報表雲端管理"
      />
      <div className="space-y-6 p-8">
        {canEdit && projects.length > 0 && (
          <div className="flex justify-end">
            <CreateRecordDialog
              title="上傳文件"
              triggerLabel="新建文件"
              action={uploadDocumentAction}
              submitLabel="上傳"
              fileFieldName="file"
              fileAccept={documentsService.ALLOWED_ACCEPT}
              fileRequired
              fileHint={`支援 ${documentsService.ALLOWED_ACCEPT}`}
            >
              <label className="space-y-1 text-xs">
                <span className="text-muted-foreground">專案</span>
                <Select name="projectId" defaultValue={projects[0].id}>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="space-y-1 text-xs">
                <span className="text-muted-foreground">分類</span>
                <Input name="category" placeholder="如：試驗報告、缺失照片" />
              </label>
              <label className="space-y-1 text-xs sm:col-span-2">
                <span className="text-muted-foreground">標題（留空則用檔名）</span>
                <Input name="title" placeholder="文件標題" />
              </label>
            </CreateRecordDialog>
          </div>
        )}

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
                  <TableHead className="text-right">操作</TableHead>
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
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {m.fileUrl ? (
                          <Link
                            href={`/api/documents/file/${m.id}`}
                            target="_blank"
                            className="text-sm text-primary hover:underline"
                          >
                            檢視
                          </Link>
                        ) : null}
                        {canEdit && (
                          <DocumentDeleteButton id={m.id} title={m.title} />
                        )}
                      </div>
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
              各模組上傳檔案 ({uploads.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {uploads.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                目前沒有由其他模組上傳的檔案。環安衛稽核、簽核文件等處上傳的檔案會自動彙整於此。
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>檔名</TableHead>
                    <TableHead>來源</TableHead>
                    <TableHead>關聯</TableHead>
                    <TableHead>上傳時間</TableHead>
                    <TableHead className="text-right">大小</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {uploads.map((u) => (
                    <TableRow key={`${u.source}-${u.id}`}>
                      <TableCell className="font-medium">{u.fileName}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{u.source}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {u.context || "—"}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {formatDate(u.createdAt)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {formatBytes(u.size)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Link
                          href={u.url}
                          target="_blank"
                          className="text-primary hover:underline"
                        >
                          檢視
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
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
