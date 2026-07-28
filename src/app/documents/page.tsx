import Link from "next/link";

import * as fileManager from "@/service/fileManager.service";
import * as projectService from "@/service/project.service";
import { requireUser } from "@/service/auth.service";
import { assertModuleAccess, canEditModule } from "@/service/access.service";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { summarizeUsage } from "@/service/file-tree";
import {
  isSearchable,
  normalizeQuery,
  searchSummary,
} from "@/service/file-search";
import { FileBrowser } from "./file-browser";

export const dynamic = "force-dynamic";
export const metadata = { title: "檔案管理 — PMIS" };

/**
 * 檔案管理（PMIS-13）。
 *
 * 以專案為根目錄的樹狀瀏覽：使用者可自建資料夾、拖曳上傳檔案或整個資料夾。
 * 既有模組的附件（環安衛、簽核、費思）以唯讀虛擬資料夾呈現，
 * 因為它們被稽核與簽核紀錄引用，不應被自由搬移或刪除。
 */
export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string; folder?: string; q?: string }>;
}) {
  const user = await requireUser();
  const perms = await assertModuleAccess(user, "/documents");
  const canEdit = canEditModule(perms, "/documents");
  const { project: projectId, folder, q } = await searchParams;
  const query = normalizeQuery(q);

  const projects = await projectService.listProjectOptions(user);

  // 未選專案時無法呈現「以專案為根目錄」的樹，先請使用者選定
  if (!projectId) {
    return (
      <>
        <PageHeader
          section="03 文件與協作"
          title="檔案管理"
          description="以專案為根目錄管理檔案與資料夾；各模組上傳的檔案自動歸入系統資料夾"
        />
        <div className="p-8">
          <Card>
            <CardContent className="space-y-3 p-6">
              <p className="text-sm text-muted-foreground">
                請先選擇專案。檔案以專案作為根目錄管理。
              </p>
              <div className="flex flex-wrap gap-2">
                {projects.map((p) => (
                  <Link
                    key={p.id}
                    href={`/documents?project=${p.id}`}
                    className="rounded-md border px-3 py-1.5 text-sm transition-colors hover:border-primary hover:text-primary"
                  >
                    {p.name}
                  </Link>
                ))}
                {projects.length === 0 ? (
                  <span className="text-sm text-muted-foreground">
                    尚無可存取的專案。
                  </span>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </div>
      </>
    );
  }

  const current = projects.find((p) => p.id === projectId);
  const viewer = { id: user.id, role: user.role };
  const [listing, usage, found] = await Promise.all([
    fileManager.listFolder(
      projectId,
      current?.name ?? "專案",
      folder ?? null,
      viewer,
    ),
    fileManager.usage(projectId, viewer),
    // 搜尋範圍為整個專案，故與目前所在資料夾無關
    isSearchable(query)
      ? fileManager.search(projectId, current?.name ?? "專案", query, viewer)
      : Promise.resolve(null),
  ]);

  if (!listing || !current) {
    return (
      <>
        <PageHeader section="03 文件與協作" title="檔案管理" />
        <div className="p-8">
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">
              找不到專案或資料夾，或您無權存取。
              <Link
                href="/documents"
                className="ml-2 text-primary hover:underline"
              >
                回到專案選擇
              </Link>
            </CardContent>
          </Card>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        section="03 文件與協作"
        title="檔案管理"
        description={`${current.name} · 以專案為根目錄管理檔案與資料夾`}
      />
      <div className="@container space-y-5 p-8">
        <FileBrowser
          projectId={projectId}
          projectName={current.name}
          breadcrumb={listing.breadcrumb}
          nodes={found ? found.nodes : listing.nodes}
          folderId={listing.folderId}
          readOnly={listing.readOnly}
          usage={usage ?? summarizeUsage([])}
          canEdit={canEdit}
          query={found ? found.query : ""}
          searchNote={
            found
              ? searchSummary({
                  query: found.query,
                  count: found.nodes.length,
                  truncated: found.truncated,
                  scanTruncated: found.scanTruncated,
                })
              : null
          }
        />
      </div>
    </>
  );
}
