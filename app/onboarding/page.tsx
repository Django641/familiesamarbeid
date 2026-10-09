import { redirect } from "next/navigation";

import { APP_NAME } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";

import { OnboardingForm } from "./onboarding-form";

export const metadata = { title: "Kom i gang" };

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: membership }, { data: profile }, { code }] = await Promise.all([
    supabase.from("household_members").select("household_id").eq("user_id", user.id).limit(1).maybeSingle(),
    supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
    searchParams,
  ]);
  if (membership) redirect("/hjem");

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-10">
      <div className="mb-6 text-center">
        <h1 className="text-3xl font-bold text-[var(--color-primary)]">{APP_NAME}</h1>
        <p className="mt-2 text-[var(--color-muted)]">Sett opp familien — tar under ett minutt.</p>
      </div>
      <OnboardingForm defaultName={profile?.display_name ?? ""} defaultCode={code?.toUpperCase() ?? ""} />
    </main>
  );
}
