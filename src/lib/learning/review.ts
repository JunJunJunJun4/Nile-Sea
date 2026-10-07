import "server-only";

import { canSolveSet, getCanAccessAllSets } from "@/lib/learning/data";
import { type LearningSettings, toLearningSettings } from "@/lib/settings";
import type { createClient } from "@/lib/supabase/server";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

export type ReviewSetCount = {
  id: string;
  title: string;
  count: number;
};

export type ReviewSummary = {
  settings: LearningSettings;
  // 復習の対象数（重複なし）。set のときは問題集ごとの数の合計。
  total: number;
  // 復習の対象がある問題集だけ。問題集の一覧と同じ順。
  sets: ReviewSetCount[];
};

// 現在の設定で「不正解があり、まだクリアしていない問題」の数を、全体と問題集ごとに数える。
// 判定は get_review_questions（start_attempt の review と同じ抽出）に任せ、ここでは数えるだけにする。
// - set のときは問題集の指定が必須なので、全体は問題集ごとの数の合計にする。
// - question / knowledge のときは、同じ問題が複数の問題集に入っていれば、それぞれの問題集で数える
//   （そのため問題集ごとの数の合計は、全体の数より多くなることがある）。
export async function getReviewSummary(
  supabase: SupabaseClient,
  userId: string,
): Promise<ReviewSummary> {
  const [settingsResult, setsResult, canAccessAllSets] = await Promise.all([
    supabase
      .from("user_settings")
      .select("dedupe_scope, clear_mode, clear_threshold")
      .eq("user_id", userId)
      .single(),
    supabase
      .from("question_sets")
      .select("id, title, is_free, owner_id")
      .eq("status", "published")
      .order("created_at")
      .order("title"),
    getCanAccessAllSets(supabase),
  ]);
  if (settingsResult.error) throw reviewError(settingsResult.error);
  if (setsResult.error) throw reviewError(setsResult.error);

  const settings = toLearningSettings(settingsResult.data);
  // 現在のプランで解けない問題集は get_review_questions がエラーにするので、最初から除く。
  const solvableSets = setsResult.data.filter((set) =>
    canSolveSet(set, userId, canAccessAllSets),
  );

  const [perSet, all] = await Promise.all([
    Promise.all(
      solvableSets.map(async (set) => {
        const { data, error } = await supabase.rpc("get_review_questions", {
          p_question_set_id: set.id,
        });
        if (error) throw reviewError(error);
        return { id: set.id, title: set.title, count: data.length };
      }),
    ),
    settings.dedupeScope === "set"
      ? null
      : supabase.rpc("get_review_questions").then(({ data, error }) => {
          if (error) throw reviewError(error);
          return data;
        }),
  ]);

  const sets = perSet.filter((set) => set.count > 0);
  const total = all
    ? all.length
    : sets.reduce((sum, set) => sum + set.count, 0);

  return { settings, total, sets };
}

function reviewError(error: { message: string }) {
  return new Error(`復習の対象を読み込めませんでした: ${error.message}`);
}
