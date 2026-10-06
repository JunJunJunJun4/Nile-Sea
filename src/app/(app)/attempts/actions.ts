"use server";

import { z } from "zod";

import { getAttemptState, idSchema, requireUser } from "@/lib/learning/data";
import { toLearningErrorMessage } from "@/lib/learning/errors";

export type SubmitAnswerResult =
  | {
      ok: true;
      isCorrect: boolean;
      correctChoiceId: string | null;
      explanation: string | null;
      completed: boolean;
    }
  | { ok: false; message: string };

const submitAnswerSchema = z.object({
  attemptId: idSchema,
  // 画面に表示中の問題。出題する問題はサーバー側で決め、これは画面が古くないかの確認にだけ使う。
  questionId: idSchema,
  choiceId: idSchema,
  timeMs: z.number().int().min(0).max(86_400_000).nullable(),
});

const submitResultSchema = z.object({
  attempt_completed: z.boolean(),
  is_correct: z.boolean(),
  correct_choice_id: idSchema.nullable(),
  explanation: z.string().nullable(),
});

export async function submitAnswer(
  input: z.input<typeof submitAnswerSchema>,
): Promise<SubmitAnswerResult> {
  const parsed = submitAnswerSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "選択肢を選んでください。" };
  }
  const { attemptId, questionId, choiceId, timeMs } = parsed.data;

  const { supabase } = await requireUser();

  // その挑戦の出題リストのうち、まだ回答していない最初の問題に回答する。
  const state = await getAttemptState(supabase, attemptId);
  if (!state) {
    return {
      ok: false,
      message: toLearningErrorMessage({ message: "attempt_not_found" }),
    };
  }
  if (state.attempt.completed_at) {
    return {
      ok: false,
      message: toLearningErrorMessage({ message: "attempt_completed" }),
    };
  }
  if (state.nextQuestionId !== questionId) {
    return {
      ok: false,
      message: toLearningErrorMessage({ message: "already_answered" }),
    };
  }

  const { data, error } = await supabase.rpc("submit_answer", {
    p_attempt_id: attemptId,
    p_question_id: state.nextQuestionId,
    p_selected_choice_id: choiceId,
    p_time_ms: timeMs ?? undefined,
  });
  if (error) {
    return { ok: false, message: toLearningErrorMessage(error) };
  }

  const result = submitResultSchema.safeParse(data);
  if (!result.success) {
    return { ok: false, message: toLearningErrorMessage(null) };
  }

  return {
    ok: true,
    isCorrect: result.data.is_correct,
    correctChoiceId: result.data.correct_choice_id,
    explanation: result.data.explanation,
    completed: result.data.attempt_completed,
  };
}
