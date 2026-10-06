import "server-only";

import { redirect } from "next/navigation";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

export const idSchema = z.uuid();

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

// proxy でもリダイレクトしているが、ページと Server Action でも必ず認証を確認する。
export async function requireUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) {
    redirect("/login");
  }
  return { supabase, userId: data.claims.sub };
}

// 現在のプランですべての問題集を解けるか（subscriptions がなければ free として扱う）。
// 鍵アイコンの表示に使うだけで、実際に挑戦できるかは start_attempt が判定する。
export async function getCanAccessAllSets(supabase: SupabaseClient) {
  const { data } = await supabase
    .from("subscriptions")
    .select("plans(can_access_all_sets)")
    .maybeSingle();
  return data?.plans?.can_access_all_sets ?? false;
}

export function canSolveSet(
  set: { is_free: boolean; owner_id: string | null },
  userId: string,
  canAccessAllSets: boolean,
) {
  return set.is_free || canAccessAllSets || set.owner_id === userId;
}

// 分類の path ごとに「言語 / 英語 / 語彙」のような表示名を返す。
export async function getCategoryLabels(supabase: SupabaseClient) {
  const { data } = await supabase.from("categories").select("path, name");
  const nameByPath = new Map((data ?? []).map((c) => [c.path, c.name]));

  return (path: string | null | undefined) => {
    if (!path) return null;
    const segments = path.split("/");
    return segments
      .map((_, i) => nameByPath.get(segments.slice(0, i + 1).join("/")))
      .filter(Boolean)
      .join(" / ");
  };
}

// 挑戦の状態と、次に出題する問題（出題リストのうち未回答で、出題順が最初のもの）をサーバー側で決める。
export async function getAttemptState(
  supabase: SupabaseClient,
  attemptId: string,
) {
  const [attemptResult, itemsResult, answersResult] = await Promise.all([
    supabase
      .from("attempts")
      .select(
        "id, question_set_id, planned_count, correct_count, score, completed_at, question_sets(title)",
      )
      .eq("id", attemptId)
      .maybeSingle(),
    supabase
      .from("attempt_questions")
      .select("question_id, position")
      .eq("attempt_id", attemptId)
      .order("position"),
    supabase.from("answers").select("question_id").eq("attempt_id", attemptId),
  ]);

  const error = attemptResult.error ?? itemsResult.error ?? answersResult.error;
  if (error) throw new Error(`挑戦の読み込みに失敗しました: ${error.message}`);

  const attempt = attemptResult.data;
  if (!attempt) return null;

  const answered = new Set(
    (answersResult.data ?? []).map((a) => a.question_id),
  );
  const next =
    (itemsResult.data ?? []).find((item) => !answered.has(item.question_id)) ??
    null;

  return {
    attempt,
    answeredCount: answered.size,
    nextQuestionId: next?.question_id ?? null,
  };
}
