"use client";

import { useActionState } from "react";

import { startAttempt, type StartAttemptState } from "@/app/(app)/sets/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

export function StartAttemptForm({ questionSetId }: { questionSetId: string }) {
  const [state, formAction, pending] = useActionState<
    StartAttemptState,
    FormData
  >(startAttempt, {});

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="questionSetId" value={questionSetId} />
      <Label className="min-h-6 font-normal">
        <Checkbox name="includeCleared" />
        クリア済みの問題も出題する
      </Label>
      {state.message && (
        <Alert variant="destructive">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "準備中…" : "挑戦する"}
      </Button>
    </form>
  );
}
