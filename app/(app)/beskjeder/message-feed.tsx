"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Pin, PinOff, Send, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { notifyHousehold } from "@/lib/push-client";
import { createClient } from "@/lib/supabase/client";
import type { Message, Person } from "@/lib/types";
import { cn, formatDateTime } from "@/lib/utils";

/**
 * Beskjeder mellom de voksne. Nyeste nederst (som en chat). «Fest» en beskjed
 * for å vise den øverst her og på forsiden til den løses.
 */
export function MessageFeed({
  householdId,
  messages,
  people,
  userId,
}: {
  householdId: string;
  messages: Message[];
  people: Person[];
  userId: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [local, setLocal] = useState(messages);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => setLocal(messages), [messages]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [local.length]);

  const refresh = () => startTransition(() => router.refresh());
  const nameFor = (uid: string | null) => people.find((p) => p.user_id === uid)?.name ?? "Noen";
  const colorFor = (uid: string | null) => people.find((p) => p.user_id === uid)?.color ?? "var(--color-muted)";

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    const text = body.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    const { data, error: dbError } = await createClient()
      .from("messages")
      .insert({ household_id: householdId, body: text })
      .select("*")
      .single();
    setSending(false);
    if (dbError || !data) {
      setError("Klarte ikke å sende. Prøv igjen.");
      return;
    }
    setLocal((prev) => [...prev, data as Message]);
    setBody("");
    notifyHousehold(`skrev: ${text.length > 80 ? `${text.slice(0, 80)}…` : text}`, "/beskjeder", "messages");
    refresh();
  }

  async function togglePin(m: Message) {
    const important = !m.important;
    setLocal((prev) => prev.map((x) => (x.id === m.id ? { ...x, important } : x)));
    const { error: dbError } = await createClient().from("messages").update({ important }).eq("id", m.id);
    if (dbError) setLocal((prev) => prev.map((x) => (x.id === m.id ? m : x)));
    else refresh();
  }

  async function remove(m: Message) {
    if (!window.confirm("Slette beskjeden?")) return;
    setLocal((prev) => prev.filter((x) => x.id !== m.id));
    const { error: dbError } = await createClient().from("messages").delete().eq("id", m.id);
    if (dbError) setLocal((prev) => [...prev, m].sort((a, b) => a.created_at.localeCompare(b.created_at)));
    else refresh();
  }

  const pinned = local.filter((m) => m.important);

  return (
    <div className="flex flex-col gap-3">
      {pinned.length > 0 ? (
        <section aria-label="Festede beskjeder" className="flex flex-col gap-2">
          {pinned.map((m) => (
            <div
              key={m.id}
              className="flex items-start gap-2 rounded-xl border border-amber-300 bg-[var(--color-warning-bg)] p-3 text-sm"
            >
              <Pin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <p className="flex-1 whitespace-pre-wrap">{m.body}</p>
              <button
                type="button"
                onClick={() => togglePin(m)}
                aria-label="Løsne beskjed"
                className="flex h-11 w-11 items-center justify-center"
              >
                <PinOff className="h-4 w-4" aria-hidden />
              </button>
            </div>
          ))}
        </section>
      ) : null}

      {local.length === 0 ? (
        <p className="mt-6 text-center text-sm text-[var(--color-muted)]">
          Ingen beskjeder ennå. Skriv noe den andre bør vite!
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {local.map((m) => {
            const mine = m.created_by === userId;
            return (
              <li key={m.id} className={cn("flex flex-col", mine ? "items-end" : "items-start")}>
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-3 py-2 text-[15px]",
                    mine
                      ? "rounded-br-sm bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
                      : "rounded-bl-sm border border-[var(--color-border)] bg-[var(--color-surface)]"
                  )}
                >
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                </div>
                <div className="mt-0.5 flex items-center gap-1 px-1 text-[11px] text-[var(--color-muted)]">
                  {!mine ? (
                    <span className="font-medium" style={{ color: colorFor(m.created_by) }}>
                      {nameFor(m.created_by)} ·
                    </span>
                  ) : null}
                  <span>{formatDateTime(m.created_at)}</span>
                  <button
                    type="button"
                    onClick={() => togglePin(m)}
                    aria-label={m.important ? "Løsne beskjed" : "Fest beskjed"}
                    className="flex h-11 w-11 items-center justify-center"
                  >
                    {m.important ? <PinOff className="h-3.5 w-3.5" aria-hidden /> : <Pin className="h-3.5 w-3.5" aria-hidden />}
                  </button>
                  {mine ? (
                    <button
                      type="button"
                      onClick={() => remove(m)}
                      aria-label="Slett beskjed"
                      className="flex h-11 w-11 items-center justify-center"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <div ref={endRef} />

      <form
        onSubmit={send}
        className="sticky bottom-24 flex items-end gap-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-2 shadow-lg"
      >
        <Textarea
          aria-label="Ny beskjed"
          rows={1}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && window.matchMedia("(pointer: fine)").matches) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Skriv en beskjed …"
          className="min-h-11 flex-1 resize-none border-0 py-2.5 focus-visible:ring-0"
        />
        <Button type="submit" size="icon" aria-label="Send" disabled={sending || !body.trim()}>
          <Send className="h-5 w-5" aria-hidden />
        </Button>
      </form>
      {error ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
