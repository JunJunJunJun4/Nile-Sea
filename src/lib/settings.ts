// user_settings の選択肢と、画面に出す文言（docs/db-design.md「ユーザーが選べる設定と判定方法」）。
// サーバーとクライアントの両方から使う。

export const DEDUPE_SCOPES = ["set", "question", "knowledge"] as const;
export const CLEAR_MODES = ["consecutive", "cumulative"] as const;
export const CLEAR_THRESHOLD_MIN = 1;
export const CLEAR_THRESHOLD_MAX = 10;
export const DAILY_GOAL_MAX = 1000;

export type DedupeScope = (typeof DEDUPE_SCOPES)[number];
export type ClearMode = (typeof CLEAR_MODES)[number];

export type LearningSettings = {
  dedupeScope: DedupeScope;
  clearMode: ClearMode;
  clearThreshold: number;
};

export const dedupeScopeOptions: Record<
  DedupeScope,
  { label: string; description: string; subject: string; badge: string }
> = {
  set: {
    label: "問題集ごとに独立",
    description:
      "他の問題集で解いた結果は引き継ぎません。問題集ごとに最初からやり切りたい人、基礎を固めたい人に。",
    subject: "問題集ごとに各問題を",
    badge: "問題集ごとに独立した設定",
  },
  question: {
    label: "同じ問題を省く",
    description:
      "別の問題集で解いた同じ問題（問題文も選択肢も同じ）はクリア済みとして省きます。聞き方の違う問題は解いておきたい人に。",
    subject: "同じ問題を",
    badge: "同じ問題を省く設定",
  },
  knowledge: {
    label: "同じ知識を省く",
    description:
      "問題文が違っても、同じ単語・概念を問う問題はクリア済みとして省きます。まだ身についていない項目だけを解きたい人に。",
    subject: "同じ知識を",
    badge: "同じ知識を省く設定",
  },
};

export const clearModeOptions: Record<
  ClearMode,
  { label: string; description: string; prefix: string }
> = {
  consecutive: {
    label: "連続正解",
    prefix: "連続",
    description: "間違えると回数が 0 に戻ります。定着を重視したい人に。",
  },
  cumulative: {
    label: "累計正解",
    prefix: "累計",
    description: "途中で間違えても回数は減りません。まず一通り終えたい人に。",
  },
};

export function isDedupeScope(value: string): value is DedupeScope {
  return (DEDUPE_SCOPES as readonly string[]).includes(value);
}

export function isClearMode(value: string): value is ClearMode {
  return (CLEAR_MODES as readonly string[]).includes(value);
}

// DB の値（text）を型付きの設定にする。CHECK 制約があるので通常は既定値に落ちない。
export function toLearningSettings(row: {
  dedupe_scope: string;
  clear_mode: string;
  clear_threshold: number;
}): LearningSettings {
  return {
    dedupeScope: isDedupeScope(row.dedupe_scope)
      ? row.dedupe_scope
      : "question",
    clearMode: isClearMode(row.clear_mode) ? row.clear_mode : "consecutive",
    clearThreshold: row.clear_threshold,
  };
}

// 例：「同じ問題を、連続2回正解でクリアとみなします」
export function describeSettings({
  dedupeScope,
  clearMode,
  clearThreshold,
}: LearningSettings) {
  const condition =
    clearThreshold === 1
      ? "1回正解"
      : `${clearModeOptions[clearMode].prefix}${clearThreshold}回正解`;
  return `${dedupeScopeOptions[dedupeScope].subject}、${condition}でクリアとみなします`;
}
