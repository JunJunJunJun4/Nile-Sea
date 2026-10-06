import { InfoIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { requireUser } from "@/lib/learning/data";
import { describeSettings, toLearningSettings } from "@/lib/settings";

import { SettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "設定" };

// 進捗を表示する問題集の数の上限（直近に挑戦したものから）。
const STUDIED_SETS_LIMIT = 10;

export default async function SettingsPage() {
  const { supabase, userId } = await requireUser();

  const [{ data: row, error }, { data: attempts }] = await Promise.all([
    supabase
      .from("user_settings")
      .select("dedupe_scope, clear_mode, clear_threshold, daily_goal")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("attempts")
      .select("question_set_id, question_sets(title)")
      .not("question_set_id", "is", null)
      .order("started_at", { ascending: false })
      .limit(200),
  ]);
  if (error) throw new Error(`設定の読み込みに失敗しました: ${error.message}`);
  if (!row) throw new Error("ユーザー設定が見つかりません。");

  const settings = toLearningSettings(row);

  // 学習した問題集ごとに、現在の設定でのクリア済みの数を関数で判定し直す。
  const studiedSets = [
    ...new Map(
      (attempts ?? []).flatMap((a) =>
        a.question_set_id
          ? [[a.question_set_id, a.question_sets?.title ?? "問題集"] as const]
          : [],
      ),
    ),
  ].slice(0, STUDIED_SETS_LIMIT);
  const progress = await Promise.all(
    studiedSets.map(async ([id, title]) => {
      const { data } = await supabase
        .rpc("get_set_progress", { p_question_set_id: id })
        .maybeSingle();
      return data ? { id, title, ...data } : null;
    }),
  );

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">設定</h1>

      <Card>
        <CardHeader>
          <CardDescription>現在の設定</CardDescription>
          <CardTitle className="text-base">
            {describeSettings(settings)}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="flex items-start gap-2 text-sm text-muted-foreground">
            <InfoIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
            「クリア済み」は記録として保存せず、これまでの学習結果をその時点の設定で判定します。設定を変えると、過去の結果に対するクリア済みの数もすぐに切り替わります。
          </p>

          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-medium">
              学習した問題集のクリア済み（現在の設定で判定）
            </h2>
            {progress.some(Boolean) ? (
              <ul className="flex flex-col gap-3">
                {progress.map(
                  (p) =>
                    p && (
                      <li key={p.id} className="flex flex-col gap-1.5">
                        <div className="flex items-baseline justify-between gap-2 text-sm">
                          <Link
                            href={`/sets/${p.id}`}
                            className="underline-offset-4 hover:underline"
                          >
                            {p.title}
                          </Link>
                          <span className="shrink-0 font-medium tabular-nums">
                            {p.cleared_count} / {p.total_count}
                          </span>
                        </div>
                        <Progress
                          value={
                            p.total_count > 0
                              ? (p.cleared_count / p.total_count) * 100
                              : 0
                          }
                          aria-label={`${p.title}のクリア済み`}
                        />
                      </li>
                    ),
                )}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                まだ学習した問題集はありません。
              </p>
            )}
          </section>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>学習の設定を変更</CardTitle>
        </CardHeader>
        <CardContent>
          <SettingsForm initial={{ ...settings, dailyGoal: row.daily_goal }} />
        </CardContent>
      </Card>
    </main>
  );
}
