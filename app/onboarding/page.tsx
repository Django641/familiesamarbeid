import { redirect } from "next/navigation";

import { APP_NAME } from "@/lib/config";
import { db } from "@/lib/db";
import { people } from "@/lib/db/schema";
import { requireUser } from "@/lib/session";

import { OnboardingForm } from "./onboarding-form";

export const metadata = { title: "Kom i gang" };

export default async function OnboardingPage() {
  const user = await requireUser();
  const all = await db.select().from(people);
  if (all.some((p) => p.user_id === user.id)) redirect("/hjem");
  const children = all.filter((p) => p.kind === "barn").map((p) => p.name);
  const partner = all.find((p) => p.kind === "voksen")?.name ?? null;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-10">
      <div className="mb-6 text-center">
        <h1 className="text-3xl font-bold text-[var(--color-primary)]">{APP_NAME}</h1>
        <p className="mt-2 text-[var(--color-muted)]">
          {partner ? `${partner} har allerede satt opp familien. Hva heter du?` : "Velkommen! To spørsmål, så er du i gang."}
        </p>
      </div>
      <OnboardingForm askChildren={children.length === 0} existingChildren={children} />
    </main>
  );
}
