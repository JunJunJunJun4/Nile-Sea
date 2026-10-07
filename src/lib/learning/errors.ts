// DB の関数（start_attempt / submit_answer など）が返すエラーを、画面に出す日本語のメッセージにする。
// 関数は message に識別子、details に日本語の説明を入れて返す（docs/db-design.md「関数の共通方針」）。

type RpcError = { message?: string } | null | undefined;

const DEFAULT_MESSAGE =
  "エラーが発生しました。時間をおいて再度お試しください。";

const messages: Record<string, string> = {
  not_authenticated: "ログインが必要です。もう一度ログインしてください。",
  user_not_active: "このアカウントは現在利用できません。お問い合わせください。",
  question_set_not_accessible:
    "この問題集は有料プランで利用できます。現在のプランでは挑戦できません。",
  question_set_not_found: "問題集が見つかりません。",
  daily_limit_reached:
    "今日解ける問題数の上限に達しました。明日また挑戦してください（有料プランなら上限はありません）。",
  attempt_not_found: "この挑戦が見つかりません。",
  attempt_completed: "この挑戦はすでに終了しています。",
  attempt_expired: "制限時間を過ぎたため、回答できません。",
  question_not_in_attempt:
    "この問題には回答できません。ページを再読み込みして、続きから再開してください。",
  already_answered:
    "この問題にはすでに回答しています。ページを再読み込みして、続きから再開してください。",
  question_not_found: "問題が見つかりません。",
  choice_required: "選択肢を選んでください。",
  invalid_choice:
    "この問題の選択肢ではありません。ページを再読み込みしてください。",
  unsupported_format: "この形式の問題には、まだ対応していません。",
  unsupported_mode: "この出題モードには、まだ対応していません。",
  question_set_required: "問題集を選んでください。",
  no_questions: "出題できる問題がありません。",
  user_settings_not_found:
    "ユーザー設定が見つかりません。時間をおいて再度お試しください。",
};

export function toLearningErrorMessage(
  error: RpcError,
  overrides: Record<string, string> = {},
) {
  const code = error?.message;
  if (!code) return DEFAULT_MESSAGE;
  return overrides[code] ?? messages[code] ?? DEFAULT_MESSAGE;
}
