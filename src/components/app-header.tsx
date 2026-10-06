import { LogOutIcon } from "lucide-react";
import Link from "next/link";

import { logout } from "@/app/auth/actions";
import { AppNav } from "@/components/app-nav";
import { Button } from "@/components/ui/button";

// ログイン後の全ページに出す共通ヘッダー。
// スマートフォンの幅では、メニューを2段目に横並びのタブとして出す。
export function AppHeader() {
  return (
    <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80">
      <div className="mx-auto flex w-full max-w-2xl flex-wrap items-center justify-between gap-x-4 px-4 sm:flex-nowrap">
        <Link
          href="/dashboard"
          className="flex min-h-12 items-center font-semibold tracking-tight sm:min-h-14"
        >
          Nile-Sea
        </Link>
        <div className="order-last -mx-4 w-[calc(100%+2rem)] border-t sm:order-none sm:mx-0 sm:w-auto sm:flex-1 sm:border-t-0">
          <AppNav />
        </div>
        <form action={logout}>
          <Button type="submit" variant="ghost" size="sm">
            <LogOutIcon data-icon="inline-start" />
            ログアウト
          </Button>
        </form>
      </div>
    </header>
  );
}
