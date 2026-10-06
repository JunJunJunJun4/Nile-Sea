"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/learning/data";
import { settingsSchema, type SettingsFormState } from "@/lib/schemas/settings";

export async function updateSettings(
  _prevState: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const parsed = settingsSchema.safeParse({
    dedupeScope: formData.get("dedupeScope"),
    clearMode: formData.get("clearMode"),
    clearThreshold: formData.get("clearThreshold"),
    dailyGoal: formData.get("dailyGoal"),
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: "入力内容を確認してください。",
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
    };
  }
  const { dedupeScope, clearMode, clearThreshold, dailyGoal } = parsed.data;

  const { supabase, userId } = await requireUser();
  // RLS で本人の行だけが更新される。更新できなかった場合は 0 行になるので、返り値で確かめる。
  const { data, error } = await supabase
    .from("user_settings")
    .update({
      dedupe_scope: dedupeScope,
      clear_mode: clearMode,
      clear_threshold: clearThreshold,
      daily_goal: dailyGoal,
    })
    .eq("user_id", userId)
    .select("user_id");
  if (error || data.length === 0) {
    return {
      status: "error",
      message: "設定を保存できませんでした。時間をおいて再度お試しください。",
    };
  }

  // クリア済みは保存せず設定から都度判定するので、進捗を表示するページを作り直す。
  revalidatePath("/", "layout");
  return {
    status: "success",
    message:
      "設定を保存しました。これまでの学習結果も、新しい設定でクリア済みかどうかを判定し直しています。",
  };
}
