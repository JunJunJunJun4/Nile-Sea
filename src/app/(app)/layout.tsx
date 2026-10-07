import { AppHeader } from "@/components/app-header";

// ログイン後のページ（ダッシュボード・問題集・挑戦・復習・設定）の共通レイアウト。
// 認証の確認は proxy と各ページの requireUser で行う（レイアウトはページ遷移で再実行されないため）。
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <AppHeader />
      {children}
    </>
  );
}
