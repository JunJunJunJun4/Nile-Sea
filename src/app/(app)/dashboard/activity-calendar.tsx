"use client";

import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  ACTIVITY_LEVELS,
  activityLevel,
  correctRate,
  type DayActivity,
  formatStudyTime,
} from "@/lib/learning/activity";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

// 回答数が多い日ほど濃くする（0 = 学習なし）。
const LEVEL_CLASSES = [
  "bg-muted/60 text-muted-foreground",
  "bg-emerald-100 text-emerald-950 dark:bg-emerald-950 dark:text-emerald-100",
  "bg-emerald-300 text-emerald-950 dark:bg-emerald-800 dark:text-emerald-50",
  "bg-emerald-500 text-white dark:bg-emerald-600",
  "bg-emerald-700 text-white dark:bg-emerald-400 dark:text-emerald-950",
];

type ActivityCalendarProps = {
  // キーは "YYYY-MM-DD"（user_settings.timezone で区切った日付）。学習した日だけを入れる。
  activity: Record<string, DayActivity>;
  today: string;
};

// "YYYY-MM" の月を months だけずらす。
function shiftMonth(month: string, months: number) {
  const [y, m] = month.split("-").map(Number);
  const index = y * 12 + (m - 1) + months;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

function formatDay(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${m}月${d}日（${weekday}）`;
}

export function ActivityCalendar({ activity, today }: ActivityCalendarProps) {
  const currentMonth = today.slice(0, 7);
  const [month, setMonth] = useState(currentMonth);
  const [selected, setSelected] = useState(today);

  const [year, monthNumber] = month.split("-").map(Number);
  const firstWeekday = new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const days = Array.from(
    { length: daysInMonth },
    (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`,
  );

  const monthTotal = days.reduce(
    (sum, date) => {
      const day = activity[date];
      return day
        ? { days: sum.days + 1, answered: sum.answered + day.answered }
        : sum;
    },
    { days: 0, answered: 0 },
  );

  const selectedDay = activity[selected];
  const selectedRate = selectedDay
    ? correctRate(selectedDay.correct, selectedDay.answered)
    : null;

  function moveMonth(months: number) {
    setMonth(shiftMonth(month, months));
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon-lg"
          onClick={() => moveMonth(-1)}
          aria-label="前の月"
        >
          <ChevronLeftIcon />
        </Button>
        <div className="text-center">
          <p className="font-medium tabular-nums" aria-live="polite">
            {year}年{monthNumber}月
          </p>
          <p className="text-xs text-muted-foreground tabular-nums">
            {monthTotal.days}日学習・{monthTotal.answered}問
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon-lg"
          onClick={() => moveMonth(1)}
          disabled={month >= currentMonth}
          aria-label="次の月"
        >
          <ChevronRightIcon />
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAYS.map((weekday) => (
          <div
            key={weekday}
            className="pb-1 text-xs text-muted-foreground"
            aria-hidden
          >
            {weekday}
          </div>
        ))}
        {Array.from({ length: firstWeekday }, (_, i) => (
          <div key={`blank-${i}`} aria-hidden />
        ))}
        {days.map((date) => {
          const day = activity[date];
          const answered = day?.answered ?? 0;
          const isFuture = date > today;
          const isSelected = date === selected;
          return (
            <button
              key={date}
              type="button"
              onClick={() => setSelected(date)}
              disabled={isFuture}
              aria-pressed={isSelected}
              aria-label={`${formatDay(date)} ${answered > 0 ? `${answered}問回答` : "学習なし"}${date === today ? "（今日）" : ""}`}
              className={cn(
                "flex aspect-square min-h-9 flex-col items-center justify-center rounded-md text-sm tabular-nums transition-shadow outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                LEVEL_CLASSES[activityLevel(answered)],
                isFuture && "bg-transparent text-muted-foreground/50",
                date === today && "font-semibold underline underline-offset-2",
                isSelected && "ring-2 ring-foreground ring-offset-1",
              )}
            >
              {Number(date.slice(8))}
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-end gap-1 text-xs text-muted-foreground">
        <span>少ない</span>
        {LEVEL_CLASSES.map((className, level) => (
          <span
            key={className}
            className={cn("size-3.5 rounded-sm", className)}
            title={level === 0 ? "学習なし" : ACTIVITY_LEVELS[level - 1].label}
            aria-hidden
          />
        ))}
        <span>多い</span>
        <span className="sr-only">
          色の濃さは回答数を表します（
          {ACTIVITY_LEVELS.map((l) => l.label).join("、")}）
        </span>
      </div>

      <div className="rounded-lg bg-muted/50 p-3" aria-live="polite">
        <p className="mb-2 text-sm font-medium">
          {formatDay(selected)}
          {selected === today && "・今日"}
        </p>
        {selectedDay ? (
          <dl className="grid grid-cols-3 gap-2 text-center">
            <div>
              <dt className="text-xs text-muted-foreground">回答数</dt>
              <dd className="font-semibold tabular-nums">
                {selectedDay.answered}問
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">正解数</dt>
              <dd className="font-semibold tabular-nums">
                {selectedDay.correct}問
                {selectedRate !== null && (
                  <span className="ml-1 text-xs font-normal text-muted-foreground">
                    （{selectedRate}%）
                  </span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">学習時間</dt>
              <dd className="font-semibold tabular-nums">
                {formatStudyTime(selectedDay.seconds)}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">
            この日は学習していません。
          </p>
        )}
      </div>
    </div>
  );
}
