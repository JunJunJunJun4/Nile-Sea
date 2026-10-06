"use client";

import { BookOpenIcon, HouseIcon, SettingsIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const items = [
  { href: "/dashboard", label: "ダッシュボード", icon: HouseIcon, match: [] },
  // 挑戦中・結果の画面も「問題集」の中として扱う。
  { href: "/sets", label: "問題集", icon: BookOpenIcon, match: ["/attempts"] },
  { href: "/settings", label: "設定", icon: SettingsIcon, match: [] },
];

function isActive(pathname: string, paths: string[]) {
  return paths.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

export function AppNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="メインメニュー">
      <ul className="grid grid-cols-3 sm:flex sm:gap-1">
        {items.map(({ href, label, icon: Icon, match }) => {
          const active = isActive(pathname, [href, ...match]);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-12 flex-col items-center justify-center gap-0.5 border-b-2 border-transparent px-3 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none sm:min-h-14 sm:flex-row sm:gap-1.5 sm:text-sm",
                  active && "border-primary font-medium text-foreground",
                )}
              >
                <Icon className="size-5 sm:size-4" aria-hidden />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
