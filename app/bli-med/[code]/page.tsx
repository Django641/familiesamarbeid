import Link from "next/link";

import { buttonClass } from "@/components/ui/button";
import { APP_NAME } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Bli med" };

export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const upperCode = code.toUpperCase();
  const supabase = await createClient();

  const [{ data }, { data: auth }] = await Promise.all([
    supabase.rpc("household_invite_info", { p_code: upperCode }),
    supabase.auth.getUser(),
  ]);
  const info = (data?.[0] ?? null) as { name: string; inviter_name: string } | null;
  const onboarding = `/onboarding?code=${encodeURIComponent(upperCode)}`;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-10 text-center">
      <h1 className="text-3xl font-bold text-[var(--color-primary)]">{APP_NAME}</h1>
      {info ? (
        <>
          <p className="mt-6 text-[var(--color-muted)]">{info.inviter_name} har invitert deg til</p>
          <h2 className="mt-1 text-2xl font-bold">{info.name}</h2>
          {auth.user ? (
            <Link href={onboarding} className={buttonClass("default", "lg", "mt-8 w-full")}>
              Bli med
            </Link>
          ) : (
            <div className="mt-8 flex flex-col gap-3">
              <Link
                href={`/login?mode=signup&next=${encodeURIComponent(onboarding)}`}
                className={buttonClass("default", "lg", "w-full")}
              >
                Lag konto
              </Link>
              <Link
                href={`/login?next=${encodeURIComponent(onboarding)}`}
                className={buttonClass("secondary", "lg", "w-full")}
              >
                Jeg har konto — logg inn
              </Link>
            </div>
          )}
        </>
      ) : (
        <p className="mt-6 text-[var(--color-muted)]">Ugyldig invitasjonskode.</p>
      )}
    </main>
  );
}
