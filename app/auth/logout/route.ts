import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  // 303 så nettleseren gjør GET mot /login etter POST.
  return NextResponse.redirect(new URL("/login", request.url), 303);
}
