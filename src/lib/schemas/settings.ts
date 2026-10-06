import { z } from "zod";

import {
  CLEAR_MODES,
  CLEAR_THRESHOLD_MAX,
  CLEAR_THRESHOLD_MIN,
  DAILY_GOAL_MAX,
  DEDUPE_SCOPES,
} from "@/lib/settings";

export const settingsSchema = z.object({
  dedupeScope: z.enum(DEDUPE_SCOPES, {
    error: "重複の判定範囲を選んでください",
  }),
  clearMode: z.enum(CLEAR_MODES, {
    error: "クリア条件の数え方を選んでください",
  }),
  clearThreshold: z.coerce
    .number({ error: "クリアに必要な回数を選んでください" })
    .int({ error: "クリアに必要な回数を選んでください" })
    .min(CLEAR_THRESHOLD_MIN, {
      error: `クリアに必要な回数は${CLEAR_THRESHOLD_MIN}〜${CLEAR_THRESHOLD_MAX}回から選んでください`,
    })
    .max(CLEAR_THRESHOLD_MAX, {
      error: `クリアに必要な回数は${CLEAR_THRESHOLD_MIN}〜${CLEAR_THRESHOLD_MAX}回から選んでください`,
    }),
  // 空欄は「目標なし」（NULL）。
  dailyGoal: z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? null : value,
    z.coerce
      .number({ error: "1日の目標問題数は整数で入力してください" })
      .int({ error: "1日の目標問題数は整数で入力してください" })
      .min(1, { error: "1日の目標問題数は1問以上で入力してください" })
      .max(DAILY_GOAL_MAX, {
        error: `1日の目標問題数は${DAILY_GOAL_MAX}問以内で入力してください`,
      })
      .nullable(),
  ),
});

export type SettingsFieldErrors = Partial<
  Record<keyof z.infer<typeof settingsSchema>, string[]>
>;

export type SettingsFormState = {
  status?: "error" | "success";
  message?: string;
  fieldErrors?: SettingsFieldErrors;
};
