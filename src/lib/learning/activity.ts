// 学習記録（daily_activity）の日付の計算と表示。サーバーとクライアント（カレンダー）の両方から使う。
// 日付は daily_activity.activity_date と同じく、user_settings.timezone で区切った "YYYY-MM-DD" の文字列で扱う。

export type DayActivity = {
  answered: number;
  correct: number;
  seconds: number;
};

// そのタイムゾーンでの今日の日付（"YYYY-MM-DD"）。en-CA は日付を YYYY-MM-DD で書式化する。
export function todayIn(timeZone: string, now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

// "YYYY-MM-DD" を UTC の 0 時として扱い、タイムゾーンの影響を受けずに日付だけを計算する。
function toUtc(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUtc(time: number) {
  return new Date(time).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number) {
  return fromUtc(toUtc(date) + days * 86_400_000);
}

// 学習した日（回答数が1以上の日）から、連続学習日数を計算する。
// current: 今日まで、または昨日まで途切れずに続いている日数（今日まだ解いていなくても途切れない）。
// longest: これまでの最長。
export function computeStreaks(studiedDates: Iterable<string>, today: string) {
  const dates = new Set(studiedDates);

  let current = 0;
  let day = dates.has(today) ? today : addDays(today, -1);
  while (dates.has(day)) {
    current += 1;
    day = addDays(day, -1);
  }

  let longest = 0;
  let run = 0;
  let previous: string | null = null;
  for (const date of [...dates].sort()) {
    run = previous !== null && addDays(previous, 1) === date ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = date;
  }

  return { current, longest };
}

// 例：「1時間5分」「12分」「1分未満」「0分」
export function formatStudyTime(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0)
    return minutes > 0 ? `${hours}時間${minutes}分` : `${hours}時間`;
  if (minutes > 0) return `${minutes}分`;
  return seconds > 0 ? "1分未満" : "0分";
}

// 正答率（%、整数）。回答がなければ null。
export function correctRate(correct: number, answered: number) {
  return answered > 0 ? Math.round((correct / answered) * 100) : null;
}

// カレンダーの色の濃さ（0 = 学習なし、1〜4 = 回答数が多いほど濃い）。
export const ACTIVITY_LEVELS = [
  { min: 1, label: "1〜9問" },
  { min: 10, label: "10〜29問" },
  { min: 30, label: "30〜59問" },
  { min: 60, label: "60問以上" },
] as const;

export function activityLevel(answered: number) {
  let level = 0;
  ACTIVITY_LEVELS.forEach(({ min }, i) => {
    if (answered >= min) level = i + 1;
  });
  return level;
}
