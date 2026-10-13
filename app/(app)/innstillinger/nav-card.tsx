"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BOTTOM_NAV_COOKIE } from "@/lib/config";
import { MAX_NAV, NAV_ITEMS, type NavId, serializeNav, toggleNav } from "@/lib/nav-items";
import { cn } from "@/lib/utils";

export function NavCard({ initial }: { initial: NavId[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<NavId[]>(initial);

  function toggle(id: NavId) {
    const next = toggleNav(selected, id);
    if (next.length === selected.length) return;
    setSelected(next);
    document.cookie = `${BOTTOM_NAV_COOKIE}=${serializeNav(next)}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Bunnmeny</CardTitle>
        <p className="text-sm text-[var(--color-muted)]">
          Velg opptil {MAX_NAV} sider som skal stå nederst. Resten finner du under «Mer». Gjelder bare denne telefonen.
        </p>
      </CardHeader>
      <CardContent>
        <ul role="group" aria-label="Sider i bunnmenyen" className="flex flex-col">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
            const checked = selected.includes(id);
            const disabled = (!checked && selected.length >= MAX_NAV) || (checked && selected.length <= 1);
            return (
              <li key={id}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={checked}
                  aria-disabled={disabled}
                  onClick={() => toggle(id)}
                  className={cn(
                    "flex min-h-12 w-full items-center gap-3 rounded-xl px-1 text-left text-base font-medium",
                    disabled && "opacity-50"
                  )}
                >
                  <span
                    className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2",
                      checked
                        ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-white"
                        : "border-[var(--color-border)]"
                    )}
                    aria-hidden
                  >
                    {checked && <Check className="h-4 w-4" />}
                  </span>
                  <Icon className="h-5 w-5 text-[var(--color-muted)]" aria-hidden />
                  {label}
                </button>
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-sm text-[var(--color-muted)]" aria-live="polite">
          {selected.length} av {MAX_NAV} valgt
        </p>
      </CardContent>
    </Card>
  );
}
