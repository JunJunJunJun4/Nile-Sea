import { z } from "zod";

const email = z
  .string()
  .trim()
  .min(1, { error: "メールアドレスを入力してください" })
  .pipe(z.email({ error: "メールアドレスの形式が正しくありません" }));

export const loginSchema = z.object({
  email,
  password: z.string().min(1, { error: "パスワードを入力してください" }),
});

export const signupSchema = z.object({
  email,
  password: z
    .string()
    .min(8, { error: "パスワードは8文字以上で入力してください" })
    .max(72, { error: "パスワードは72文字以内で入力してください" }),
});

export type AuthFormState = {
  message?: string;
  status?: "error" | "success";
  fieldErrors?: { email?: string[]; password?: string[] };
  email?: string;
};
