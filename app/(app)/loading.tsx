export default function Loading() {
  return (
    <main className="mx-auto flex max-w-xl flex-col gap-3 px-4 py-16" aria-busy="true" aria-label="Laster">
      <div className="h-12 w-full animate-pulse rounded-xl bg-[var(--color-surface)]" />
      <div className="mt-3 h-32 w-full animate-pulse rounded-[var(--radius-card)] bg-[var(--color-surface)]" />
      <div className="mt-3 h-32 w-full animate-pulse rounded-[var(--radius-card)] bg-[var(--color-surface)]" />
    </main>
  );
}
