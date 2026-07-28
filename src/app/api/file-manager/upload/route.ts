import { NextResponse } from "next/server";

import { getCurrentUser } from "@/service/auth.service";
import { currentUserCanEdit } from "@/service/access.service";
import * as fileManager from "@/service/fileManager.service";
import * as nodeRepo from "@/repository/fileNode.repository";
import * as storage from "@/service/storage.service";
import { dedupeName, parseRelativePath } from "@/service/file-tree";
import { checkSize, resolveExt, safeFileName } from "@/service/upload-policy";

export const runtime = "nodejs";

/**
 * 檔案管理的上傳。
 *
 * 刻意用 route handler 而非 server action：server action 的請求主體
 * 預設上限約 1MB，工程文件動輒數十 MB 會靜默失敗。
 *
 * 支援兩種來源，處理方式相同：
 *  - 拖曳或選取檔案：relativePath 即檔名
 *  - 選取整個資料夾：瀏覽器提供 webkitRelativePath（如 契約/附件/圖.png），
 *    逐層建立資料夾後再放入檔案
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "未登入" }, { status: 401 });
  if (!(await currentUserCanEdit("/documents"))) {
    return NextResponse.json({ error: "權限不足" }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "請求格式錯誤" }, { status: 400 });
  }

  const projectId = String(form.get("projectId") ?? "");
  const rawFolderId = form.get("folderId");
  const folderId =
    typeof rawFolderId === "string" && rawFolderId !== "" ? rawFolderId : null;

  if (!projectId) {
    return NextResponse.json({ error: "缺少專案" }, { status: 400 });
  }
  if (folderId && fileManager.isVirtual(folderId)) {
    return NextResponse.json(
      { error: "系統歸檔資料夾不可上傳。" },
      { status: 400 },
    );
  }

  const viewer = { id: user.id, role: user.role };
  const allowed = await fileManager.canWriteInto(projectId, folderId, viewer);
  if (!allowed.ok) {
    return NextResponse.json({ error: allowed.error }, { status: 403 });
  }

  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  const paths = form.getAll("paths").map((p) => String(p));
  if (files.length === 0) {
    return NextResponse.json({ error: "沒有檔案" }, { status: 400 });
  }

  const saved: { name: string; folderId: string | null }[] = [];
  const failed: { name: string; reason: string }[] = [];
  // 同一批次內的重名也要避開，故在記憶體累積各資料夾已用名稱
  const takenByFolder = new Map<string, Set<string>>();

  const takenFor = async (fid: string | null): Promise<Set<string>> => {
    const key = fid ?? "__root__";
    const cached = takenByFolder.get(key);
    if (cached) return cached;
    const names = new Set(await nodeRepo.takenFileNames(projectId, fid));
    takenByFolder.set(key, names);
    return names;
  };

  for (let i = 0; i < files.length; i += 1) {
    const file = files[i];
    const relative = paths[i] ?? file.name;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const sizeError = checkSize(bytes.byteLength);
      if (sizeError) {
        failed.push({ name: file.name, reason: sizeError });
        continue;
      }

      const parsed = parseRelativePath(relative);
      const targetFolder = parsed.folders.length
        ? await fileManager.ensureFolderPath(projectId, folderId, parsed.folders)
        : folderId;

      const mimeType = file.type || "application/octet-stream";
      const ext = resolveExt(mimeType, parsed.fileName || file.name);
      const base = safeFileName(parsed.fileName || file.name, ext);

      const taken = await takenFor(targetFolder);
      const finalName = dedupeName(base, taken, true);
      taken.add(finalName);

      const stored = await storage.saveBytes(bytes, finalName, mimeType, ext);
      if (!stored) {
        failed.push({ name: file.name, reason: "檔案寫入失敗。" });
        continue;
      }

      await nodeRepo.createFile({
        projectId,
        folderId: targetFolder,
        fileName: finalName,
        storedName: stored.storedName,
        mimeType: stored.mimeType,
        size: stored.size,
        uploadedById: user.id,
        uploadedBy: user.name ?? null,
      });
      saved.push({ name: finalName, folderId: targetFolder });
    } catch (error) {
      // 單檔失敗不影響其他檔案 —— 整包資料夾上傳時尤其重要
      failed.push({
        name: file.name,
        reason: error instanceof Error ? error.message : "未預期錯誤",
      });
    }
  }

  return NextResponse.json({
    ok: failed.length === 0,
    savedCount: saved.length,
    failedCount: failed.length,
    failed,
  });
}

/** 大批次上傳需要較長執行時間。 */
export const maxDuration = 60;
