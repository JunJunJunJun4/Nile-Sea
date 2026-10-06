"use client";

import { CircleCheckIcon } from "lucide-react";
import { useActionState, useState } from "react";

import { updateSettings } from "@/app/(app)/settings/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { SettingsFormState } from "@/lib/schemas/settings";
import {
  CLEAR_MODES,
  CLEAR_THRESHOLD_MAX,
  CLEAR_THRESHOLD_MIN,
  DAILY_GOAL_MAX,
  DEDUPE_SCOPES,
  clearModeOptions,
  dedupeScopeOptions,
  describeSettings,
  isClearMode,
  isDedupeScope,
  type LearningSettings,
} from "@/lib/settings";

type SettingsFormProps = {
  initial: LearningSettings & { dailyGoal: number | null };
};

const thresholds = Array.from(
  { length: CLEAR_THRESHOLD_MAX - CLEAR_THRESHOLD_MIN + 1 },
  (_, i) => CLEAR_THRESHOLD_MIN + i,
);

const optionClassName =
  "min-h-12 cursor-pointer items-start gap-3 rounded-lg border p-3 font-normal transition-colors has-data-checked:border-primary has-data-checked:bg-muted/50";

export function SettingsForm({ initial }: SettingsFormProps) {
  const [state, formAction, pending] = useActionState<
    SettingsFormState,
    FormData
  >(updateSettings, {});
  const [dedupeScope, setDedupeScope] = useState(initial.dedupeScope);
  const [clearMode, setClearMode] = useState(initial.clearMode);
  const [clearThreshold, setClearThreshold] = useState(initial.clearThreshold);
  // フォームの action は送信後に入力欄をリセットするので、入力値は state で持つ。
  const [dailyGoal, setDailyGoal] = useState(
    initial.dailyGoal === null ? "" : String(initial.dailyGoal),
  );

  const draft = { dedupeScope, clearMode, clearThreshold };
  const changed =
    dedupeScope !== initial.dedupeScope ||
    clearMode !== initial.clearMode ||
    clearThreshold !== initial.clearThreshold;
  const errors = state.fieldErrors;

  return (
    <form action={formAction} className="flex flex-col gap-6" noValidate>
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-3 font-semibold">重複の判定範囲</legend>
        <p className="text-sm text-muted-foreground">
          別の問題集で解いた結果を、どこまで「クリア済み」として引き継ぐかを選びます。
        </p>
        <RadioGroup
          name="dedupeScope"
          aria-label="重複の判定範囲"
          value={dedupeScope}
          onValueChange={(value) => {
            if (typeof value === "string" && isDedupeScope(value)) {
              setDedupeScope(value);
            }
          }}
        >
          {DEDUPE_SCOPES.map((scope) => (
            <Label key={scope} className={optionClassName}>
              <RadioGroupItem value={scope} className="mt-0.5" />
              <span className="flex flex-1 flex-col gap-1">
                <span className="font-medium">
                  {dedupeScopeOptions[scope].label}
                </span>
                <span className="leading-snug text-muted-foreground">
                  {dedupeScopeOptions[scope].description}
                </span>
              </span>
            </Label>
          ))}
        </RadioGroup>
        <FieldError messages={errors?.dedupeScope} />
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-3 font-semibold">クリア条件の数え方</legend>
        <RadioGroup
          name="clearMode"
          aria-label="クリア条件の数え方"
          value={clearMode}
          onValueChange={(value) => {
            if (typeof value === "string" && isClearMode(value)) {
              setClearMode(value);
            }
          }}
          className="sm:grid-cols-2"
        >
          {CLEAR_MODES.map((mode) => (
            <Label key={mode} className={optionClassName}>
              <RadioGroupItem value={mode} className="mt-0.5" />
              <span className="flex flex-1 flex-col gap-1">
                <span className="font-medium">
                  {clearModeOptions[mode].label}
                </span>
                <span className="leading-snug text-muted-foreground">
                  {clearModeOptions[mode].description}
                </span>
              </span>
            </Label>
          ))}
        </RadioGroup>
        <FieldError messages={errors?.clearMode} />
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-3 font-semibold">クリアに必要な回数</legend>
        <RadioGroup
          name="clearThreshold"
          aria-label="クリアに必要な回数"
          value={String(clearThreshold)}
          onValueChange={(value) => setClearThreshold(Number(value))}
          className="grid-cols-5 sm:grid-cols-10"
        >
          {thresholds.map((n) => (
            <Label
              key={n}
              className="relative min-h-11 cursor-pointer justify-center rounded-lg border tabular-nums transition-colors has-focus-visible:ring-3 has-focus-visible:ring-ring/50 has-data-checked:border-primary has-data-checked:bg-primary has-data-checked:text-primary-foreground"
            >
              <RadioGroupItem
                value={String(n)}
                aria-label={`${n}回`}
                className="sr-only"
              />
              {n}回
            </Label>
          ))}
        </RadioGroup>
        <FieldError messages={errors?.clearThreshold} />
      </fieldset>

      <div className="flex flex-col gap-2">
        <Label htmlFor="dailyGoal" className="font-semibold">
          1日の目標問題数
          <span className="font-normal text-muted-foreground">（任意）</span>
        </Label>
        <div className="flex items-center gap-2">
          <Input
            id="dailyGoal"
            name="dailyGoal"
            type="number"
            inputMode="numeric"
            min={1}
            max={DAILY_GOAL_MAX}
            step={1}
            placeholder="例：20"
            value={dailyGoal}
            onChange={(event) => setDailyGoal(event.target.value)}
            aria-invalid={errors?.dailyGoal ? true : undefined}
            aria-describedby="dailyGoal-help"
            className="w-28"
          />
          <span className="text-sm">問</span>
        </div>
        <p id="dailyGoal-help" className="text-sm text-muted-foreground">
          空欄にすると目標なしになります（1〜{DAILY_GOAL_MAX}問）。
        </p>
        <FieldError messages={errors?.dailyGoal} />
      </div>

      <div className="flex flex-col gap-3">
        <div className="rounded-lg bg-muted/50 p-3 text-sm" aria-live="polite">
          <p className="text-muted-foreground">
            {changed ? "保存すると" : "現在の設定"}
          </p>
          <p className="font-medium">{describeSettings(draft)}</p>
        </div>

        {state.message && (
          <Alert
            variant={state.status === "error" ? "destructive" : "default"}
            role={state.status === "error" ? "alert" : "status"}
          >
            {state.status === "success" && <CircleCheckIcon />}
            <AlertDescription>{state.message}</AlertDescription>
          </Alert>
        )}

        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending ? "保存中…" : "保存する"}
        </Button>
      </div>
    </form>
  );
}

function FieldError({ messages }: { messages?: string[] }) {
  if (!messages?.[0]) return null;
  return <p className="text-sm text-destructive">{messages[0]}</p>;
}
