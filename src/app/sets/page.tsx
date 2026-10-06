import { ChevronRightIcon, LockIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  canSolveSet,
  getCanAccessAllSets,
  getCategoryLabels,
  requireUser,
} from "@/lib/learning/data";

export const metadata: Metadata = { title: "問題集" };

export default async function SetsPage() {
  const { supabase, userId } = await requireUser();

  // RLS で、公開中の問題集（と自分の問題集）だけが返る。有料の問題集も一覧には出る。
  const [{ data: sets, error }, canAccessAllSets, categoryLabel] =
    await Promise.all([
      supabase
        .from("question_sets")
        .select(
          "id, title, description, question_count, is_free, owner_id, categories(path)",
        )
        .eq("status", "published")
        .order("created_at")
        .order("title"),
      getCanAccessAllSets(supabase),
      getCategoryLabels(supabase),
    ]);
  if (error)
    throw new Error(`問題集の読み込みに失敗しました: ${error.message}`);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 p-4">
      <div className="flex flex-col gap-1">
        <Link
          href="/dashboard"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← ダッシュボード
        </Link>
        <h1 className="text-xl font-semibold">問題集</h1>
      </div>

      {sets.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          公開中の問題集はまだありません。
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {sets.map((set) => {
            const locked = !canSolveSet(set, userId, canAccessAllSets);
            const category = categoryLabel(set.categories?.path);
            return (
              <li key={set.id}>
                <Link
                  href={`/sets/${set.id}`}
                  className="block rounded-xl focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  <Card className="transition-colors hover:bg-muted/50">
                    <CardHeader>
                      <div className="flex flex-wrap items-center gap-2">
                        {category && (
                          <Badge variant="secondary">{category}</Badge>
                        )}
                        <Badge variant="outline">{set.question_count}問</Badge>
                        {locked && (
                          <Badge>
                            <LockIcon data-icon="inline-start" />
                            有料プラン
                          </Badge>
                        )}
                      </div>
                      <CardTitle className="flex items-center justify-between gap-2">
                        <span>{set.title}</span>
                        <ChevronRightIcon
                          className="size-4 shrink-0 text-muted-foreground"
                          aria-hidden
                        />
                      </CardTitle>
                      {set.description && (
                        <CardDescription>{set.description}</CardDescription>
                      )}
                    </CardHeader>
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
