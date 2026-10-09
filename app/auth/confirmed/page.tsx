import Link from "next/link";
import { CheckCircle2 } from "lucide-react";

import { buttonClass } from "@/components/ui/button";
import { safeNext } from "@/lib/safe-next";

export const metadata = { title: "Bekreftet" };

export default async function ConfirmedPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const continueTo = safeNext(next);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-5 py-10 text-center">
      <CheckCircle2 className="h-20 w-20 text-[var(--color-success)]" aria-hidden />
      <h1 className="mt-6 text-2xl font-bold">E-posten er bekreftet</h1>
      <p className="mt-2 text-[var(--color-muted)]">Du er logget inn og klar til å starte.</p>
      <Link href={continueTo} className={buttonClass("default", "lg", "mt-8 w-full")}>
        Kom i gang
      </Link>
    </main>
  );
}
