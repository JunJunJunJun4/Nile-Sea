import type { Metadata } from "next";

import { login } from "@/app/auth/actions";
import { AuthForm } from "@/components/auth-form";

export const metadata: Metadata = { title: "ログイン" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error } = await searchParams;
  const initialMessage =
    error === "confirm"
      ? "確認リンクを開けませんでした。メールアドレスの確認は完了している場合があるので、ログインをお試しください。"
      : undefined;

  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <AuthForm mode="login" action={login} initialMessage={initialMessage} />
    </main>
  );
}
