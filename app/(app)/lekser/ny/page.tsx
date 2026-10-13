import { TopBar } from "@/components/top-bar";
import { eventsInRange } from "@/lib/events-db";
import { getFamily } from "@/lib/session";
import { addDays, osloDateKey } from "@/lib/utils";
import { mondayOf } from "@/lib/week-layout";

import { UploadFlow } from "./upload-flow";

export const metadata = { title: "Last opp ukeplan" };

export default async function UploadPlanPage({ searchParams }: { searchParams: Promise<{ uke?: string; barn?: string }> }) {
  const [{ people }, sp] = await Promise.all([getFamily(), searchParams]);
  const kids = people.filter((p) => p.kind === "barn");
  const today = osloDateKey(new Date());
  // Til dublettsjekken: hendelser for barna fra forrige uke og ti uker fram.
  const from = addDays(mondayOf(today), -7);
  const events = (await eventsInRange(from, addDays(from, 80), 500)).filter((e) => e.person_ids.some((id) => kids.some((k) => k.id === id)));
  const back = sp.barn && kids.some((k) => k.id === sp.barn) ? sp.barn : "";

  return (
    <>
      <TopBar title="Last opp ukeplan" back="/lekser" />
      <main className="mx-auto max-w-xl px-4 py-4">
        <UploadFlow kids={kids} events={events} defaultChild={back} />
      </main>
    </>
  );
}
