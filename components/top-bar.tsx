import Link from "next/link";
import { Settings } from "lucide-react";

export function TopBar({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-30 border-b border-[var(--color-border)] bg-[var(--color-surface)]/95 backdrop-blur safe-top">
      <div className="mx-auto flex max-w-xl items-center justify-between gap-2 px-4 py-2">
        <h1 className="truncate text-xl font-semibold">{title}</h1>
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
