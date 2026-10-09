import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { sync_state } from "@/lib/db/schema";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

// Live-synk: telefonene spør her hvert 5. sekund mens appen er åpen.
// Svarer med en teller som databasetriggere øker ved hver endring.
export async function GET() {
  if (!(await getSession())) return NextResponse.json({ error: "Ikke innlogget" }, { status: 401 });
  const [row] = await db.select({ version: sync_state.version }).from(sync_state).where(eq(sync_state.id, 1));
  return NextResponse.json({ version: row?.version ?? 0 }, { headers: { "Cache-Control": "no-store" } });
}
