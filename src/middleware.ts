import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { SESSION_COOKIE } from "@/lib/auth";

export function middleware(req: NextRequest) {
  const hasSession = Boolean(req.cookies.get(SESSION_COOKIE)?.value);
  const isLoginPage = req.nextUrl.pathname === "/login";

  // Only guard protected pages by cookie *presence*. Whether the session is
  // actually valid (and whether a logged-in user on /login should be sent home)
  // is decided by the app with a DB-backed check, to avoid a redirect loop when
  // the cookie is present but stale/invalid.
  if (!hasSession && !isLoginPage) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Guard every page except Next internals, API routes, and static assets.
  matcher: ["/((?!_next/static|_next/image|api|favicon.ico|.*\\.[\\w]+$).*)"],
};
