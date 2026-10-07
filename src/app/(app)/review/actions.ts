"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { idSchema, requireUser } from "@/lib/learning/data";
import { toLearningErrorMessage } from "@/lib/learning/errors";

export type StartReviewState = { message?: string };

// questionSetId を省くと、問題集をまたいで復習する（重複の判定範囲が set のときは DB がエラーにする）。
const startReviewSchema = z.object({
  questionSetId: idSchema.nullable(),
});

const startResultSchema = z.object({ attempt_id: idSchema });

export async function startReview(
  _prevState: StartReviewState,
  formData: FormData,
): Promise<StartReviewState> {
  const parsed = startReviewSchema.safeParse({
    questionSetId: formData.get("questionSetId") || null,
  });
  if (!parsed.success) {
    return { message: "問題集が見つかりません。" };
  }
  const { questionSetId } = parsed.data;

  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("start_attempt", {
    // 生成された型では NOT NULL 扱いだが、review では NULL（問題集の指定なし）を受け付ける。
    p_question_set_id: questionSetId as string,
    p_mode: "review",
  });
  if (error) {
    return {
      message: toLearningErrorMessage(error, {
        no_questions:
          "復習する問題はありません。ページを再読み込みして、最新の状態を確認してください。",
        question_set_required:
          "重複の判定範囲が「問題集ごとに独立」のため、問題集を選んで復習を始めてください。",
      }),
    };
  }

  const result = startResultSchema.safeParse(data);
  if (!result.success) {
    return { message: toLearningErrorMessage(null) };
  }

  redirect(`/attempts/${result.data.attempt_id}`);
}
