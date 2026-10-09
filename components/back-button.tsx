"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { ChevronLeft } from "lucide-react";

// «Tilbake» skal bare gå tilbake når forrige side var i appen. window.history.length
// er upålitelig (kan peke ut av appen), og en ny lasting av siden (dra ned, iOS som
// laster PWA-en på nytt) har ingen app-historikk. Derfor en modulvariabel: den
// nullstilles ved full lasting og blir sann først når brukeren har navigert i appen.
let firstPath: string | null = null;
let navigatedInApp = false;

/** Ligger i app-layouten og registrerer navigasjon. */
export function NavTracker() {
  const pathname = usePathname();
  useEffect(() => {
    if (firstPath === null) firstPath = pathname;
    else if (pathname !== firstPath) navigatedInApp = true;
  }, [pathname]);
  return null;
}

/** Tilbake i appen hvis vi kom fra en side i appen, ellers til `fallback`. */
export function useGoBack(fallback: string) {
  const router = useRouter();
  return () => {
    if (navigatedInApp) router.back();
    else router.push(fallback);
  };
}

export function BackButton({ fallback }: { fallback: string }) {
  const goBack = useGoBack(fallback);
  return (
    <button
      type="button"
      onClick={goBack}
      aria-label="Tilbake"
      className="-ml-3 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[var(--color-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
    >
      <ChevronLeft className="h-6 w-6" aria-hidden />
    </button>
  );
}
