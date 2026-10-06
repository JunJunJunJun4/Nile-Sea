import type { Metadata } from "next";

import { login } from "@/app/auth/actions";
import { AuthForm } from "@/components/auth-form";

export const metadata: Metadata = { title: "ログイン" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error } = await searchParams;
  const initialMessage =
    error === "confirm"
      ? "メールアドレスの確認に失敗しました。リンクの有効期限が切れている可能性があります。"
      : undefined;

  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <AuthForm mode="login" action={login} initialMessage={initialMessage} />
    </main>
  );
}
