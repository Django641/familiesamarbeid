import type { Person } from "@/lib/types";

/** Små fargede initial-merker for hvem en hendelse/oppgave gjelder. */
export function PersonDots({ people, ids }: { people: Person[]; ids: string[] }) {
  const selected = people.filter((p) => ids.includes(p.id));
  if (selected.length === 0) return null;
  return (
    <span className="flex shrink-0 -space-x-1" aria-label={`Gjelder ${selected.map((p) => p.name).join(", ")}`}>
      {selected.map((p) => (
        <span
          key={p.id}
          title={p.name}
          aria-hidden
          className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-[var(--color-surface)] text-[10px] font-bold text-white"
          style={{ backgroundColor: p.color }}
        >
          {p.name.slice(0, 1).toUpperCase()}
        </span>
      ))}
    </span>
  );
}
