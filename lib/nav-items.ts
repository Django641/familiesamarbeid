import {
  CalendarDays,
  FileText,
  Home,
  ListChecks,
  MessageCircle,
  NotebookPen,
  ShoppingCart,
  type LucideIcon,
} from "lucide-react";

export type NavId = "hjem" | "kalender" | "handle" | "lekser" | "gjoremal" | "beskjeder" | "filer";

export type NavItem = { id: NavId; href: string; label: string; icon: LucideIcon };

/** Alle sider som kan stå i bunnmenyen, i fast rekkefølge. */
export const NAV_ITEMS: readonly NavItem[] = [
  { id: "hjem", href: "/hjem", label: "Hjem", icon: Home },
  { id: "kalender", href: "/kalender", label: "Kalender", icon: CalendarDays },
  { id: "handle", href: "/handleliste", label: "Handle", icon: ShoppingCart },
  { id: "lekser", href: "/lekser", label: "Lekser", icon: NotebookPen },
  { id: "gjoremal", href: "/gjoremal", label: "Gjøremål", icon: ListChecks },
  { id: "beskjeder", href: "/beskjeder", label: "Beskjeder", icon: MessageCircle },
  { id: "filer", href: "/dokumenter", label: "Filer", icon: FileText },
];

export const DEFAULT_NAV: readonly NavId[] = ["hjem", "kalender", "handle", "lekser", "beskjeder"];
export const MAX_NAV = 5;
export const MIN_NAV = 1;

const IDS = new Set<string>(NAV_ITEMS.map((i) => i.id));

/** Leser cookieverdien («hjem,kalender,…»). Ugyldig, tom eller for lang → standard. Rekkefølgen følger NAV_ITEMS. */
export function parseNavCookie(value: string | undefined | null): NavId[] {
  if (!value) return [...DEFAULT_NAV];
  const parts = value.split(",").map((p) => p.trim());
  if (parts.some((p) => !IDS.has(p))) return [...DEFAULT_NAV];
  const unique = new Set(parts);
  if (unique.size < MIN_NAV || unique.size > MAX_NAV) return [...DEFAULT_NAV];
  return NAV_ITEMS.filter((i) => unique.has(i.id)).map((i) => i.id);
}

export function serializeNav(ids: readonly NavId[]): string {
  return NAV_ITEMS.filter((i) => ids.includes(i.id))
    .map((i) => i.id)
    .join(",");
}

/** Slå et punkt av/på. Returnerer uendret liste hvis grensene (1–5) ville brytes. */
export function toggleNav(ids: readonly NavId[], id: NavId): NavId[] {
  if (ids.includes(id)) {
    return ids.length <= MIN_NAV ? [...ids] : ids.filter((i) => i !== id);
  }
  if (ids.length >= MAX_NAV) return [...ids];
  return NAV_ITEMS.filter((i) => i.id === id || ids.includes(i.id)).map((i) => i.id);
}

export function isPathActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Er siden bak «Mer»? (ikke valgt i menyen, men et kjent punkt eller Innstillinger) */
export function isMoreActive(pathname: string, selected: readonly NavId[]): boolean {
  if (isPathActive(pathname, "/innstillinger")) return true;
  return NAV_ITEMS.some((i) => !selected.includes(i.id) && isPathActive(pathname, i.href));
}
