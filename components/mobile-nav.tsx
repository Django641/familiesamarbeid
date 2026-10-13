"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Ellipsis } from "lucide-react";

import { Sheet } from "@/components/ui/sheet";
import { NAV_ITEMS, type NavId, isMoreActive, isPathActive } from "@/lib/nav-items";
import { cn } from "@/lib/utils";

const itemClass =
  "flex min-h-12 w-full flex-col items-center justify-center gap-0.5 rounded-lg py-1.5 text-[11px] font-medium";

export function MobileNav({ selected }: { selected: NavId[] }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  const shown = NAV_ITEMS.filter((i) => selected.includes(i.id));
  const rest = NAV_ITEMS.filter((i) => !selected.includes(i.id));
  const moreActive = isMoreActive(pathname, selected);

  return (
    <nav
      aria-label="Hovednavigasjon"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--color-border)] bg-[var(--color-surface)]/95 backdrop-blur safe-bottom"
    >
      <ul className="mx-auto flex max-w-xl items-stretch justify-between px-1 pt-1">
        {shown.map(({ id, href, label, icon: Icon }) => {
          const active = isPathActive(pathname, href);
          return (
            <li key={id} className="min-w-0 flex-1">
              <Link
                href={href}
                prefetch
                aria-current={active ? "page" : undefined}
                className={cn(itemClass, active ? "text-[var(--color-primary)]" : "text-[var(--color-muted)]")}
              >
                <Icon className="h-5 w-5" aria-hidden />
                <span className="truncate">{label}</span>
              </Link>
            </li>
          );
        })}
        <li className="min-w-0 flex-1">
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
            className={cn(itemClass, moreActive ? "text-[var(--color-primary)]" : "text-[var(--color-muted)]")}
          >
            <Ellipsis className="h-5 w-5" aria-hidden />
            <span className="truncate">Mer</span>
          </button>
        </li>
      </ul>

      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title="Mer">
        <ul className="flex flex-col">
          {rest.map(({ id, href, label, icon: Icon }) => (
            <li key={id}>
              <MoreLink href={href} label={label} onNavigate={() => setMoreOpen(false)}>
                <Icon className="h-5 w-5" aria-hidden />
              </MoreLink>
            </li>
          ))}
        </ul>
      </Sheet>
    </nav>
  );
}

function MoreLink({
  href,
  label,
  onNavigate,
  children,
}: {
  href: string;
  label: string;
  onNavigate: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-base font-medium hover:bg-[var(--color-bg)]"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-bg)]">{children}</span>
      {label}
    </Link>
  );
}
