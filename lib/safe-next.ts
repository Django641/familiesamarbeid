/**
 * Godtar bare relative stier i samme app som «next»-mål etter innlogging.
 * Avviser «//evil.com», «/\evil.com», kontrolltegn og alt som peker til et annet origin.
 */
export function safeNext(next: string | null | undefined, fallback = "/hjem"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return fallback;
  if (/[\\\u0000-\u001f\u007f]/.test(next) || /%(?:5c|0[0-9a-f]|1[0-9a-f]|7f)/i.test(next)) return fallback;
  try {
    const base = "https://app.invalid";
    const url = new URL(next, base);
    return url.origin === base ? `${url.pathname}${url.search}${url.hash}` : fallback;
  } catch {
    return fallback;
  }
}
