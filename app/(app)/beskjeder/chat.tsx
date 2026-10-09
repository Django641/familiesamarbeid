"use client";

import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowUp, CalendarPlus, Copy, ListChecks, Pin, PinOff, Trash2 } from "lucide-react";

import { Avatar } from "@/components/avatar";
import { Sheet, SheetAction } from "@/components/ui/sheet";
import type { Message, Person } from "@/lib/types";
import { cn, dayLabel, osloDateKey, osloTime } from "@/lib/utils";

import { deleteMessage, messageToTask, sendMessage, setPinned } from "./actions";

type LocalMessage = Message & { pending?: boolean; failed?: boolean };

/** Beskjeder som chat: nyeste nederst, skrivefelt fast over bunnmenyen. */
export function Chat({ messages, people, userId }: { messages: Message[]; people: Person[]; userId: string }) {
  const router = useRouter();
  const [local, setLocal] = useState<LocalMessage[]>(messages);
  const [selected, setSelected] = useState<LocalMessage | null>(null);
  const [showPinned, setShowPinned] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // Behold beskjeder som fortsatt sendes når serveren leverer ny liste.
  useEffect(() => {
    setLocal((prev) => [...messages, ...prev.filter((m) => m.pending || m.failed)]);
  }, [messages]);

  useLayoutEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [local.length]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 3000);
    return () => clearTimeout(t);
  }, [notice]);

  const personFor = (uid: string | null) => people.find((p) => p.user_id === uid);
  const pinned = local.filter((m) => m.pinned);
  const todayKey = osloDateKey(new Date());

  async function send(body: string) {
    const temp: LocalMessage = {
      id: `temp-${crypto.randomUUID()}`,
      body,
      pinned: false,
      created_by: userId,
      created_at: new Date(),
      updated_at: new Date(),
      pending: true,
    };
    setLocal((prev) => [...prev, temp]);
    try {
      const res = await sendMessage(body);
      if (res.error || !res.message) throw new Error(res.error);
      const saved = res.message;
      // Kan allerede ha kommet inn via synk — unngå to rader med samme id.
      setLocal((prev) => prev.filter((m) => m.id !== saved.id).map((m) => (m.id === temp.id ? saved : m)));
    } catch {
      setLocal((prev) => prev.map((m) => (m.id === temp.id ? { ...m, pending: false, failed: true } : m)));
    }
  }

  async function act(action: "pin" | "copy" | "task" | "calendar" | "delete" | "retry") {
    const m = selected;
    setSelected(null);
    if (!m) return;
    if (action === "copy") {
      await navigator.clipboard.writeText(m.body).catch(() => {});
      setNotice("Kopiert");
    } else if (action === "calendar") {
      router.push(`/kalender/fra-tekst?tekst=${encodeURIComponent(m.body.slice(0, 4000))}`);
    } else if (action === "retry") {
      setLocal((prev) => prev.filter((x) => x.id !== m.id));
      await send(m.body);
    } else if (action === "pin") {
      setLocal((prev) => prev.map((x) => (x.id === m.id ? { ...x, pinned: !m.pinned } : x)));
      const res = await setPinned(m.id, !m.pinned).catch(() => ({ error: "Klarte ikke å lagre." }));
      if (res.error) {
        setLocal((prev) => prev.map((x) => (x.id === m.id ? { ...x, pinned: m.pinned } : x)));
        setNotice(res.error);
      }
    } else if (action === "task") {
      const res = await messageToTask(m.id).catch(() => ({ error: "Klarte ikke å lage gjøremål." }));
      setNotice(res.error ?? "Lagt til som gjøremål ✓");
    } else if (action === "delete") {
      if (m.failed) {
        setLocal((prev) => prev.filter((x) => x.id !== m.id));
        return;
      }
      if (!window.confirm("Slette beskjeden?")) return;
      setLocal((prev) => prev.filter((x) => x.id !== m.id));
      await deleteMessage(m.id).catch(() => setNotice("Klarte ikke å slette."));
    }
  }

  return (
    <>
      {pinned.length > 0 ? (
        <div className="sticky top-[calc(env(safe-area-inset-top)+3.75rem)] z-20 border-b border-[var(--color-border)] bg-[var(--color-surface)]/95 backdrop-blur">
          <button
            type="button"
            onClick={() => setShowPinned((v) => !v)}
            aria-expanded={showPinned}
            className="mx-auto flex min-h-11 w-full max-w-xl items-center gap-2 px-4 text-left text-sm"
          >
            <Pin className="h-4 w-4 shrink-0 text-amber-600" aria-hidden />
            <span className="min-w-0 flex-1 truncate">
              {showPinned ? `${pinned.length} festet` : pinned[pinned.length - 1].body}
            </span>
            {pinned.length > 1 && !showPinned ? (
              <span className="shrink-0 text-xs text-[var(--color-muted)]">+{pinned.length - 1}</span>
            ) : null}
          </button>
          {showPinned ? (
            <ul className="mx-auto max-w-xl px-4 pb-2">
              {pinned.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(m)}
                    className="w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-[var(--color-bg)]"
                  >
                    <span className="line-clamp-3 whitespace-pre-wrap">{m.body}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <main className="mx-auto max-w-xl px-3 pt-3 pb-28">
        {local.length === 0 ? (
          <div className="mt-16 px-6 text-center">
            <p className="text-3xl" aria-hidden>
              💬
            </p>
            <p className="mt-2 font-medium">Ingen beskjeder ennå</p>
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              Skriv noe den andre bør vite. Trykk på en beskjed for å feste den eller gjøre den om til et gjøremål.
            </p>
          </div>
        ) : (
          <ol className="flex flex-col" aria-label="Beskjeder">
            {local.map((m, i) => {
              const prev = local[i - 1];
              const dateKey = osloDateKey(m.created_at);
              const newDay = !prev || osloDateKey(prev.created_at) !== dateKey;
              const mine = m.created_by === userId;
              const sameAuthorAsPrev =
                !newDay && prev?.created_by === m.created_by && +new Date(m.created_at) - +new Date(prev.created_at) < 5 * 60_000;
              const author = personFor(m.created_by);
              return (
                <li key={m.id} className="flex flex-col">
                  {newDay ? (
                    <div className="my-3 text-center text-xs font-medium text-[var(--color-muted)]">
                      {dayLabel(dateKey, todayKey)}
                    </div>
                  ) : null}
                  <div className={cn("flex items-end gap-2", mine ? "justify-end" : "justify-start", sameAuthorAsPrev ? "mt-0.5" : "mt-2")}>
                    {!mine ? (
                      <span className="w-8 shrink-0">{!sameAuthorAsPrev && author ? <Avatar person={author} /> : null}</span>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => setSelected(m)}
                      className={cn(
                        "max-w-[80%] rounded-3xl px-4 py-2.5 text-left text-[16px] leading-snug",
                        mine
                          ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
                          : "bg-[var(--color-surface)] shadow-sm ring-1 ring-[var(--color-border)]",
                        mine && sameAuthorAsPrev && "rounded-tr-lg",
                        !mine && sameAuthorAsPrev && "rounded-tl-lg",
                        m.pending && "opacity-60",
                        m.failed && "ring-2 ring-[var(--color-danger)]"
                      )}
                    >
                      <span className="sr-only">
                        {mine ? "Du" : (author?.name ?? "Ukjent")} kl. {osloTime(m.created_at)}:{" "}
                      </span>
                      {m.pinned ? <Pin className="mr-1 inline h-3.5 w-3.5 -translate-y-px" aria-label="Festet" /> : null}
                      <span className="whitespace-pre-wrap break-words">{m.body}</span>
                      <span
                        className={cn(
                          "mt-0.5 block text-right text-[11px] tabular-nums",
                          mine ? "opacity-75" : "text-[var(--color-muted)]"
                        )}
                      >
                        {m.failed ? "Ikke sendt – trykk for å prøve igjen" : m.pending ? "Sender …" : osloTime(m.created_at)}
                      </span>
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
        <div ref={endRef} />
      </main>

      <Composer onSend={send} />

      {notice ? (
        <div role="status" className="fixed inset-x-0 bottom-40 z-50 flex justify-center">
          <span className="rounded-full bg-[var(--color-text)] px-4 py-2 text-sm text-[var(--color-surface)] shadow-lg">{notice}</span>
        </div>
      ) : null}

      <Sheet open={selected !== null} onClose={() => setSelected(null)} title="Beskjed">
        {selected ? (
          <div className="flex flex-col gap-1">
            <p className="mb-2 line-clamp-4 whitespace-pre-wrap rounded-2xl bg-[var(--color-bg)] px-4 py-3 text-sm">{selected.body}</p>
            {selected.failed ? (
              <SheetAction icon={<ArrowUp className="h-4 w-4" />} label="Prøv å sende igjen" onClick={() => act("retry")} />
            ) : (
              <>
                <SheetAction
                  icon={selected.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                  label={selected.pinned ? "Løsne" : "Fest øverst (vises også på Hjem)"}
                  onClick={() => act("pin")}
                />
                <SheetAction icon={<ListChecks className="h-4 w-4" />} label="Gjør om til gjøremål" onClick={() => act("task")} />
                <SheetAction icon={<CalendarPlus className="h-4 w-4" />} label="Legg i kalenderen" onClick={() => act("calendar")} />
                <SheetAction icon={<Copy className="h-4 w-4" />} label="Kopier tekst" onClick={() => act("copy")} />
              </>
            )}
            {selected.created_by === userId ? (
              <SheetAction icon={<Trash2 className="h-4 w-4" />} label="Slett" danger onClick={() => act("delete")} />
            ) : null}
          </div>
        ) : null}
      </Sheet>
    </>
  );
}

function Composer({ onSend }: { onSend: (body: string) => Promise<void> }) {
  const [body, setBody] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  // Vokser med teksten, opp til ca. fem linjer.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [body]);

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const text = body.trim();
    if (!text) return;
    setBody("");
    ref.current?.focus();
    void onSend(text);
  }

  return (
    <form
      onSubmit={submit}
      className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+3.75rem)] z-30 border-t border-[var(--color-border)] bg-[var(--color-bg)]/95 backdrop-blur"
    >
      <div className="mx-auto flex max-w-xl items-end gap-2 px-3 py-2">
        <textarea
          ref={ref}
          aria-label="Ny beskjed"
          rows={1}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            // Enter sender på PC; på mobil gir Enter ny linje.
            if (e.key === "Enter" && !e.shiftKey && window.matchMedia("(pointer: fine)").matches) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Skriv en beskjed …"
          className="min-h-11 flex-1 resize-none rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5 text-base leading-snug placeholder:text-[var(--color-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
        />
        <button
          type="submit"
          aria-label="Send"
          disabled={!body.trim()}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)] text-[var(--color-primary-foreground)] transition-opacity disabled:opacity-40"
        >
          <ArrowUp className="h-5 w-5" strokeWidth={2.5} aria-hidden />
        </button>
      </div>
    </form>
  );
}
