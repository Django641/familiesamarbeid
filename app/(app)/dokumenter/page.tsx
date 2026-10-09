import { TopBar } from "@/components/top-bar";
import { getHousehold } from "@/lib/household";
import { createClient } from "@/lib/supabase/server";
import type { DocumentRow } from "@/lib/types";

import { DocumentList } from "./document-list";

export const metadata = { title: "Dokumenter" };

export default async function DocumentsPage() {
  const [{ household }, supabase] = await Promise.all([getHousehold(), createClient()]);
  const { data } = await supabase
    .from("documents")
    .select("*")
    .eq("household_id", household.id)
    .order("created_at", { ascending: false })
    .limit(300);

  return (
    <>
      <TopBar title="Dokumenter" />
      <main className="mx-auto max-w-xl px-4 py-4">
        <DocumentList householdId={household.id} documents={(data ?? []) as DocumentRow[]} />
      </main>
    </>
  );
}
