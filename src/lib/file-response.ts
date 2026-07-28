import { NextResponse } from "next/server";

import {
  dispositionFor,
  responseContentType,
  safeFileName,
} from "@/service/upload-policy";

/**
 * 檔案回應的統一組裝。全站檔案路由共用，確保：
 *  - 不可內嵌的型別（SVG、HTML、Office…）一律以 attachment + octet-stream 送出
 *  - 檔名經過淨化，不會破壞 Content-Disposition 標頭
 *  - 加上 X-Content-Type-Options 阻止瀏覽器自行嗅探型別
 */
export function fileResponse(
  buffer: Buffer,
  fileName: string,
  mimeType: string,
  download: boolean,
): NextResponse {
  const disposition = dispositionFor(mimeType, download);
  const name = safeFileName(fileName);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": responseContentType(mimeType, disposition),
      "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Content-Length": String(buffer.length),
      "X-Content-Type-Options": "nosniff",
      // 檔案含專案資料，不得由共用快取保存
      "Cache-Control": "private, max-age=3600",
    },
  });
}

/** ?download=1（或 true）視為要求下載。 */
export function wantsDownload(url: string): boolean {
  const v = new URL(url).searchParams.get("download");
  return v === "1" || v === "true";
}
