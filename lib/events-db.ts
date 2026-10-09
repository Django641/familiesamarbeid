import "server-only";

import { and, asc, gte, isNull, lt, or } from "drizzle-orm";

import { db } from "@/lib/db";
import { events } from "@/lib/db/schema";
import { rangeBounds } from "@/lib/events";

/** Hendelser som overlapper dagene [fromKey, toKey] (Oslo), inkludert flerdagsreiser som startet før. */
export async function eventsInRange(fromKey: string, toKey: string, limit = 500) {
  const { startIso, endIso } = rangeBounds(fromKey, toKey);
  const start = new Date(startIso);
  return db
    .select()
    .from(events)
    .where(
      and(
        lt(events.starts_at, new Date(endIso)),
        or(gte(events.ends_at, start), and(isNull(events.ends_at), gte(events.starts_at, start)))
      )
    )
    .orderBy(asc(events.starts_at))
    .limit(limit);
}
