import Link from "next/link";
import { Settings } from "lucide-react";

import { BackButton } from "@/components/back-button";

export function TopBar({
  title,
  action,
  back,
}: {
  title: string;
  action?: React.ReactNode;
  /** Viser tilbakeknapp til venstre for tittelen (undersider); verdien er fallback-adressen. */
  back?: string;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-[var(--color-border)] bg-[var(--color-surface)]/95 backdrop-blur safe-top">
      <div className="mx-auto flex max-w-xl items-center justify-between gap-2 px-4 py-2">
        <div className="flex min-w-0 items-center">
          {back ? <BackButton fallback={back} /> : null}
          <h1 className="truncate text-xl font-semibold">{title}</h1>
        </div>
        <div className="flex items-center gap-1">
          {action}
          <Link
            href="/innstillinger"
            aria-label="Innstillinger"
            className="flex h-11 w-11 items-center justify-center rounded-xl text-[var(--color-muted)] hover:text-[var(--color-primary)]"
          >
            <Settings className="h-5 w-5" aria-hidden />
          </Link>
        </div>
      </div>
    </header>
  );
}
