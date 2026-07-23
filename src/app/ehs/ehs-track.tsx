"use client";

import { useState } from "react";
import { FileText, Upload, Plus, Paperclip } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/utils";
import { addEhsNoteAction, uploadEhsFileAction } from "./actions";

type Attachment = { id: string; fileName: string; createdAt: Date };
type Note = {
  id: string;
  body: string;
  authorName: string | null;
  createdAt: Date;
};

// Info: (20260721 - Luphia) 每筆稽核之上傳／拍攝文件與追蹤紀錄（手機友善，可展開）
export function EhsTrack({
  auditId,
  attachments,
  notes,
  canEdit = true,
}: {
  auditId: string;
  attachments: Attachment[];
  notes: Note[];
  canEdit?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const count = attachments.length + notes.length;

  if (!open) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
      >
        <FileText className="size-4" />
        追蹤紀錄／文件{count > 0 ? `（${count}）` : ""}
      </Button>
    );
  }

  return (
    <div className="mt-1 space-y-4 rounded-md border bg-muted/30 p-3">
      {/* Info: (20260721 - Luphia) 文件 */}
      <div className="space-y-2">
        <div className="text-xs font-medium">文件（{attachments.length}）</div>
        {attachments.length === 0 ? (
          <p className="text-xs text-muted-foreground">尚無文件。</p>
        ) : (
          <ul className="space-y-1">
            {attachments.map((a) => (
              <li key={a.id} className="flex items-center gap-2 text-xs">
                <Paperclip className="size-3 shrink-0 text-muted-foreground" />
                <a
                  href={`/api/ehs/file/${a.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="min-w-0 flex-1 truncate text-primary hover:underline"
                >
                  {a.fileName}
                </a>
                <span className="shrink-0 text-muted-foreground">
                  {formatDate(a.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
        {canEdit && (
          <form action={uploadEhsFileAction} className="flex items-center gap-2">
            <input type="hidden" name="auditId" value={auditId} />
            <input
              type="file"
              name="file"
              accept="image/*,application/pdf"
              capture="environment"
              className="min-w-0 flex-1 text-xs file:mr-2 file:rounded file:border-0 file:bg-secondary file:px-2 file:py-1 file:text-xs"
            />
            <Button type="submit" size="sm" variant="outline">
              <Upload className="size-4" />
              上傳
            </Button>
          </form>
        )}
      </div>

      {/* Info: (20260721 - Luphia) 追蹤紀錄 */}
      <div className="space-y-2">
        <div className="text-xs font-medium">追蹤紀錄（{notes.length}）</div>
        {notes.length === 0 ? (
          <p className="text-xs text-muted-foreground">尚無紀錄。</p>
        ) : (
          <div className="space-y-2">
            {notes.map((n) => (
              <div key={n.id} className="border-l-2 border-primary/40 pl-2">
                <div className="text-sm">{n.body}</div>
                <div className="text-[11px] text-muted-foreground">
                  {n.authorName ?? "—"} · {formatDate(n.createdAt)}
                </div>
              </div>
            ))}
          </div>
        )}
        {canEdit ? (
          <form action={addEhsNoteAction} className="space-y-2">
            <input type="hidden" name="auditId" value={auditId} />
            <Textarea
              name="body"
              rows={2}
              placeholder="新增追蹤紀錄（改善進度、複查結果…）"
              className="text-sm"
            />
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setOpen(false)}
              >
                收合
              </Button>
              <Button type="submit" size="sm">
                <Plus className="size-4" />
                新增紀錄
              </Button>
            </div>
          </form>
        ) : (
          <div className="flex justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setOpen(false)}
            >
              收合
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
