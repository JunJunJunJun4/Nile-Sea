// オープンリダイレクトを防ぐため、同一サイト内の相対パスのみ許可する。
// "//evil.com" や "/\evil.com"（ブラウザは "\" を "/" とみなす）は外部 URL になるので弾く。
export function safeNextPath(next: string | null, fallback = "/dashboard") {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return fallback;
  if (next.includes("\\")) return fallback;
  return next;
}
