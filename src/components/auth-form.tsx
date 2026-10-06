"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { AuthFormState } from "@/lib/schemas/auth";

type AuthFormProps = {
  mode: "login" | "signup";
  action: (
    prevState: AuthFormState,
    formData: FormData,
  ) => Promise<AuthFormState>;
  initialMessage?: string;
};

const copy = {
  login: {
    title: "ログイン",
    description: "メールアドレスとパスワードを入力してください。",
    submit: "ログイン",
    pending: "ログイン中…",
    passwordAutoComplete: "current-password",
    switchText: "アカウントをお持ちでない方は",
    switchLink: "新規登録",
    switchHref: "/signup",
  },
  signup: {
    title: "新規登録",
    description: "メールアドレスとパスワードを設定してください。",
    submit: "登録する",
    pending: "登録中…",
    passwordAutoComplete: "new-password",
    switchText: "すでにアカウントをお持ちの方は",
    switchLink: "ログイン",
    switchHref: "/login",
  },
} as const;

export function AuthForm({ mode, action, initialMessage }: AuthFormProps) {
  const [state, formAction, pending] = useActionState(action, {
    status: initialMessage ? "error" : undefined,
    message: initialMessage,
  });
  const t = copy[mode];
  const emailError = state.fieldErrors?.email?.[0];
  const passwordError = state.fieldErrors?.password?.[0];

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>{t.title}</CardTitle>
        <CardDescription>{t.description}</CardDescription>
      </CardHeader>
      <form action={formAction} noValidate>
        <CardContent className="flex flex-col gap-4">
          {state.message && (
            <p
              role={state.status === "error" ? "alert" : "status"}
              className={
                state.status === "error"
                  ? "text-sm text-destructive"
                  : "text-sm text-muted-foreground"
              }
            >
              {state.message}
            </p>
          )}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-sm font-medium">
              メールアドレス
            </label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              defaultValue={state.email}
              aria-invalid={emailError ? true : undefined}
              aria-describedby={emailError ? "email-error" : undefined}
              required
            />
            {emailError && (
              <p id="email-error" className="text-sm text-destructive">
                {emailError}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-sm font-medium">
              パスワード
            </label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete={t.passwordAutoComplete}
              aria-invalid={passwordError ? true : undefined}
              aria-describedby={passwordError ? "password-error" : undefined}
              required
            />
            {passwordError && (
              <p id="password-error" className="text-sm text-destructive">
                {passwordError}
              </p>
            )}
          </div>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? t.pending : t.submit}
          </Button>
        </CardContent>
        <CardFooter className="mt-4 justify-center text-muted-foreground">
          {t.switchText}
          <Link
            href={t.switchHref}
            className="ml-1 text-foreground underline underline-offset-4"
          >
            {t.switchLink}
          </Link>
        </CardFooter>
      </form>
    </Card>
  );
}
