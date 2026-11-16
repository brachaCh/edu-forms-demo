import { NextResponse, type NextRequest } from "next/server";
import {
  assertAllowedAppOrigin,
  shouldEnforceCsrfOrigin,
} from "@/lib/app-request-origin";
import {
  SESSION_COOKIE,
  sessionCookieOptions,
  verifySessionTokenSignature,
} from "@/lib/session";
import { TEMP_OPEN_ACCESS } from "@/lib/auth-mode";
import {
  rewrittenBrokenClassModeDestination,
  rewrittenClassModeAliasDestination,
  rewrittenClassNameDestination,
  rewrittenLegacyPfolderCategoryDestination,
  rewrittenPortfolioCategoryDestination,
  rewrittenPortfolioCustomFolderDestination,
  rewrittenPortfolioFillDestination,
  rewrittenPortfolioFormsDestination,
  rewrittenSectorFrameworkDestination,
  rewrittenSectorHomeDestination,
  rewrittenSectorNestedDestination,
  rewrittenStudentsCategoryAliasDestination,
} from "@/lib/rewrite-sector-nested";

function isProtectedPath(pathname: string): boolean {
  return pathname === "/personal-area" || pathname.startsWith("/personal-area/");
}

/** /teacher/שם-בעברית → /teacher?name=  (Next.js מחזיר 404 על מקטע דינמי בעברית) */
function redirectTeacherNamePath(request: NextRequest): NextResponse | null {
  const url = request.nextUrl.clone();
  const segments = url.pathname.split("/").filter(Boolean);
  const teacherAt = segments.lastIndexOf("teacher");
  if (teacherAt < 0 || teacherAt !== segments.length - 2) return null;
  const rawName = segments[teacherAt + 1];
  if (!rawName) return null;

  let teacherName = rawName;
  try {
    teacherName = decodeURIComponent(rawName);
  } catch {
    teacherName = rawName;
  }

  url.pathname = `/${segments.slice(0, teacherAt + 1).join("/")}`;
  if (!url.searchParams.get("name")) {
    url.searchParams.set("name", teacherName);
  }
  return NextResponse.redirect(url);
}

/** /class/שם-בעברית → /class?name=  (Next.js מחזיר 404 על מקטע דינמי בעברית) */
function redirectClassNamePath(request: NextRequest): NextResponse | null {
  const dest = rewrittenClassNameDestination(
    request.nextUrl.pathname,
    request.nextUrl.search
  );
  if (!dest) return null;
  const url = request.nextUrl.clone();
  url.pathname = dest.pathname;
  url.search = dest.search;
  return NextResponse.redirect(url);
}

/** /class-mode/... → /mode/... (Turbopack לא רושם class-mode ליד class) */
function redirectClassModeAliasPath(request: NextRequest): NextResponse | null {
  const dest = rewrittenClassModeAliasDestination(
    request.nextUrl.pathname,
    request.nextUrl.search
  );
  if (!dest) return null;
  const url = request.nextUrl.clone();
  url.pathname = dest.pathname;
  url.search = dest.search;
  return NextResponse.redirect(url);
}

/** /class/mode/... → /mode/... (ראוט ישן שנשבר ב-Turbopack) */
function redirectBrokenClassModePath(request: NextRequest): NextResponse | null {
  const dest = rewrittenBrokenClassModeDestination(
    request.nextUrl.pathname,
    request.nextUrl.search
  );
  if (!dest) return null;
  const url = request.nextUrl.clone();
  url.pathname = dest.pathname;
  url.search = dest.search;
  return NextResponse.redirect(url);
}

function rewriteBrokenSectorHomePage(
  request: NextRequest
): NextResponse | null {
  const dest = rewrittenSectorHomeDestination(
    request.nextUrl.pathname,
    request.nextUrl.search
  );
  if (!dest) return null;
  const url = request.nextUrl.clone();
  url.pathname = dest.pathname;
  url.search = dest.search;
  return NextResponse.rewrite(url);
}

function rewriteBrokenSectorFrameworkPage(
  request: NextRequest
): NextResponse | null {
  const dest = rewrittenSectorFrameworkDestination(
    request.nextUrl.pathname,
    request.nextUrl.search
  );
  if (!dest) return null;
  const url = request.nextUrl.clone();
  url.pathname = dest.pathname;
  url.search = dest.search;
  return NextResponse.rewrite(url);
}

function rewriteBrokenSectorNestedPage(request: NextRequest): NextResponse | null {
  const dest = rewrittenSectorNestedDestination(
    request.nextUrl.pathname,
    request.nextUrl.search
  );
  if (!dest) return null;
  const url = request.nextUrl.clone();
  url.pathname = dest.pathname;
  url.search = dest.search;
  return NextResponse.rewrite(url);
}

function rewriteBrokenPortfolioCustomFolderPage(
  request: NextRequest
): NextResponse | null {
  const dest = rewrittenPortfolioCustomFolderDestination(
    request.nextUrl.pathname,
    request.nextUrl.search
  );
  if (!dest) return null;
  const url = request.nextUrl.clone();
  url.pathname = dest.pathname;
  url.search = dest.search;
  // Redirect (not rewrite) so the address bar shows the stable /folder/ alias
  // and client navigation matches studentPortfolioFolderHref.
  return NextResponse.redirect(url);
}

function rewriteBrokenPortfolioFormsPage(
  request: NextRequest
): NextResponse | null {
  const dest = rewrittenPortfolioFormsDestination(
    request.nextUrl.pathname,
    request.nextUrl.search
  );
  if (!dest) return null;
  const url = request.nextUrl.clone();
  url.pathname = dest.pathname;
  url.search = dest.search;
  return NextResponse.rewrite(url);
}

function rewriteBrokenPortfolioFillPage(
  request: NextRequest
): NextResponse | null {
  const dest = rewrittenPortfolioFillDestination(
    request.nextUrl.pathname,
    request.nextUrl.search
  );
  if (!dest) return null;
  const url = request.nextUrl.clone();
  url.pathname = dest.pathname;
  url.search = dest.search;
  return NextResponse.rewrite(url);
}

function rewriteBrokenPortfolioCategoryPage(
  request: NextRequest
): NextResponse | null {
  const dest =
    rewrittenPortfolioCategoryDestination(
      request.nextUrl.pathname,
      request.nextUrl.search
    ) ??
    rewrittenStudentsCategoryAliasDestination(
      request.nextUrl.pathname,
      request.nextUrl.search
    );
  if (!dest) return null;
  const url = request.nextUrl.clone();
  url.pathname = dest.pathname;
  url.search = dest.search;
  // Redirect so the address bar shows the stable /folder/ path.
  return NextResponse.redirect(url);
}

function redirectLegacyPfolderCategoryPage(
  request: NextRequest
): NextResponse | null {
  const dest = rewrittenLegacyPfolderCategoryDestination(
    request.nextUrl.pathname,
    request.nextUrl.search
  );
  if (!dest) return null;
  const url = request.nextUrl.clone();
  url.pathname = dest.pathname;
  url.search = dest.search;
  return NextResponse.redirect(url);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/api/")) {
    if (
      shouldEnforceCsrfOrigin({ method: request.method, pathname }) &&
      !assertAllowedAppOrigin(request).ok
    ) {
      return NextResponse.json(
        { error: "ORIGIN_NOT_ALLOWED" },
        { status: 403 }
      );
    }
    return NextResponse.next();
  }

  const teacherRedirect = redirectTeacherNamePath(request);
  if (teacherRedirect) return teacherRedirect;

  const classRedirect = redirectClassNamePath(request);
  if (classRedirect) return classRedirect;

  const brokenClassModeRedirect = redirectBrokenClassModePath(request);
  if (brokenClassModeRedirect) return brokenClassModeRedirect;

  const classModeAliasRedirect = redirectClassModeAliasPath(request);
  if (classModeAliasRedirect) return classModeAliasRedirect;

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  let session = null;
  if (token) {
    try {
      // ב-middleware בודקים חתימה+תוקף בלבד (בלי פנייה ל-DB בכל ניווט).
      // ביטול סשן (התנתקות/שינוי סיסמה) נאכף בכל API route דרך requireTenantSession,
      // והדפים עצמם לא מציגים נתונים בלי ה-API.
      session = await verifySessionTokenSignature(token);
    } catch {
      session = null;
    }
  }

  if (!TEMP_OPEN_ACCESS && isProtectedPath(pathname) && !session) {
    const loginUrl = request.nextUrl.clone();
    const nextPath = `${pathname}${request.nextUrl.search}`;
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    loginUrl.searchParams.set("next", nextPath);
    return NextResponse.redirect(loginUrl);
  }

  const nestedRewrite =
    rewriteBrokenSectorHomePage(request) ??
    rewriteBrokenSectorFrameworkPage(request) ??
    rewriteBrokenSectorNestedPage(request) ??
    rewriteBrokenPortfolioFormsPage(request) ??
    rewriteBrokenPortfolioCustomFolderPage(request) ??
    rewriteBrokenPortfolioFillPage(request) ??
    rewriteBrokenPortfolioCategoryPage(request) ??
    redirectLegacyPfolderCategoryPage(request);
  const response = nestedRewrite ?? NextResponse.next();

  if (token && !session) {
    response.cookies.set(SESSION_COOKIE, "", {
      ...sessionCookieOptions(0),
      maxAge: 0,
    });
  }

  return response;
}

export const config = {
  matcher: ["/personal-area/:path*", "/dashboard/:path*", "/api/:path*"],
};
