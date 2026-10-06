"use client";

import { CircleCheckIcon, CircleXIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import {
  submitAnswer,
  type SubmitAnswerResult,
} from "@/app/(app)/attempts/actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";

type Choice = { id: string; position: number; body: string };
type Feedback = Extract<SubmitAnswerResult, { ok: true }>;

type QuestionFormProps = {
  attemptId: string;
  questionId: string;
  questionNumber: number;
  body: string;
  choices: Choice[];
};

export function QuestionForm({
  attemptId,
  questionId,
  questionNumber,
  body,
  choices,
}: QuestionFormProps) {
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, startSubmit] = useTransition();
  const [navigating, startNavigate] = useTransition();
  const startedAt = useRef<number | null>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    startedAt.current = performance.now();
  }, []);

  useEffect(() => {
    if (feedback) feedbackRef.current?.focus();
  }, [feedback]);

  const answered = feedback !== null;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) {
      setError("選択肢を選んでください。");
      return;
    }
    setError(null);
    const timeMs =
      startedAt.current === null
        ? null
        : Math.round(performance.now() - startedAt.current);

    startSubmit(async () => {
      const result = await submitAnswer({
        attemptId,
        questionId,
        choiceId: selected,
        timeMs,
      });
      if (result.ok) {
        setFeedback(result);
      } else {
        setError(result.message);
      }
    });
  }

  function handleNext() {
    startNavigate(() => {
      if (feedback?.completed) {
        router.push(`/attempts/${attemptId}/result`);
      } else {
        // サーバー側で次の未回答の問題を決め直す。
        router.refresh();
      }
    });
  }

  const correctChoice = choices.find((c) => c.id === feedback?.correctChoiceId);

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-normal text-muted-foreground">
            第{questionNumber}問
          </CardTitle>
          <p className="text-base font-medium whitespace-pre-wrap">{body}</p>
        </CardHeader>
        <CardContent>
          <RadioGroup
            aria-label="選択肢"
            value={selected}
            onValueChange={(value) => {
              setSelected(value as string);
              setError(null);
            }}
            disabled={answered || submitting}
          >
            {choices.map((choice) => {
              const isCorrect =
                answered && choice.id === feedback.correctChoiceId;
              const isWrongPick =
                answered && choice.id === selected && !feedback.isCorrect;
              return (
                <Label
                  key={choice.id}
                  className={cn(
                    "min-h-12 cursor-pointer items-center gap-3 rounded-lg border p-3 text-base leading-snug font-normal transition-colors",
                    "has-data-checked:border-primary has-data-checked:bg-muted/50",
                    answered && "cursor-default",
                    isCorrect &&
                      "border-emerald-600 bg-emerald-50 has-data-checked:border-emerald-600 has-data-checked:bg-emerald-50 dark:border-emerald-500 dark:bg-emerald-950/40 dark:has-data-checked:bg-emerald-950/40",
                    isWrongPick &&
                      "border-destructive bg-destructive/10 has-data-checked:border-destructive has-data-checked:bg-destructive/10",
                  )}
                >
                  <RadioGroupItem value={choice.id} />
                  <span className="flex-1">{choice.body}</span>
                  {isCorrect && (
                    <Badge className="bg-emerald-600 text-white">正解</Badge>
                  )}
                  {isWrongPick && (
                    <Badge variant="destructive">あなたの回答</Badge>
                  )}
                </Label>
              );
            })}
          </RadioGroup>
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {feedback && (
        <div
          ref={feedbackRef}
          tabIndex={-1}
          className="flex flex-col gap-3 outline-none"
        >
          <Alert
            className={
              feedback.isCorrect
                ? "border-emerald-600 text-emerald-700 dark:border-emerald-500 dark:text-emerald-400"
                : "border-destructive text-destructive"
            }
          >
            {feedback.isCorrect ? <CircleCheckIcon /> : <CircleXIcon />}
            <AlertTitle className="text-base">
              {feedback.isCorrect ? "正解！" : "不正解"}
            </AlertTitle>
            {!feedback.isCorrect && correctChoice && (
              <AlertDescription className="text-foreground">
                正解：{correctChoice.body}
              </AlertDescription>
            )}
          </Alert>
          {feedback.explanation && (
            <div className="rounded-lg bg-muted/50 p-3 text-sm">
              <p className="mb-1 font-medium">解説</p>
              <p className="whitespace-pre-wrap text-muted-foreground">
                {feedback.explanation}
              </p>
            </div>
          )}
        </div>
      )}

      {answered ? (
        <Button
          type="button"
          size="lg"
          className="w-full"
          onClick={handleNext}
          disabled={navigating}
        >
          {navigating
            ? "読み込み中…"
            : feedback.completed
              ? "結果を見る"
              : "次の問題へ"}
        </Button>
      ) : (
        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={submitting || !selected}
        >
          {submitting ? "採点中…" : "回答する"}
        </Button>
      )}
    </form>
  );
}
