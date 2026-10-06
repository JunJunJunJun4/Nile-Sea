"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { idSchema, requireUser } from "@/lib/learning/data";
import { toLearningErrorMessage } from "@/lib/learning/errors";

export type StartAttemptState = { message?: string };

const startAttemptSchema = z.object({
  questionSetId: idSchema,
  includeCleared: z.boolean(),
});

const startResultSchema = z.object({ attempt_id: idSchema });

export async function startAttempt(
  _prevState: StartAttemptState,
  formData: FormData,
): Promise<StartAttemptState> {
  const parsed = startAttemptSchema.safeParse({
    questionSetId: formData.get("questionSetId"),
    includeCleared: formData.get("includeCleared") === "on",
  });
  if (!parsed.success) {
    return { message: "問題集が見つかりません。" };
  }
  const { questionSetId, includeCleared } = parsed.data;

  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("start_attempt", {
    p_question_set_id: questionSetId,
    p_mode: "normal",
    p_skip_cleared: !includeCleared,
  });
  if (error) {
    return {
      message: toLearningErrorMessage(error, {
        no_questions: includeCleared
          ? "この問題集には、出題できる問題がありません。"
          : "この問題集の問題は、すべてクリア済みです。「クリア済みの問題も出題する」にチェックを入れると、もう一度挑戦できます。",
      }),
    };
  }

  const result = startResultSchema.safeParse(data);
  if (!result.success) {
    return { message: toLearningErrorMessage(null) };
  }

  redirect(`/attempts/${result.data.attempt_id}`);
}
