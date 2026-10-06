import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";

import { safeNextPath } from "@/lib/safe-redirect";
import { createClient } from "@/lib/supabase/server";

// 標準テンプレート（{{ .ConfirmationURL }}）の確認リンクから戻ってきたときの処理。
// PKCE フローの code を、signUp 時に Cookie へ保存された code verifier と合わせて
// セッションに交換する。そのため signUp と同じブラウザで開く必要がある。
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const redirectTo = safeNextPath(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      redirect(redirectTo);
    }
  }

  redirect("/login?error=confirm");
}
