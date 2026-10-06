import { BookOpenIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { logout } from "@/app/auth/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "ダッシュボード" };

export default async function DashboardPage() {
  // proxy でもリダイレクトしているが、ページ側でも必ず認証を確認する。
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) {
    redirect("/login");
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-4">
      <p className="text-sm">
        ログイン中：<span className="font-medium">{data.claims.email}</span>
      </p>
      <Link
        href="/sets"
        className={buttonVariants({ size: "lg", className: "w-full max-w-xs" })}
      >
        <BookOpenIcon data-icon="inline-start" />
        問題集を解く
      </Link>
      <form action={logout}>
        <Button type="submit" variant="outline">
          ログアウト
        </Button>
      </form>
    </main>
  );
}
