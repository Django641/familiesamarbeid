import { TopBar } from "@/components/top-bar";
import { getHousehold } from "@/lib/household";

import { TextImport } from "./text-import";

export const metadata = { title: "Hendelser fra tekst" };

export default async function FromTextPage() {
  const { household, people } = await getHousehold();
  return (
    <>
      <TopBar title="Fra tekst" />
      <main className="mx-auto max-w-xl px-4 py-4">
        <p className="mb-3 text-sm text-[var(--color-muted)]">
          Lim inn en melding fra Spond, Skolemelding, e-post eller SMS. AI-en foreslår hendelser — du sjekker og
          retter før noe lagres.
        </p>
        <TextImport householdId={household.id} people={people} />
      </main>
    </>
  );
}
