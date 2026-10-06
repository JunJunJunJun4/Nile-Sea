import type { Metadata } from "next";

import { signup } from "@/app/auth/actions";
import { AuthForm } from "@/components/auth-form";

export const metadata: Metadata = { title: "新規登録" };

export default function SignupPage() {
  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <AuthForm mode="signup" action={signup} />
    </main>
  );
}
