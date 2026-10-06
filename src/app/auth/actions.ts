"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import {
  loginSchema,
  signupSchema,
  type AuthFormState,
} from "@/lib/schemas/auth";
import { createClient } from "@/lib/supabase/server";

function toFormValues(formData: FormData) {
  return {
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
  };
}

// ローカル・Vercel のプレビュー・本番のどれでも、アクセス中のオリジンを返す。
// Server Action は Origin と Host（または X-Forwarded-Host）が一致しないと
// Next.js に拒否されるので、ここで読むホストは実際にアクセスされたものになる。
async function getRequestOrigin() {
  const headersList = await headers();
  const host = headersList.get("x-forwarded-host") ?? headersList.get("host");
  const proto =
    headersList.get("x-forwarded-proto")?.split(",")[0].trim() ??
    (host?.startsWith("localhost") || host?.startsWith("127.0.0.1")
      ? "http"
      : "https");
  return `${proto}://${host}`;
}

function toErrorMessage(code: string | undefined) {
  switch (code) {
    case "invalid_credentials":
      return "メールアドレスまたはパスワードが正しくありません。";
    case "email_not_confirmed":
      return "メールアドレスの確認が完了していません。確認メールのリンクを開いてください。";
    case "user_already_exists":
    case "email_exists":
      return "このメールアドレスはすでに登録されています。";
    case "weak_password":
      return "パスワードが弱すぎます。別のパスワードを入力してください。";
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return "リクエストが多すぎます。しばらく待ってから再度お試しください。";
    default:
      return "エラーが発生しました。時間をおいて再度お試しください。";
  }
}

export async function login(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const values = toFormValues(formData);
  const parsed = loginSchema.safeParse(values);
  if (!parsed.success) {
    return {
      status: "error",
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
      email: values.email,
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    return {
      status: "error",
      message: toErrorMessage(error.code),
      email: values.email,
    };
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function signup(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const values = toFormValues(formData);
  const parsed = signupSchema.safeParse(values);
  if (!parsed.success) {
    return {
      status: "error",
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
      email: values.email,
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    ...parsed.data,
    options: {
      emailRedirectTo: `${await getRequestOrigin()}/auth/callback?next=/dashboard`,
    },
  });
  if (error) {
    return {
      status: "error",
      message: toErrorMessage(error.code),
      email: values.email,
    };
  }

  // メール確認が無効な場合はその場でセッションが発行される。
  if (data.session) {
    revalidatePath("/", "layout");
    redirect("/dashboard");
  }

  return {
    status: "success",
    message:
      "確認メールを送信しました。メール内のリンクを開いて登録を完了してください。",
  };
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();

  revalidatePath("/", "layout");
  redirect("/login");
}
