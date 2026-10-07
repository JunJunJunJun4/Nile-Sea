import { BookOpenIcon, CircleCheckIcon, PlayIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { attemptSetTitle, requireUser } from "@/lib/learning/data";
import { getReviewSummary } from "@/lib/learning/review";
import { describeSettings } from "@/lib/settings";

import { StartReviewForm } from "./start-review-form";

export const metadata: Metadata = { title: "復習" };

export default async function ReviewPage() {
  const { supabase, userId } = await requireUser();

  const [summary, { data: openReview }, { count: studiedDays }] =
    await Promise.all([
      getReviewSummary(supabase, userId),
      // 途中でやめた復習があれば、続きから再開できるようにする。
      supabase
        .from("attempts")
        .select("id, mode, planned_count, answered_count, question_sets(title)")
        .eq("mode", "review")
        .is("completed_at", null)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      // 空の状態の文言を分けるため、学習したことがあるかだけを調べる。
      supabase
        .from("daily_activity")
        .select("activity_date", { count: "exact", head: true }),
    ]);

  const { settings, total, sets } = summary;
  const perSet = settings.dedupeScope === "set";

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 p-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">復習</h1>
        <p className="text-sm text-muted-foreground">
          間違えたことがあり、まだクリアしていない問題を解き直します。正解してクリアの条件を満たすと、復習の対象から外れます。
        </p>
      </div>

      <p className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
        現在の設定：{describeSettings(settings)}。
        <Link
          href="/settings"
          className="ml-1 whitespace-nowrap text-foreground underline underline-offset-4"
        >
          設定を変更
        </Link>
      </p>

      {openReview && (
        <Card size="sm">
          <CardHeader>
            <CardDescription>途中の復習があります</CardDescription>
            <CardTitle>{attemptSetTitle(openReview)}</CardTitle>
          </CardHeader>
          <CardContent>
            <Link
              href={`/attempts/${openReview.id}`}
              className={buttonVariants({
                variant: "outline",
                size: "lg",
                className: "w-full",
              })}
            >
              <PlayIcon data-icon="inline-start" />
              続きから（{openReview.answered_count} / {openReview.planned_count}
              問 回答済み）
            </Link>
          </CardContent>
        </Card>
      )}

      {total === 0 ? (
        <Card>
          <CardHeader className="items-center text-center">
            <CircleCheckIcon
              className="mx-auto size-10 text-emerald-600"
              aria-hidden
            />
            <CardTitle className="text-lg">
              <h2>復習する問題はありません</h2>
            </CardTitle>
            <CardDescription>
              {studiedDays
                ? "間違えた問題は、いまの設定ですべてクリアしています。新しい問題に挑戦してみましょう。"
                : "まずは問題集を解いてみましょう。間違えた問題が、ここで復習できるようになります。"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              href="/sets"
              className={buttonVariants({ size: "lg", className: "w-full" })}
            >
              <BookOpenIcon data-icon="inline-start" />
              問題集を解く
            </Link>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardDescription>復習する問題</CardDescription>
              <CardTitle className="text-3xl tabular-nums">
                {total}
                <span className="ml-1 text-base font-normal text-muted-foreground">
                  問
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {perSet ? (
                <p className="text-sm text-muted-foreground">
                  重複の判定範囲が「問題集ごとに独立」のため、問題集ごとに復習します。下の一覧から問題集を選んでください。
                </p>
              ) : (
                <StartReviewForm label={`復習を始める（${total}問）`} />
              )}
            </CardContent>
          </Card>

          <section className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <h2 className="font-semibold">問題集ごとの内訳</h2>
              {!perSet && (
                <p className="text-sm text-muted-foreground">
                  問題集を絞って復習することもできます。同じ問題が複数の問題集に入っているときは、それぞれの問題集で数えます。
                </p>
              )}
            </div>
            <ul className="flex flex-col gap-3">
              {sets.map((set) => (
                <li key={set.id}>
                  <Card size="sm">
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between gap-2">
                        <Link
                          href={`/sets/${set.id}`}
                          className="underline-offset-4 hover:underline"
                        >
                          {set.title}
                        </Link>
                        <Badge variant="secondary" className="tabular-nums">
                          {set.count}問
                        </Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <StartReviewForm
                        questionSetId={set.id}
                        label={`この問題集を復習する（${set.count}問）`}
                        variant={perSet ? "default" : "outline"}
                      />
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </main>
  );
}
