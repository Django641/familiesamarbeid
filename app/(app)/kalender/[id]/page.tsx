import { notFound } from "next/navigation";
import { MapPin, RefreshCw } from "lucide-react";

import { PersonDots } from "@/components/person-dots";
import { TopBar } from "@/components/top-bar";
import { Card, CardContent } from "@/components/ui/card";
import { categoryMeta } from "@/lib/config";
import { eventEndKey } from "@/lib/events";
import { getHousehold } from "@/lib/household";
import { createClient } from "@/lib/supabase/server";
import type { CalendarEvent } from "@/lib/types";
import { dayLabel, osloDateKey, osloTime } from "@/lib/utils";

import { draftFromEvent } from "@/lib/event-draft";

import { EventForm } from "../event-form";

export const metadata = { title: "Hendelse" };

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, { household, people }, supabase] = await Promise.all([params, getHousehold(), createClient()]);
  const { data } = await supabase.from("events").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const event = data as CalendarEvent;

  // Importerte hendelser (Spond/skole via ICS) eies av kilden — vis bare.
  if (event.source === "ics") {
    const startKey = osloDateKey(event.starts_at);
    const endKey = eventEndKey(event);
    const meta = categoryMeta(event.category);
    return (
      <>
        <TopBar title="Hendelse" />
        <main className="mx-auto max-w-xl px-4 py-4">
          <Card>
            <CardContent className="flex flex-col gap-2 p-4">
              <p className="text-sm text-[var(--color-muted)]">
                {meta.emoji} {meta.label}
              </p>
              <h2 className="text-xl font-semibold">{event.title}</h2>
              <p className="text-sm">
                {dayLabel(startKey)}
                {event.all_day ? "" : ` kl. ${osloTime(event.starts_at)}`}
                {endKey !== startKey ? ` – ${dayLabel(endKey)}` : ""}
                {!event.all_day && event.ends_at ? ` til ${osloTime(event.ends_at)}` : ""}
              </p>
              {event.location ? (
                <p className="flex items-center gap-1 text-sm">
                  <MapPin className="h-4 w-4" aria-hidden /> {event.location}
                </p>
              ) : null}
              {event.description ? (
                <p className="whitespace-pre-wrap text-sm text-[var(--color-muted)]">{event.description}</p>
              ) : null}
              <PersonDots people={people} ids={event.person_ids} />
              <p className="mt-2 flex items-center gap-1 text-xs text-[var(--color-muted)]">
                <RefreshCw className="h-3 w-3" aria-hidden /> Importert fra en abonnert kalender. Endres i kilden.
              </p>
            </CardContent>
          </Card>
        </main>
      </>
    );
  }

  return (
    <>
      <TopBar title="Rediger hendelse" />
      <main className="mx-auto max-w-xl px-4 py-4">
        <EventForm householdId={household.id} people={people} initial={draftFromEvent(event)} event={event} />
      </main>
    </>
  );
}
