import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
          // 認証 Cookie を含むレスポンスが CDN にキャッシュされないようにする。
          Object.entries(headers).forEach(([key, value]) =>
            supabaseResponse.headers.set(key, value),
          );
        },
      },
    },
  );

  // createServerClient と getClaims() の間に処理を挟まないこと。
  // getClaims() が期限切れのトークンを更新し、Cookie を書き戻す。
  const { data } = await supabase.auth.getClaims();
  const isLoggedIn = Boolean(data?.claims);

  const { pathname } = request.nextUrl;
  if (!isLoggedIn && isProtectedPath(pathname)) {
    return redirectWithSession(request, supabaseResponse, "/login");
  }
  if (isLoggedIn && isGuestOnlyPath(pathname)) {
    return redirectWithSession(request, supabaseResponse, "/dashboard");
  }

  // supabaseResponse をそのまま返すこと。新しいレスポンスを作る場合は
  // supabaseResponse の Cookie をコピーしないとセッションが失われる。
  return supabaseResponse;
}

const PROTECTED_PATHS = [
  "/dashboard",
  "/sets",
  "/attempts",
  "/review",
  "/settings",
];

function isProtectedPath(pathname: string) {
  return PROTECTED_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

function isGuestOnlyPath(pathname: string) {
  return pathname === "/login" || pathname === "/signup";
}

// 更新されたセッション Cookie とヘッダーを引き継いだままリダイレクトする。
function redirectWithSession(
  request: NextRequest,
  supabaseResponse: NextResponse,
  pathname: string,
) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";

  const response = NextResponse.redirect(url);
  supabaseResponse.cookies
    .getAll()
    .forEach((cookie) => response.cookies.set(cookie));
  // setAll で付与されたキャッシュ抑止ヘッダーのみ。x-middleware-* はコピーしない。
  ["cache-control", "expires", "pragma"].forEach((key) => {
    const value = supabaseResponse.headers.get(key);
    if (value) response.headers.set(key, value);
  });
  return response;
}
