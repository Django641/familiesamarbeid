"use client";

/** Liten mørk melding over bunnmenyen med «Angre»-knapp (vises i ~8 sekunder av kalleren). */
export function UndoToast({ message, onUndo }: { message: string | null; onUndo: () => void }) {
  if (!message) return null;
  return (
    <div className="fixed inset-x-4 bottom-24 z-50 mx-auto max-w-md" role="status" aria-live="polite">
      <div className="flex items-center justify-between gap-3 rounded-2xl bg-[var(--color-text)] px-4 py-2 text-sm text-[var(--color-surface)] shadow-xl">
        <span>{message}</span>
        <button type="button" onClick={onUndo} className="min-h-11 shrink-0 px-2 font-semibold underline underline-offset-2">
          Angre
        </button>
      </div>
    </div>
  );
}
