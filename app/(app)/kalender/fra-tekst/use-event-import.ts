"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { type EventRowDraft, expandRepeat } from "@/lib/event-draft";
import { prepareUpload, snapshotFile } from "@/lib/prepare-upload";
import type { Person } from "@/lib/types";

import { createEvents } from "../actions";
import { type AiEvent, type Row, isReadableFile, toRow } from "./ai-draft";

/**
 * All state og logikk for «Fra tekst»: innlegging (tekst, lim inn, bilde/PDF), AI-tolkning,
 * redigering av forslag og lagring. `inline` = hurtigfeltet i Kalender, ellers egen side.
 */
export function useEventImport({
  people,
  initialText,
  inline,
}: {
  people: Person[];
  initialText: string;
  inline: boolean;
}) {
  const router = useRouter();
  const [text, setText] = useState(initialText);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [canPaste, setCanPaste] = useState(false);
  const [reading, setReading] = useState<"tekst" | "fil">("tekst");
  const fileInput = useRef<HTMLInputElement>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setCanPaste(typeof navigator !== "undefined" && typeof navigator.clipboard?.readText === "function");
    return () => {
      if (savedTimer.current) clearTimeout(savedTimer.current);
    };
  }, []);

  /** Lim inn-knappen: tekst eller bilde fra utklippstavla (Safari viser en «Lim inn»-boble først). */
  async function paste() {
    setError(null);
    try {
      if (typeof navigator.clipboard.read === "function") {
        // Tekst først: Outlook/Word på Mac legger også et bilde av teksten på utklippstavla.
        const items = await navigator.clipboard.read();
        const textItem = items.find((i) => i.types.includes("text/plain"));
        const clipText = textItem ? (await (await textItem.getType("text/plain")).text()).trim() : "";
        if (clipText) {
          addText(clipText);
          return;
        }
        for (const item of items) {
          const imageType = item.types.find((t) => t.startsWith("image/"));
          if (imageType) {
            const blob = await item.getType(imageType);
            await analyseFile(new File([blob], "utklipp", { type: imageType }));
            return;
          }
        }
        setError("Fant ingen tekst eller bilde på utklippstavla.");
        return;
      }
      addText(await navigator.clipboard.readText());
    } catch {
      setError("Fikk ikke lest utklippstavla. Lim inn rett i feltet med ⌘V (Mac) eller hold fingeren i feltet (iPhone).");
    }
  }

  function addText(clip: string) {
    const trimmed = clip.trim();
    if (trimmed) setText((prev) => (prev.trim() ? `${prev.trim()}\n${trimmed}` : trimmed).slice(0, 8000));
  }

  /** ⌘V / lim inn rett i feltet: et rent bilde (f.eks. skjermbilde på Mac) går til bildetolkning. */
  function onPaste(e: React.ClipboardEvent) {
    const file = Array.from(e.clipboardData.files).find(isReadableFile);
    if (!file) return; // vanlig tekst limes inn som normalt
    // Outlook/Word legger ved et bilde av teksten — da er det teksten som gjelder.
    // Finder (⌘C på en fil) legger derimot bare ved filnavnet som tekst — da gjelder fila.
    const text = e.clipboardData.getData("text/plain").trim();
    const names = Array.from(e.clipboardData.files).map((f) => f.name);
    if (text && !names.includes(text) && !text.split(/\r?\n/).every((line) => names.includes(line.trim()))) return;
    e.preventDefault();
    readNow(file);
  }

  /** Safari gjør innlimte/sluppede filer uleselige etter hendelsen — les dem med en gang. */
  function readNow(file: File) {
    // Sjekk type og størrelse før noe leses inn i minnet (f.eks. en video som slippes på feltet).
    if (!isReadableFile(file)) return setError("Velg et bilde eller en PDF.");
    if (file.size > 60 * 1024 * 1024) return setError("Fila er for stor. Ta et skjermbilde i stedet.");
    snapshotFile(file).then(analyseFile, () =>
      setError("Fikk ikke lest fila. Lagre den og velg den med bindersen i stedet.")
    );
  }

  /** Dra og slipp en fil (Mac) på feltet. */
  function onDrop(e: React.DragEvent) {
    const file = Array.from(e.dataTransfer.files).find(isReadableFile) ?? e.dataTransfer.files[0];
    if (!file) return;
    e.preventDefault();
    readNow(file);
  }

  async function run(init: RequestInit, kind: "tekst" | "fil") {
    setBusy(true);
    setReading(kind);
    setError(null);
    setSaved(null);
    try {
      const res = await fetch("/api/ai/parse-events", { method: "POST", ...init });
      const data = (await res.json().catch(() => ({}))) as { events?: AiEvent[]; error?: string; explanation?: string };
      if (!res.ok || !data.events) {
        const fallback =
          res.status === 413
            ? "Fila er for stor."
            : res.status === 504
              ? "Det tok for lang tid. Prøv et skjermbilde av siden med datoene."
              : "Noe gikk galt";
        throw new Error(data.error ?? fallback);
      }
      if (data.events.length === 0) {
        const fallback = kind === "fil" ? "Fant ingen hendelser med dato i fila." : "Fant ingen hendelser med dato i teksten.";
        setError(data.explanation ? `${fallback} ${data.explanation}` : fallback);
      }
      setRows(data.events.map((e, i) => toRow(e, people, i)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Noe gikk galt");
    } finally {
      setBusy(false);
    }
  }

  function analyse() {
    return run({ headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) }, "tekst");
  }

  /** Bilde/PDF → AI. Det som står i tekstfeltet sendes med som kommentar («gjelder Lea»). */
  async function analyseFile(file: File | undefined) {
    if (fileInput.current) fileInput.current.value = ""; // samme fil kan velges igjen
    if (!file || busy) return;
    setBusy(true); // konvertering av store bilder kan ta et par sekunder på telefonen
    setReading("fil");
    setError(null);
    let upload: File;
    try {
      upload = await prepareUpload(file);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Klarte ikke å lese fila.");
      setBusy(false);
      return;
    }
    const form = new FormData();
    form.append("fil", upload);
    if (text.trim()) form.append("tekst", text.trim().slice(0, 2000));
    await run({ body: form }, "fil");
  }

  function update(key: string, changes: Partial<Row>) {
    setRows((prev) => prev?.map((r) => (r.key === key ? { ...r, ...changes } : r)) ?? null);
  }

  /** Tilbake fra forslagene til tekstfeltet. */
  function back() {
    setRows(null);
  }

  /** Teksten er endret for hånd (fjerner «lagt i kalenderen»-meldingen i hurtigfeltet). */
  function edit(value: string) {
    setText(value);
    setSaved(null);
  }

  async function save() {
    if (!rows) return;
    const chosen = rows.filter((r) => r.selected);
    const converted = chosen.map((r) => expandRepeat(r, r.repeat, r.repeatUntil, crypto.randomUUID()));
    const bad = converted.findIndex((c) => "error" in c);
    if (bad >= 0) {
      const err = converted[bad] as { error: string };
      setError(`«${chosen[bad].title || "Uten tittel"}»: ${err.error}`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await createEvents(converted.flatMap((c) => (c as { rows: EventRowDraft[] }).rows));
      if (res.error) {
        setError(res.error);
        setBusy(false);
        return;
      }
    } catch {
      setError("Klarte ikke å lagre. Prøv igjen.");
      setBusy(false);
      return;
    }
    if (!inline) {
      router.push("/kalender");
      return;
    }
    setBusy(false);
    setRows(null);
    setText("");
    setSaved(chosen.length === 1 ? `«${chosen[0].title}» er lagt i kalenderen` : `${chosen.length} hendelser er lagt i kalenderen`);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSaved(null), 5000);
    router.refresh();
  }

  return {
    text,
    rows,
    busy,
    error,
    saved,
    canPaste,
    reading,
    fileInput,
    edit,
    setText,
    paste,
    onPaste,
    onDrop,
    analyse,
    analyseFile,
    update,
    back,
    save,
  };
}
