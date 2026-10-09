import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const rawNext = url.searchParams.get("next") ?? "/hjem";
  // Bare relative stier — hindrer åpen redirect til andre domener.
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/hjem";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(next, url.origin));
    }
  }

  return NextResponse.redirect(
    new URL(`/login?message=${encodeURIComponent("Innlogging feilet. Prøv igjen.")}`, url.origin)
  );
}
