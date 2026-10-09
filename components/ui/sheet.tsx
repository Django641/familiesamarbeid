"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";

/**
 * Bunnark på mobil (sentrert dialog på større skjermer) bygget på native <dialog>:
 * fokusfelle, Escape og bakgrunnsklikk lukker, og skjermlesere får riktig rolle gratis.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      aria-label={title}
      className="sheet m-0 mt-auto w-full max-w-none rounded-t-3xl bg-[var(--color-surface)] p-0 text-[var(--color-text)] shadow-2xl backdrop:bg-black/40 sm:m-auto sm:max-w-md sm:rounded-3xl"
    >
      <div className="safe-bottom flex max-h-[85dvh] flex-col overflow-y-auto px-5 pt-3 pb-4">
        <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-[var(--color-border)] sm:hidden" aria-hidden />
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Lukk"
            className="-mr-2 flex h-11 w-11 items-center justify-center rounded-full text-[var(--color-muted)] hover:bg-[var(--color-bg)]"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}

/** Stor, tydelig handlingsknapp i et bunnark. */
export function SheetAction({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-base font-medium hover:bg-[var(--color-bg)] ${
        danger ? "text-[var(--color-danger)]" : ""
      }`}
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-bg)]" aria-hidden>
        {icon}
      </span>
      {label}
    </button>
  );
}
