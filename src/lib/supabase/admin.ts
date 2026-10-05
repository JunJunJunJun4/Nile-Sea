import "server-only";

import { createClient } from "@supabase/supabase-js";

// SUPABASE_SECRET_KEY を使い RLS をバイパスする管理者用クライアント。
// サーバー側の信頼できる処理（Webhook など）でのみ使うこと。
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    },
  );
}
