import { CircleCheckIcon, RotateCcwIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { attemptSetTitle, idSchema, requireUser } from "@/lib/learning/data";
import { toLearningErrorMessage } from "@/lib/learning/errors";

export const metadata: Metadata = { title: "結果" };

export default async function AttemptResultPage({
  params,
}: PageProps<"/attempts/[id]/result">) {
  const parsedId = idSchema.safeParse((await params).id);
  if (!parsedId.success) notFound();
  const attemptId = parsedId.data;

  const { supabase } = await requireUser();

  const { data: attempt, error: attemptError } = await supabase
    .from("attempts")
    .select(
      "id, question_set_id, mode, planned_count, correct_count, score, completed_at, question_sets(title)",
    )
    .eq("id", attemptId)
    .maybeSingle();
  if (attemptError) {
    throw new Error(`結果の読み込みに失敗しました: ${attemptError.message}`);
  }
  if (!attempt) notFound();
  if (!attempt.completed_at) redirect(`/attempts/${attemptId}`);

  // 正解の選択肢は is_correct を読めないため、回答済みの問題についてだけ関数から受け取る。
  const { data: rows, error } = await supabase.rpc("get_attempt_result", {
    p_attempt_id: attemptId,
  });

  const total = attempt.planned_count;
  const correct = attempt.correct_count;
  const rate = Math.round(Number(attempt.score ?? 0));
  const mistakes = (rows ?? []).filter((row) => row.is_correct === false);
  // 復習の挑戦は、復習ページに戻して残りの対象から始め直す。
  const isReview = attempt.mode === "review";
  const retryHref = isReview
    ? "/review"
    : attempt.question_set_id
      ? `/sets/${attempt.question_set_id}`
      : "/sets";

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 p-4">
      <Card>
        <CardHeader>
          <CardDescription className="flex flex-wrap items-center gap-2">
            {isReview && (
              <Badge>
                <RotateCcwIcon data-icon="inline-start" />
                復習
              </Badge>
            )}
            {attemptSetTitle(attempt)}
          </CardDescription>
          <CardTitle className="text-lg">
            <h1>{isReview ? "復習の結果" : "結果"}</h1>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-muted/50 p-3">
              <dt className="text-sm text-muted-foreground">正解数</dt>
              <dd className="text-2xl font-semibold tabular-nums">
                {correct}
                <span className="text-base text-muted-foreground">
                  {" "}
                  / {total}問
                </span>
              </dd>
            </div>
            <div className="rounded-lg bg-muted/50 p-3">
              <dt className="text-sm text-muted-foreground">正答率</dt>
              <dd className="text-2xl font-semibold tabular-nums">{rate}%</dd>
            </div>
          </dl>
          {isReview && (
            <p className="mt-3 text-sm text-muted-foreground">
              正解してクリアの条件を満たした問題は、次の復習から外れます。
            </p>
          )}
        </CardContent>
      </Card>

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">
          間違えた問題
          {!error && (
            <span className="ml-1 text-sm font-normal text-muted-foreground">
              （{mistakes.length}問）
            </span>
          )}
        </h2>
        {error ? (
          <p className="text-sm text-destructive">
            {toLearningErrorMessage(error)}
          </p>
        ) : mistakes.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <CircleCheckIcon className="size-4 text-emerald-600" aria-hidden />
            全問正解です。
          </p>
        ) : (
          <ol className="flex flex-col gap-3">
            {mistakes.map((row) => (
              <li key={row.question_id}>
                <Card size="sm">
                  <CardHeader>
                    <CardDescription>
                      第{row.question_position}問
                    </CardDescription>
                    <CardTitle className="font-medium whitespace-pre-wrap">
                      {row.question_body}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3 text-sm">
                    <dl className="flex flex-col gap-2">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <dt>
                          <Badge variant="destructive">あなたの回答</Badge>
                        </dt>
                        <dd>{row.selected_choice_body ?? "—"}</dd>
                      </div>
                      <div className="flex flex-wrap items-baseline gap-2">
                        <dt>
                          <Badge className="bg-emerald-600 text-white">
                            正解
                          </Badge>
                        </dt>
                        <dd>{row.correct_choice_body ?? "—"}</dd>
                      </div>
                    </dl>
                    {row.explanation && (
                      <>
                        <Separator />
                        <div>
                          <p className="mb-1 font-medium">解説</p>
                          <p className="whitespace-pre-wrap text-muted-foreground">
                            {row.explanation}
                          </p>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              </li>
            ))}
          </ol>
        )}
      </section>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Link
          href={retryHref}
          className={buttonVariants({ size: "lg", className: "flex-1" })}
        >
          もう一度挑戦
        </Link>
        <Link
          href="/sets"
          className={buttonVariants({
            variant: "outline",
            size: "lg",
            className: "flex-1",
          })}
        >
          問題集の一覧へ
        </Link>
      </div>
    </main>
  );
}
