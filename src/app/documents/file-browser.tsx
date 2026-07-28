"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronRight,
  Download,
  Eye,
  Folder,
  FolderPlus,
  FolderUp,
  File as FileIcon,
  Loader2,
  Lock,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useConfirm } from "@/components/ui/confirm-provider";
import { useNotification } from "@/components/ui/notification";
import { cn, formatDate } from "@/lib/utils";
import { formatBytes, typeLabel, type Crumb, type TreeNode } from "@/service/file-tree";
import type { Usage } from "@/service/file-tree";
import {
  deleteConfirmCopy,
  uploadProgressCopy,
  uploadResultCopy,
  uploadStartCopy,
} from "@/service/file-messages";
import {
  createFolderAction,
  deleteFileAction,
  deleteFolderAction,
} from "./file-actions";

/** 一次送出的檔案數上限，避免單一請求過大。超過則自動分批。 */
const BATCH_SIZE = 20;

/** 搜尋輸入的延遲，避免每個按鍵都打一次伺服器。 */
const SEARCH_DEBOUNCE_MS = 300;

export function FileBrowser({
  projectId,
  projectName,
  breadcrumb,
  nodes,
  folderId,
  readOnly,
  usage,
  canEdit,
  query = "",
  searchNote = null,
}: {
  projectId: string;
  projectName: string;
  breadcrumb: Crumb[];
  nodes: TreeNode[];
  folderId: string | null;
  readOnly: boolean;
  usage: Usage;
  canEdit: boolean;
  /** 目前的搜尋字串；非空時 nodes 為搜尋結果。 */
  query?: string;
  /** 搜尋結果的說明（筆數／是否截斷）。 */
  searchNote?: string | null;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const { notifyProgress } = useNotification();
  const [pending, startTransition] = useTransition();
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [newFolder, setNewFolder] = useState<string | null>(null);
  const [term, setTerm] = useState(query);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dirInputRef = useRef<HTMLInputElement>(null);

  const searching = query.trim() !== "";
  const writable = canEdit && !readOnly && !searching;

  /** 組出前往某資料夾的網址，保留 ?project= 與搜尋字串。 */
  function hrefFor(id: string | null, q: string = query): string {
    const sp = new URLSearchParams();
    sp.set("project", projectId);
    if (id) sp.set("folder", id);
    if (q.trim()) sp.set("q", q.trim());
    return `/documents?${sp.toString()}`;
  }

  // 搜尋以網址參數驅動（伺服器端渲染），輸入延遲後才更新網址
  useEffect(() => {
    if (term.trim() === query.trim()) return;
    const timer = setTimeout(() => {
      router.replace(hrefFor(folderId, term), { scroll: false });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // hrefFor 依賴 query/projectId，皆已列入
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term, query, folderId, projectId, router]);

  function clearSearch() {
    setTerm("");
    router.replace(hrefFor(folderId, ""), { scroll: false });
  }

  /** 目前上傳目的地的名稱，用於通知說明。 */
  const destination = breadcrumb.length
    ? breadcrumb[breadcrumb.length - 1].name
    : projectName;

  /**
   * 上傳一批檔案。
   * paths 帶入 webkitRelativePath，伺服器端據以逐層建立資料夾；
   * 拖曳單檔時該值即檔名。
   */
  async function upload(files: { file: File; path: string }[]) {
    if (files.length === 0) return;
    const total = files.length;

    // 進行中的通知只開一則並持續更新，否則右下角會被逐批訊息塞滿
    const start = uploadStartCopy(total, destination);
    const toast = notifyProgress({ ...start, percent: 0 });

    let done = 0;
    let failed = 0;
    const failures: { name: string; reason: string }[] = [];

    for (let i = 0; i < total; i += BATCH_SIZE) {
      const batch = files.slice(i, i + BATCH_SIZE);
      const progress = uploadProgressCopy(done, total);
      setUploading(progress.description);
      toast.update({
        description: `${start.description}\n${progress.description}`,
        percent: progress.percent,
      });

      const form = new FormData();
      form.set("projectId", projectId);
      if (folderId) form.set("folderId", folderId);
      for (const { file, path } of batch) {
        form.append("files", file);
        form.append("paths", path);
      }
      try {
        const res = await fetch("/api/file-manager/upload", {
          method: "POST",
          body: form,
        });
        const json = (await res.json()) as {
          savedCount?: number;
          failedCount?: number;
          failed?: { name: string; reason: string }[];
          error?: string;
        };
        if (!res.ok) throw new Error(json.error ?? "上傳失敗");
        done += json.savedCount ?? 0;
        failed += json.failedCount ?? 0;
        failures.push(...(json.failed ?? []));
      } catch (e) {
        // 整批請求失敗（網路或權限），該批全數計為失敗
        const reason = e instanceof Error ? e.message : "上傳失敗";
        failed += batch.length;
        for (const b of batch) failures.push({ name: b.file.name, reason });
      }
    }

    setUploading(null);
    const result = uploadResultCopy({
      saved: done,
      failed,
      failures,
      folderName: destination,
    });
    // 同一則通知收尾，使用者視線不必轉移
    toast.settle(result);
    setMessage(null);
    router.refresh();
  }

  /** 從拖曳事件取出檔案（含資料夾，透過 webkitGetAsEntry 遞迴）。 */
  async function filesFromDrop(dt: DataTransfer) {
    const out: { file: File; path: string }[] = [];

    // 有 entry API 時可支援拖曳整個資料夾
    const entries = Array.from(dt.items)
      .map((i) => (i.webkitGetAsEntry ? i.webkitGetAsEntry() : null))
      .filter(Boolean) as FileSystemEntry[];

    if (entries.length > 0) {
      const walk = async (entry: FileSystemEntry, prefix: string) => {
        if (entry.isFile) {
          const f = await new Promise<File | null>((resolve) =>
            (entry as FileSystemFileEntry).file(resolve, () => resolve(null)),
          );
          if (f) out.push({ file: f, path: `${prefix}${entry.name}` });
          return;
        }
        const reader = (entry as FileSystemDirectoryEntry).createReader();
        const children = await new Promise<FileSystemEntry[]>((resolve) =>
          reader.readEntries(resolve, () => resolve([])),
        );
        for (const child of children) {
          await walk(child, `${prefix}${entry.name}/`);
        }
      };
      for (const entry of entries) await walk(entry, "");
      if (out.length > 0) return out;
    }

    // 退回一般檔案清單
    return Array.from(dt.files).map((f) => ({ file: f, path: f.name }));
  }

  function submitFolder() {
    const name = newFolder?.trim();
    if (!name) {
      setNewFolder(null);
      return;
    }
    startTransition(async () => {
      const r = await createFolderAction(projectId, folderId, name);
      setNewFolder(null);
      if (!r.ok) setMessage(r.error);
      else router.refresh();
    });
  }

  /**
   * 刪除前一律先確認。
   * 資料夾的確認文案會列出子層與檔案數，讓使用者知道連帶影響的範圍。
   */
  async function remove(node: TreeNode) {
    const copy = deleteConfirmCopy(
      { kind: node.kind, name: node.name },
      node.contents,
    );
    const ok = await confirm({
      title: copy.title,
      description: copy.description,
      confirmLabel: copy.confirmLabel,
      danger: true,
    });
    if (!ok) return;

    startTransition(async () => {
      const r =
        node.kind === "file"
          ? await deleteFileAction(projectId, node.id)
          : await deleteFolderAction(projectId, node.id);
      if (!r.ok) setMessage(r.error);
      else router.refresh();
    });
  }

  const busy = pending || uploading !== null;
  const GRID =
    "grid grid-cols-[minmax(220px,1fr)_96px_92px_128px_minmax(160px,0.9fr)_88px] gap-2";

  return (
    <div className="space-y-4">
      {/* 使用空間狀況 */}
      <Card>
        <CardContent className="space-y-2 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-xs text-muted-foreground">本專案使用空間</span>
            <span className="text-sm font-semibold tabular-nums">
              {formatBytes(usage.totalBytes)}
              <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                共 {usage.totalFiles} 個檔案
              </span>
            </span>
          </div>
          {/* 各來源佔比 */}
          <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
            {usage.sources.map((s, i) => (
              <div
                key={s.key}
                title={`${s.label} ${formatBytes(s.bytes)}（${s.percent}%）`}
                style={{ width: `${s.percent}%` }}
                className={
                  ["bg-primary", "bg-info", "bg-warning", "bg-success"][i % 4]
                }
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {usage.sources.map((s, i) => (
              <span
                key={s.key}
                className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
              >
                <span
                  className={cn(
                    "size-2 rounded-full",
                    ["bg-primary", "bg-info", "bg-warning", "bg-success"][i % 4],
                  )}
                />
                {s.label} {formatBytes(s.bytes)}（{s.percent}%）
              </span>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 路徑導覽 ＋ 搜尋 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1 text-sm">
          {breadcrumb.map((c, i) => (
            <span key={c.id ?? "root"} className="flex items-center gap-1">
              {i > 0 ? (
                <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/60" />
              ) : null}
              {i === breadcrumb.length - 1 && !searching ? (
                <span className="font-medium">{c.name}</span>
              ) : (
                <Link
                  href={hrefFor(c.id, "")}
                  className="text-muted-foreground hover:text-foreground hover:underline"
                >
                  {c.name}
                </Link>
              )}
            </span>
          ))}
          {readOnly && !searching ? (
            <span className="ml-2 flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
              <Lock className="size-3" />
              系統歸檔，唯讀
            </span>
          ) : null}
        </div>

        {/* 搜尋範圍為整個專案，不限目前資料夾 */}
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") clearSearch();
            }}
            placeholder="搜尋整個專案的檔案與資料夾"
            aria-label="搜尋檔案"
            className="pl-8 pr-8"
          />
          {term ? (
            <button
              type="button"
              onClick={clearSearch}
              aria-label="清除搜尋"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>
      </div>

      {/* 操作列 */}
      {writable ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setNewFolder("")}
            disabled={busy}
          >
            <FolderPlus className="size-4" />
            新建資料夾
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={busy}
          >
            <Upload className="size-4" />
            上傳檔案
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => dirInputRef.current?.click()}
            disabled={busy}
          >
            <FolderUp className="size-4" />
            上傳資料夾
          </Button>
          {uploading ? (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              {uploading}
            </span>
          ) : message ? (
            <span className="text-xs text-destructive">{message}</span>
          ) : null}

          <input
            ref={fileInputRef}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              const list = Array.from(e.target.files ?? []).map((f) => ({
                file: f,
                path: f.name,
              }));
              e.target.value = "";
              void upload(list);
            }}
          />
          {/* webkitdirectory 讓瀏覽器提供整個資料夾與其相對路徑 */}
          <input
            ref={dirInputRef}
            type="file"
            multiple
            hidden
            /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
            {...({ webkitdirectory: "" } as any)}
            onChange={(e) => {
              const list = Array.from(e.target.files ?? []).map((f) => ({
                file: f,
                path:
                  (f as File & { webkitRelativePath?: string })
                    .webkitRelativePath || f.name,
              }));
              e.target.value = "";
              void upload(list);
            }}
          />
        </div>
      ) : null}

      {newFolder !== null ? (
        <div className="flex items-center gap-2">
          <Input
            autoFocus
            value={newFolder}
            placeholder="資料夾名稱"
            onChange={(e) => setNewFolder(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitFolder();
              if (e.key === "Escape") setNewFolder(null);
            }}
            className="max-w-xs"
          />
          <Button type="button" size="sm" onClick={submitFolder} disabled={busy}>
            建立
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setNewFolder(null)}
          >
            取消
          </Button>
        </div>
      ) : null}

      {searching && searchNote ? (
        <p className="text-xs text-muted-foreground">{searchNote}</p>
      ) : null}

      {/* 檔案清單（含拖曳上傳區） */}
      <Card
        className={cn(
          "transition-colors",
          dragOver && writable && "border-primary bg-primary/5",
        )}
        onDragOver={(e) => {
          if (!writable) return;
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          if (!writable) return;
          e.preventDefault();
          setDragOver(false);
          void filesFromDrop(e.dataTransfer).then(upload);
        }}
      >
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <div className="min-w-[860px]">
              <div
                className={cn(
                  GRID,
                  "border-b px-4 py-2 text-[11px] font-medium text-muted-foreground",
                )}
              >
                <span>名稱</span>
                <span>類型</span>
                <span className="text-right">大小</span>
                <span>修改日期</span>
                <span>關聯資料</span>
                <span className="text-right">操作</span>
              </div>

              {nodes.length === 0 ? (
                <p className="px-4 py-12 text-center text-sm text-muted-foreground">
                  {searching
                    ? "沒有符合的檔案或資料夾。"
                    : writable
                      ? "這個資料夾是空的。可拖曳檔案或資料夾到此上傳。"
                      : "這個資料夾沒有內容。"}
                </p>
              ) : (
                nodes.map((n) => {
                  const isFolder = n.kind !== "file";
                  return (
                    <div
                      key={n.id}
                      className={cn(
                        GRID,
                        "items-center border-b px-4 py-2 text-sm last:border-0 hover:bg-muted/50",
                      )}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        {isFolder ? (
                          <Folder
                            className={cn(
                              "size-4 shrink-0",
                              n.kind === "virtual-folder"
                                ? "text-muted-foreground"
                                : "text-primary",
                            )}
                          />
                        ) : (
                          <FileIcon className="size-4 shrink-0 text-muted-foreground" />
                        )}
                        <span className="min-w-0">
                          {isFolder ? (
                            <Link
                              href={hrefFor(n.id, "")}
                              className="block truncate font-medium hover:underline"
                              title={n.name}
                            >
                              {n.name}
                            </Link>
                          ) : (
                            <span
                              className="block truncate font-medium"
                              title={n.name}
                            >
                              {n.name}
                            </span>
                          )}
                          {/* 搜尋結果必須顯示所在路徑，否則同名檔案無法分辨 */}
                          {searching && n.path ? (
                            <Link
                              href={hrefFor(n.parentFolderId ?? null, "")}
                              className="block truncate text-[11px] text-muted-foreground hover:text-foreground hover:underline"
                              title={n.path}
                            >
                              {n.path}
                            </Link>
                          ) : null}
                        </span>
                        {!n.editable ? (
                          <Lock className="size-3 shrink-0 text-muted-foreground/60" />
                        ) : null}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {typeLabel(n.kind, n.mimeType, n.name)}
                      </span>
                      <span className="text-right text-xs tabular-nums text-muted-foreground">
                        {formatBytes(n.size)}
                      </span>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {n.updatedAt ? formatDate(n.updatedAt) : "—"}
                      </span>
                      <span
                        className="truncate text-xs text-muted-foreground"
                        title={n.relation ?? ""}
                      >
                        {n.relation ?? "—"}
                      </span>
                      <span className="flex items-center justify-end gap-2">
                        {n.url ? (
                          <>
                            <Link
                              href={n.url}
                              target="_blank"
                              aria-label="檢視"
                              className="text-muted-foreground hover:text-foreground"
                            >
                              <Eye className="size-3.5" />
                            </Link>
                            <Link
                              href={n.downloadUrl ?? n.url}
                              aria-label="下載"
                              className="text-muted-foreground hover:text-foreground"
                            >
                              <Download className="size-3.5" />
                            </Link>
                          </>
                        ) : null}
                        {canEdit && n.editable ? (
                          <button
                            type="button"
                            aria-label="刪除"
                            onClick={() => void remove(n)}
                            disabled={busy}
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        ) : null}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
