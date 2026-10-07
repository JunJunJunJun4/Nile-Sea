import {
  BookOpenIcon,
  FlameIcon,
  PlayIcon,
  RotateCcwIcon,
  SparklesIcon,
} from "lucide-react";
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
import { Progress, ProgressLabel } from "@/components/ui/progress";
import {
  computeStreaks,
  correctRate,
  type DayActivity,
  formatStudyTime,
  todayIn,
} from "@/lib/learning/activity";
import {
  attemptSetTitle,
  getCurrentPlan,
  getDailyActivities,
  requireUser,
} from "@/lib/learning/data";
import { getReviewSummary } from "@/lib/learning/review";

import { ActivityCalendar } from "./activity-calendar";

export const metadata: Metadata = { title: "学習記録" };

const RECENT_ATTEMPT_COUNT = 5;

export default async function DashboardPage() {
  const { supabase, userId } = await requireUser();

  const [
    { data: settings, error: settingsError },
    activities,
    plan,
    { data: attempts, error: attemptsError },
    review,
  ] = await Promise.all([
    supabase
      .from("user_settings")
      .select("timezone, daily_goal")
      .eq("user_id", userId)
      .single(),
    getDailyActivities(supabase),
    getCurrentPlan(supabase),
    supabase
      .from("attempts")
      .select(
        "id, mode, planned_count, answered_count, correct_count, started_at, completed_at, question_sets(title)",
      )
      .order("started_at", { ascending: false })
      .limit(RECENT_ATTEMPT_COUNT),
    getReviewSummary(supabase, userId),
  ]);
  if (settingsError) throw loadError(settingsError);
  if (attemptsError) throw loadError(attemptsError);

  // 「今日」とカレンダーの日付は、daily_activity.activity_date と同じく user_settings.timezone で区切る。
  const timeZone = settings.timezone;
  const today = todayIn(timeZone);

  const activity: Record<string, DayActivity> = {};
  const total = { answered: 0, correct: 0, seconds: 0 };
  for (const row of activities) {
    if (row.answered_count === 0) continue;
    activity[row.activity_date] = {
      answered: row.answered_count,
      correct: row.correct_count,
      seconds: row.study_seconds,
    };
    total.answered += row.answered_count;
    total.correct += row.correct_count;
    total.seconds += row.study_seconds;
  }

  const todayAnswered = activity[today]?.answered ?? 0;
  const streak = computeStreaks(Object.keys(activity), today);
  const studiedToday = todayAnswered > 0;
  const hasHistory = total.answered > 0;
  const rate = correctRate(total.correct, total.answered);

  const dailyGoal = settings.daily_goal;
  const dailyLimit = plan?.daily_question_limit ?? null;

  const dateTimeFormat = new Intl.DateTimeFormat("ja-JP", {
    timeZone,
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">学習記録</h1>

      {!hasHistory && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <SparklesIcon className="size-4" aria-hidden />
              まずは問題集を解いてみましょう
            </CardTitle>
            <CardDescription>
              問題を解くと、回答数や正答率、連続学習日数がここに記録されます。
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Link
          href="/sets"
          className={buttonVariants({ size: "lg", className: "w-full" })}
        >
          <BookOpenIcon data-icon="inline-start" />
          問題集を解く
        </Link>
        <Link
          href="/review"
          className={buttonVariants({
            variant: "outline",
            size: "lg",
            className: "w-full",
          })}
        >
          <RotateCcwIcon data-icon="inline-start" />
          {review.total > 0 ? `復習する（${review.total}問）` : "復習する"}
        </Link>
      </div>

      <section aria-labelledby="today-heading">
        <Card>
          <CardHeader>
            <CardTitle>
              <h2 id="today-heading">今日の学習</h2>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-3xl font-semibold tabular-nums">
              {todayAnswered}
              <span className="ml-1 text-base font-normal text-muted-foreground">
                問 回答
              </span>
            </p>

            {dailyGoal ? (
              <Progress value={Math.min(todayAnswered / dailyGoal, 1) * 100}>
                <ProgressLabel>
                  1日の目標 {dailyGoal}問
                  {todayAnswered >= dailyGoal && "：達成しました"}
                </ProgressLabel>
                <span className="ml-auto text-sm text-muted-foreground tabular-nums">
                  {todayAnswered} / {dailyGoal}問
                </span>
              </Progress>
            ) : (
              <p className="text-sm text-muted-foreground">
                1日の目標問題数を決めると、ここに進み具合が出ます。
                <Link
                  href="/settings"
                  className="ml-1 whitespace-nowrap text-foreground underline underline-offset-4"
                >
                  目標を設定する
                </Link>
              </p>
            )}

            {dailyLimit !== null && (
              <p className="text-sm text-muted-foreground">
                {plan?.name ?? "無料"}プランの1日の上限（{dailyLimit}
                問）まで、残り
                <span className="mx-1 font-medium text-foreground tabular-nums">
                  {Math.max(dailyLimit - todayAnswered, 0)}問
                </span>
                です。
              </p>
            )}
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="streak-heading">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FlameIcon className="size-4 text-orange-500" aria-hidden />
              <h2 id="streak-heading">連続学習日数</h2>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <dl className="grid grid-cols-2 gap-3">
              <Stat label="現在" value={`${streak.current}日`} large />
              <Stat
                label="これまでの最長"
                value={`${streak.longest}日`}
                large
              />
            </dl>
            <p className="text-sm text-muted-foreground">
              {streak.current === 0
                ? hasHistory
                  ? "今日から、また連続記録をはじめましょう。"
                  : "1問解くと、連続学習の記録が始まります。"
                : studiedToday
                  ? "今日も学習しました。この調子で続けましょう。"
                  : `今日も解くと、${streak.current + 1}日連続になります。`}
            </p>
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="total-heading">
        <Card>
          <CardHeader>
            <CardTitle>
              <h2 id="total-heading">累計</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Stat label="回答した問題" value={`${total.answered}問`} />
              <Stat label="正解" value={`${total.correct}問`} />
              <Stat
                label="不正解"
                value={`${total.answered - total.correct}問`}
              />
              <Stat label="正答率" value={rate === null ? "—" : `${rate}%`} />
              <Stat label="学習時間" value={formatStudyTime(total.seconds)} />
            </dl>
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="calendar-heading">
        <Card>
          <CardHeader>
            <CardTitle>
              <h2 id="calendar-heading">カレンダー</h2>
            </CardTitle>
            <CardDescription>
              日付を選ぶと、その日の記録が見られます。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ActivityCalendar activity={activity} today={today} />
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="recent-heading" className="flex flex-col gap-3">
        <h2 id="recent-heading" className="font-semibold">
          最近の挑戦
        </h2>
        {attempts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            まだ挑戦の記録がありません。
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {attempts.map((attempt) => {
              const completed = attempt.completed_at !== null;
              return (
                <li key={attempt.id}>
                  <Card size="sm">
                    <CardHeader>
                      <div className="flex flex-wrap items-center gap-2">
                        {attempt.mode === "review" ? (
                          <Badge>
                            <RotateCcwIcon data-icon="inline-start" />
                            復習
                          </Badge>
                        ) : (
                          <Badge variant="secondary">通常</Badge>
                        )}
                        {!completed && <Badge variant="outline">途中</Badge>}
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {dateTimeFormat.format(new Date(attempt.started_at))}
                        </span>
                      </div>
                      <CardTitle>{attemptSetTitle(attempt)}</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-sm tabular-nums">
                        正解
                        <span className="mx-1 font-semibold">
                          {attempt.correct_count}
                        </span>
                        / {attempt.planned_count}問
                        {!completed && (
                          <span className="ml-2 text-muted-foreground">
                            （{attempt.answered_count}問 回答済み）
                          </span>
                        )}
                      </p>
                      {completed ? (
                        <Link
                          href={`/attempts/${attempt.id}/result`}
                          className={buttonVariants({
                            variant: "ghost",
                            size: "lg",
                          })}
                        >
                          結果を見る
                        </Link>
                      ) : (
                        <Link
                          href={`/attempts/${attempt.id}`}
                          className={buttonVariants({
                            variant: "outline",
                            size: "lg",
                          })}
                        >
                          <PlayIcon data-icon="inline-start" />
                          続きから
                        </Link>
                      )}
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}

function loadError(error: { message: string }) {
  return new Error(`学習記録の読み込みに失敗しました: ${error.message}`);
}

function Stat({
  label,
  value,
  large = false,
}: {
  label: string;
  value: string;
  large?: boolean;
}) {
  return (
    <div className="rounded-lg bg-muted/50 p-3">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd
        className={
          large
            ? "text-2xl font-semibold tabular-nums"
            : "text-lg font-semibold tabular-nums"
        }
      >
        {value}
      </dd>
    </div>
  );
}
