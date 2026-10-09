import { TopBar } from "@/components/top-bar";
import { getFamily } from "@/lib/session";

import { TextImport } from "./text-import";

export const metadata = { title: "Hendelser fra tekst" };

export default async function FromTextPage({ searchParams }: { searchParams: Promise<{ tekst?: string }> }) {
  const [{ people }, { tekst }] = await Promise.all([getFamily(), searchParams]);
  return (
    <>
      <TopBar title="Fra tekst" />
      <main className="mx-auto max-w-xl px-4 py-4">
        <p className="mb-3 text-sm text-[var(--color-muted)]">
          Lim inn en melding fra Spond, Skolemelding, e-post eller SMS — eller velg et bilde eller en PDF. AI-en
          foreslår hendelser — du sjekker og retter før noe lagres.
        </p>
        <TextImport people={people} initialText={tekst?.slice(0, 8000) ?? ""} />
      </main>
    </>
  );
}
