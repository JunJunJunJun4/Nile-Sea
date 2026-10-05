import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// リクエストごとに新しいクライアントを作ること（グローバル変数に保持しない）。
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Server Component からは Cookie を書き込めない。
            // セッションの更新は proxy で行っているので無視してよい。
          }
        },
      },
    },
  );
}
