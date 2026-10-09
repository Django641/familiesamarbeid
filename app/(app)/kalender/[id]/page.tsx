import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { z } from "zod";

import { TopBar } from "@/components/top-bar";
import { db } from "@/lib/db";
import { events } from "@/lib/db/schema";
import { draftFromEvent } from "@/lib/event-draft";
import { getFamily } from "@/lib/session";

import { EventForm } from "../event-form";

export const metadata = { title: "Hendelse" };

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, { people }] = await Promise.all([params, getFamily()]);
  if (!z.uuid().safeParse(id).success) notFound();
  const [event] = await db.select().from(events).where(eq(events.id, id));
  if (!event) notFound();

  return (
    <>
      <TopBar title="Rediger hendelse" back="/kalender" />
      <main className="mx-auto max-w-xl px-4 py-4">
        <EventForm people={people} initial={draftFromEvent(event)} event={event} />
      </main>
    </>
  );
}
