import { RotateCcwIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Progress, ProgressLabel } from "@/components/ui/progress";
import {
  attemptSetTitle,
  getAttemptState,
  idSchema,
  requireUser,
} from "@/lib/learning/data";

import { QuestionForm } from "./question-form";

export const metadata: Metadata = { title: "問題を解く" };

export default async function AttemptPage({
  params,
}: PageProps<"/attempts/[id]">) {
  const parsedId = idSchema.safeParse((await params).id);
  if (!parsedId.success) notFound();
  const attemptId = parsedId.data;

  const { supabase } = await requireUser();

  const state = await getAttemptState(supabase, attemptId);
  if (!state) notFound();
  const { attempt, answeredCount, nextQuestionId } = state;
  if (attempt.completed_at) redirect(`/attempts/${attemptId}/result`);

  // 復習の挑戦は復習ページに戻す。
  const isReview = attempt.mode === "review";
  const backHref = isReview
    ? "/review"
    : attempt.question_set_id
      ? `/sets/${attempt.question_set_id}`
      : "/sets";

  // question_choices は is_correct を読めないので、列を指定して読む。
  const [{ data: question }, { data: choices }] = nextQuestionId
    ? await Promise.all([
        supabase
          .from("questions")
          .select("id, body")
          .eq("id", nextQuestionId)
          .maybeSingle(),
        supabase
          .from("question_choices")
          .select("id, position, body")
          .eq("question_id", nextQuestionId)
          .order("position"),
      ])
    : [{ data: null }, { data: null }];

  if (!question || !choices || choices.length === 0) {
    return (
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 p-4">
        <h1 className="text-xl font-semibold">この挑戦は続けられません</h1>
        <p className="text-sm text-muted-foreground">
          問題を読み込めませんでした。問題集が非公開になったか、現在のプランでは解けない可能性があります。問題集のページから、もう一度挑戦してください。
        </p>
        <Link
          href={backHref}
          className={buttonVariants({ size: "lg", className: "w-full" })}
        >
          {isReview ? "復習ページに戻る" : "問題集に戻る"}
        </Link>
      </main>
    );
  }

  const current = answeredCount + 1;
  const total = attempt.planned_count;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 p-4">
      <div className="flex flex-col gap-3">
        <Link
          href={backHref}
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← {isReview ? "復習" : attemptSetTitle(attempt)}
        </Link>
        {isReview && (
          <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
            <Badge>
              <RotateCcwIcon data-icon="inline-start" />
              復習
            </Badge>
            {attemptSetTitle(attempt)}の間違えた問題
          </p>
        )}
        <Progress value={(answeredCount / total) * 100}>
          <ProgressLabel>
            問題 {current} / {total}
          </ProgressLabel>
          <span className="ml-auto text-sm text-muted-foreground tabular-nums">
            正解 {attempt.correct_count}問
          </span>
        </Progress>
      </div>

      <QuestionForm
        key={question.id}
        attemptId={attemptId}
        questionId={question.id}
        questionNumber={current}
        body={question.body}
        choices={choices}
      />
    </main>
  );
}
