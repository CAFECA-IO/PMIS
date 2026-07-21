import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { SESSION_COOKIE } from "@/lib/auth";

// Info: (20260721 - Luphia) Next 16 以 proxy 取代 middleware（同等功能）
export function proxy(req: NextRequest) {
  const hasSession = Boolean(req.cookies.get(SESSION_COOKIE)?.value);
  const isLoginPage = req.nextUrl.pathname === "/login";

  /**
   * Info: (20260721 - Luphia)
   * 僅以「cookie 是否存在」保護頁面；session 是否有效（以及已登入者於 /login 是否
   * 導回首頁）改由 App 端以 DB 驗證決定，避免 cookie 殘留無效時造成的導向迴圈。
   */
  if (!hasSession && !isLoginPage) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Info: (20260721 - Luphia) 保護所有頁面，排除 Next 內部、API 路由與靜態資源
  matcher: ["/((?!_next/static|_next/image|api|favicon.ico|.*\\.[\\w]+$).*)"],
};
