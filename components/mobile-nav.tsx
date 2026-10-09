"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, FileText, Home, ListChecks, MessageCircle, ShoppingCart } from "lucide-react";

import { cn } from "@/lib/utils";

const items = [
  { href: "/hjem", label: "Hjem", icon: Home },
  { href: "/kalender", label: "Kalender", icon: CalendarDays },
  { href: "/handleliste", label: "Handle", icon: ShoppingCart },
  { href: "/gjoremal", label: "Gjøremål", icon: ListChecks },
  { href: "/beskjeder", label: "Beskjeder", icon: MessageCircle },
  { href: "/dokumenter", label: "Filer", icon: FileText },
];

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Hovednavigasjon"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--color-border)] bg-[var(--color-surface)]/95 backdrop-blur safe-bottom"
    >
      <ul className="mx-auto flex max-w-xl items-stretch justify-between px-1 pt-1">
        {items.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href} className="min-w-0 flex-1">
              <Link
                href={href}
                prefetch
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-lg py-1.5 text-[11px] font-medium",
                  active ? "text-[var(--color-primary)]" : "text-[var(--color-muted)]"
                )}
              >
                <Icon className="h-5 w-5" aria-hidden />
                <span className="truncate">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
