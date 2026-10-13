"use client";

import { uploadPresigned } from "@vercel/blob/client";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Camera, Loader2 } from "lucide-react";

import { isReadableFile } from "@/app/(app)/kalender/fra-tekst/ai-draft";
import { draftToRow, type EventRowDraft } from "@/lib/event-draft";
import { assignUnknownToSoleChild, batchUploads, inferWeekStart, mergeDrafts } from "@/lib/homework";
import { prepareUpload } from "@/lib/prepare-upload";
import type { CalendarEvent, Person } from "@/lib/types";
import { osloDateKey } from "@/lib/utils";
import { type AiWeeklyPlan, draftFromAiPlan, type PlanDraft, rowError, rowToEventDraft } from "@/lib/weekly-plan-draft";

import { discardPlanUploads, saveWeeklyPlan } from "../actions";
import { PlanReview, type ReviewGroup } from "./plan-review";

const MAX_FILES = 8;

/** Blob-nøkler tåler ikke alltid æøå o.l. — ASCII i stien (som i Dokumenter). */
function storageSafeName(name: string): string {
  return (
    name
      .replace(/æ/g, "ae").replace(/Æ/g, "Ae").replace(/ø/g, "o").replace(/Ø/g, "O").replace(/å/g, "a").replace(/Å/g, "A")
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^A-Za-z0-9._-]+/g, "_")
      .slice(-120) || "fil"
  );
}

type FileResult = { ok: true; paths: string[]; plan: AiWeeklyPlan; pdf: boolean } | { ok: false; error: string; name: string };

function messageOf(e: unknown, fallback: string): string {
  const raw = e instanceof Error ? e.message : "";
  if (raw.startsWith("Vercel Blob")) {
    console.error(raw);
    return "Opplastingen av originalen feilet. Prøv igjen.";
  }
  return raw || fallback;
}

export function UploadFlow({ kids, events, defaultChild }: { kids: Person[]; events: CalendarEvent[]; defaultChild: string }) {
  const router = useRouter();
  const today = osloDateKey(new Date());
  const [stage, setStage] = useState<"pick" | "reading" | "review">("pick");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [groups, setGroups] = useState<ReviewGroup[]>([]);
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const saved = useRef<{ weekStart: string; personId: string }[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const defaultName = kids.find((k) => k.id === defaultChild)?.name ?? "";

  /** Én AI-forespørsel for ett eller flere filer (skjermbilder av samme plan). Originalene lastes opp til Blob samtidig. */
  async function readBatch(batch: { file: File; prepared: File }[]): Promise<FileResult> {
    const uploaded: string[] = [];
    try {
      const originals = batch.map(async ({ file }) => {
        const pathname = `dokumenter/${crypto.randomUUID()}-${storageSafeName(file.name)}`;
        await uploadPresigned(pathname, file, {
          access: "private",
          handleUploadUrl: "/api/filer/upload",
          contentType: file.type || undefined,
        });
        uploaded.push(pathname);
      });
      const plan = (async () => {
        const form = new FormData();
        for (const { prepared } of batch) form.append("fil", prepared);
        const res = await fetch("/api/ai/parse-weekly-plan", { method: "POST", body: form });
        const data = (await res.json().catch(() => ({}))) as Partial<AiWeeklyPlan> & { error?: string };
        if (!res.ok || data.error || !Array.isArray(data.homework)) {
          const fallback =
            res.status === 413
              ? "Fila er for stor."
              : res.status === 504
                ? "Det tok for lang tid å lese planen. Prøv færre sider om gangen, eller et tydeligere bilde."
                : "Klarte ikke å lese ukeplanen. Prøv igjen.";
          throw new Error(data.error ?? fallback);
        }
        return data as AiWeeklyPlan;
      })();
      const settled = await Promise.allSettled([...originals, plan]);
      const failed = settled.find((r) => r.status === "rejected");
      if (failed && failed.status === "rejected") throw failed.reason;
      return { ok: true, paths: uploaded, pdf: batch.some(({ prepared }) => prepared.type === "application/pdf"), plan: (settled[settled.length - 1] as PromiseFulfilledResult<AiWeeklyPlan>).value };
    } catch (e) {
      // Originalene kan ha rukket å bli lastet opp: rydd dem bort igjen.
      if (uploaded.length > 0) void discardPlanUploads(uploaded).catch(() => {});
      return { ok: false, error: messageOf(e, "Klarte ikke å lese fila."), name: batch[0].file.name };
    } finally {
      setProgress((p) => ({ ...p, done: p.done + 1 }));
    }
  }

  async function start(list: FileList | null) {
    if (!list || list.length === 0) return;
    const files = Array.from(list);
    if (fileRef.current) fileRef.current.value = "";
    if (files.some((f) => !isReadableFile(f))) return setError("Velg bilder eller PDF.");
    if (files.length > MAX_FILES) return setError(`Velg maks ${MAX_FILES} filer om gangen.`);

    setError(null);
    setNotice(null);
    setProgress({ done: 0, total: 1 });
    setStage("reading");

    // Skaler ned først, så vi vet hvor mange kall som trengs.
    const prepared: { file: File; prepared: File }[] = [];
    try {
      for (const file of files) prepared.push({ file, prepared: await prepareUpload(file) });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Klarte ikke å lese fila.");
      setStage("pick");
      return;
    }
    const batches = batchUploads(prepared, MAX_FILES);
    setProgress({ done: 0, total: batches.length });
    const results = await Promise.all(batches.map(readBatch));
    const good = results.filter((r): r is Extract<FileResult, { ok: true }> => r.ok);
    const bad = results.filter((r): r is Extract<FileResult, { ok: false }> => !r.ok);

    if (good.length === 0) {
      setError(bad[0]?.error ?? "Klarte ikke å lese ukeplanen.");
      setStage("pick");
      return;
    }

    const planDrafts = good.map((g) =>
      draftFromAiPlan(
        // Uka utledes fra datoene i svaret når planen ikke oppgir den. Valgt barn er reserve når AI-en ikke fant barnet.
        { ...g.plan, person: g.plan.person || defaultName, week_start: inferWeekStart(g.plan) },
        { people: kids, existingEvents: events, today }
      )
    );
    // En PDF er en hel plan (kanskje for det andre barnet) — bare skjermbilder slås inn i det kjente barnet.
    const assigned = assignUnknownToSoleChild(planDrafts, events, today, good.map((g) => !g.pdf));
    const drafts: { draft: PlanDraft; paths: string[] }[] = assigned.map((draft, i) => ({ draft, paths: good[i].paths }));
    // Samme barn → ett ark (flere skjermbilder av samme plan). Ukjent barn samles i ett ark der man velger «Gjelder».
    const personIds = [...new Set(drafts.map((d) => d.draft.personId))];
    setGroups(
      personIds.map((personId) => {
        const mine = drafts.filter((d) => d.draft.personId === personId);
        const merged = mergeDrafts(mine.map((d) => d.draft));
        return { ...merged, paths: mine.flatMap((d) => d.paths) };
      })
    );
    saved.current = [];
    setIndex(0);
    setNotice(
      bad.length > 0 ? `${bad.length === 1 ? "1 fil" : `${bad.length} filer`} kunne ikke leses (${bad[0].name}: ${bad[0].error})` : null
    );
    setStage("review");
  }

  function finish() {
    const list = saved.current;
    if (list.length === 0) return router.push("/lekser");
    const q = new URLSearchParams({ uke: list[0].weekStart });
    if (list.length === 1) q.set("barn", list[0].personId);
    router.push(`/lekser?${q.toString()}`);
  }

  function next(message: string | null) {
    if (index < groups.length - 1) {
      setIndex(index + 1);
      setNotice(message);
      setError(null);
      setBusy(false);
    } else {
      finish();
    }
  }

  async function save(group: ReviewGroup) {
    const child = kids.find((k) => k.id === group.personId);
    if (!child) return setError("Velg hvem planen gjelder.");
    const chosen = group.rows.filter((r) => r.selected);
    for (const r of chosen) {
      const err = rowError(r);
      if (err) return setError(`«${r.text || "Uten tekst"}»: ${err}`);
    }
    const eventRows: EventRowDraft[] = [];
    for (const r of chosen.filter((x) => x.group === "kalender")) {
      const res = draftToRow(rowToEventDraft(r, group.personId));
      if ("error" in res) return setError(`«${r.text}»: ${res.error}`);
      eventRows.push(res.row);
    }
    const payload = {
      person_id: group.personId,
      week_start: group.weekStart,
      items: chosen
        .filter((r) => r.group !== "kalender")
        .map((r) => ({ text: r.text.trim(), kind: r.group === "mal" ? ("mal" as const) : ("lekse" as const), due_date: r.group === "lekse" && r.date ? r.date : null })),
      events: eventRows,
      files: group.paths,
    };

    setBusy(true);
    setError(null);
    try {
      // Samme barn og uke alt lagret i denne økta (flere ark): legg til, ikke erstatt og ikke spør.
      const append = saved.current.some((x) => x.personId === group.personId && x.weekStart === group.weekStart);
      let res = await saveWeeklyPlan({ ...payload, replace: false, append });
      if (res.needsConfirm) {
        if (!window.confirm(`${child.name} har allerede en ukeplan for denne uka. Erstatte den?`)) {
          setBusy(false);
          return;
        }
        res = await saveWeeklyPlan({ ...payload, replace: true });
      }
      if (res.error) {
        setError(res.error);
        setBusy(false);
        return;
      }
    } catch {
      setError("Klarte ikke å lagre. Sjekk nettet og prøv igjen.");
      setBusy(false);
      return;
    }
    saved.current.push({ weekStart: group.weekStart, personId: group.personId });
    next(`${child.name} er lagret.`);
  }

  async function skip(group: ReviewGroup) {
    setBusy(true);
    await discardPlanUploads(group.paths).catch(() => {});
    next(null);
  }

  async function cancel() {
    setBusy(true);
    // Originalene til alt som ikke er lagret ennå slettes igjen.
    await discardPlanUploads(groups.slice(index).flatMap((g) => g.paths)).catch(() => {});
    router.push("/lekser");
  }

  if (stage === "reading") {
    return (
      <div role="status" className="flex flex-col items-center gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-12 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--color-primary)]" aria-hidden />
        <p className="font-medium">Leser ukeplanen …</p>
        <p className="text-sm text-[var(--color-muted)]">
          {progress.done} av {progress.total} {progress.total === 1 ? "fil" : "filer"} ferdig
        </p>
      </div>
    );
  }

  if (stage === "review" && groups[index]) {
    const group = groups[index];
    return (
      <PlanReview
        key={index}
        group={group}
        kids={kids}
        events={events}
        today={today}
        position={{ index, total: groups.length, nextName: index < groups.length - 1 ? (kids.find((k) => k.id === groups[index + 1].personId)?.name ?? "neste plan") : null }}
        busy={busy}
        error={error}
        notice={notice}
        onChange={(g) => setGroups((prev) => prev.map((x, i) => (i === index ? g : x)))}
        onSave={() => save(group)}
        onSkip={() => skip(group)}
        onCancel={cancel}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-[var(--color-muted)]">
        Velg ukeplanen fra skolen: en PDF, eller ett eller flere skjermbilder. Gjelder det flere barn ({kids.map((k) => k.name).join(" og ")}) kan du velge alle — vi sorterer dem. Du ser over alt før noe lagres.
      </p>
      <label className="flex h-14 cursor-pointer items-center justify-center gap-2 rounded-2xl bg-[var(--color-primary)] text-base font-semibold text-[var(--color-primary-foreground)] shadow-sm focus-within:ring-2 focus-within:ring-[var(--color-primary)] focus-within:ring-offset-2 active:opacity-90">
        <Camera className="h-5 w-5" aria-hidden />
        Velg PDF eller bilder
        <input ref={fileRef} type="file" accept="image/*,application/pdf" multiple className="sr-only" onChange={(e) => start(e.target.files)} />
      </label>
      {error ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
