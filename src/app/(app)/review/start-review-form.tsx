"use client";

import { RotateCcwIcon } from "lucide-react";
import { useActionState } from "react";

import { startReview, type StartReviewState } from "@/app/(app)/review/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

type StartReviewFormProps = {
  // 省くと、問題集をまたいで復習する。
  questionSetId?: string;
  label: string;
  variant?: "default" | "outline";
};

export function StartReviewForm({
  questionSetId,
  label,
  variant = "default",
}: StartReviewFormProps) {
  const [state, formAction, pending] = useActionState<
    StartReviewState,
    FormData
  >(startReview, {});

  return (
    <form action={formAction} className="flex flex-col gap-3">
      {questionSetId && (
        <input type="hidden" name="questionSetId" value={questionSetId} />
      )}
      {state.message && (
        <Alert variant="destructive">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}
      <Button
        type="submit"
        variant={variant}
        size="lg"
        className="w-full"
        disabled={pending}
      >
        <RotateCcwIcon data-icon="inline-start" />
        {pending ? "準備中…" : label}
      </Button>
    </form>
  );
}
