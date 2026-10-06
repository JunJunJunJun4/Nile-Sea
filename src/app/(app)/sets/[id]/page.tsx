import { LockIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from "@/components/ui/progress";
import {
  canSolveSet,
  getCanAccessAllSets,
  getCategoryLabels,
  idSchema,
  requireUser,
} from "@/lib/learning/data";
import {
  dedupeScopeOptions,
  describeSettings,
  toLearningSettings,
} from "@/lib/settings";

import { StartAttemptForm } from "./start-attempt-form";

export const metadata: Metadata = { title: "問題集" };

export default async function SetPage({ params }: PageProps<"/sets/[id]">) {
  const parsedId = idSchema.safeParse((await params).id);
  if (!parsedId.success) notFound();
  const setId = parsedId.data;

  const { supabase, userId } = await requireUser();

  const [
    { data: set, error },
    { data: progress, error: progressError },
    { data: openAttempt },
    { data: settingsRow },
    canAccessAllSets,
    categoryLabel,
  ] = await Promise.all([
    supabase
      .from("question_sets")
      .select(
        "id, title, description, question_count, is_free, owner_id, categories(path)",
      )
      .eq("id", setId)
      .maybeSingle(),
    supabase
      .rpc("get_set_progress", { p_question_set_id: setId })
      .maybeSingle(),
    // 途中でやめた挑戦があれば、続きから再開できるようにする。
    supabase
      .from("attempts")
      .select("id, planned_count, answered_count")
      .eq("question_set_id", setId)
      .eq("mode", "normal")
      .is("completed_at", null)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    // クリア済みは保存せず、この設定で get_set_progress が判定する。判定の前提として画面に添える。
    supabase
      .from("user_settings")
      .select("dedupe_scope, clear_mode, clear_threshold")
      .eq("user_id", userId)
      .maybeSingle(),
    getCanAccessAllSets(supabase),
    getCategoryLabels(supabase),
  ]);
  if (error)
    throw new Error(`問題集の読み込みに失敗しました: ${error.message}`);
  if (!set) notFound();

  const locked = !canSolveSet(set, userId, canAccessAllSets);
  const category = categoryLabel(set.categories?.path);
  const total = progress?.total_count ?? set.question_count;
  const cleared = progress?.cleared_count ?? 0;
  const settings = settingsRow ? toLearningSettings(settingsRow) : null;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 p-4">
      <Link
        href="/sets"
        className="text-sm text-muted-foreground underline-offset-4 hover:underline"
      >
        ← 問題集の一覧
      </Link>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            {category && <Badge variant="secondary">{category}</Badge>}
            {locked && (
              <Badge>
                <LockIcon data-icon="inline-start" />
                有料プラン
              </Badge>
            )}
          </div>
          <CardTitle className="text-lg">
            <h1>{set.title}</h1>
          </CardTitle>
          {set.description && (
            <CardDescription>{set.description}</CardDescription>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg bg-muted/50 p-3">
              <dt className="text-muted-foreground">問題数</dt>
              <dd className="text-lg font-semibold tabular-nums">{total}問</dd>
            </div>
            <div className="rounded-lg bg-muted/50 p-3">
              <dt className="text-muted-foreground">クリア済み</dt>
              <dd className="text-lg font-semibold tabular-nums">
                {cleared} / {total}
              </dd>
              {settings && (
                <dd className="text-xs text-muted-foreground">
                  （{dedupeScopeOptions[settings.dedupeScope].badge}）
                </dd>
              )}
            </div>
          </dl>

          {progressError ? (
            <p className="text-sm text-muted-foreground">
              進捗を読み込めませんでした。
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              <Progress value={total > 0 ? (cleared / total) * 100 : 0}>
                <ProgressLabel>進捗</ProgressLabel>
                <ProgressValue />
              </Progress>
              {settings && (
                <p className="text-sm text-muted-foreground">
                  {describeSettings(settings)}。
                  <Link
                    href="/settings"
                    className="ml-1 whitespace-nowrap text-foreground underline underline-offset-4"
                  >
                    設定を変更
                  </Link>
                </p>
              )}
            </div>
          )}

          {locked ? (
            <div className="flex flex-col gap-3">
              <p className="flex items-start gap-2 text-sm text-muted-foreground">
                <LockIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
                この問題集は有料プランで利用できます。現在のプランでは挑戦できません。
              </p>
              <button
                type="button"
                disabled
                className={buttonVariants({ size: "lg", className: "w-full" })}
              >
                <LockIcon data-icon="inline-start" />
                挑戦する
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {openAttempt && (
                <Link
                  href={`/attempts/${openAttempt.id}`}
                  className={buttonVariants({
                    variant: "outline",
                    size: "lg",
                    className: "w-full",
                  })}
                >
                  前回の続きから（{openAttempt.answered_count} /{" "}
                  {openAttempt.planned_count}問 回答済み）
                </Link>
              )}
              <StartAttemptForm questionSetId={set.id} />
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
