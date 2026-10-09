import { TopBar } from "@/components/top-bar";
import { getHousehold } from "@/lib/household";

import { emptyDraft } from "@/lib/event-draft";

import { EventForm } from "../event-form";

export const metadata = { title: "Ny hendelse" };

export default async function NewEventPage({ searchParams }: { searchParams: Promise<{ dato?: string }> }) {
  const [{ household, people }, { dato }] = await Promise.all([getHousehold(), searchParams]);
  const date = dato && /^\d{4}-\d{2}-\d{2}$/.test(dato) ? dato : undefined;
  return (
    <>
      <TopBar title="Ny hendelse" />
      <main className="mx-auto max-w-xl px-4 py-4">
        <EventForm householdId={household.id} people={people} initial={emptyDraft(date)} />
      </main>
    </>
  );
}
