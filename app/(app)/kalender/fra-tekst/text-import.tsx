"use client";

import Link from "next/link";
import { Check, ClipboardPaste, Loader2, Paperclip, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Person } from "@/lib/types";

import { DraftReview } from "./draft-review";
import { useEventImport } from "./use-event-import";

type Import = ReturnType<typeof useEventImport>;

function ErrorText({ error }: { error: string | null }) {
  return error ? (
    <p role="alert" className="text-sm text-[var(--color-danger)]">
      {error}
    </p>
  ) : null;
}

/** Skjult filvelger + knappen (binders i hurtigfeltet, full knapp på siden). */
function FileButton({ imp, inline }: { imp: Import; inline: boolean }) {
  return (
    <>
      <input
        ref={imp.fileInput}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => imp.analyseFile(e.target.files?.[0])}
      />
      <Button
        type="button"
        variant="outline"
        size={inline ? "icon" : "default"}
        className={inline ? "h-12 w-12 shrink-0" : undefined}
        onClick={() => imp.fileInput.current?.click()}
        disabled={imp.busy}
        aria-label={inline ? "Legg ved bilde eller PDF" : undefined}
      >
        <Paperclip className="h-5 w-5" aria-hidden />
        {inline ? null : "Legg ved bilde eller PDF"}
      </Button>
    </>
  );
}

function InlineInput({ imp }: { imp: Import }) {
  const long = imp.text.length > 40 || imp.text.includes("\n");
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start gap-2">
        <Label htmlFor="hurtig" className="sr-only">
          Ny hendelse: skriv eller lim inn tekst
        </Label>
        <Textarea
          id="hurtig"
          onPaste={imp.onPaste}
          onDrop={imp.onDrop}
          onDragOver={(e) => e.preventDefault()}
          rows={long ? 5 : 1}
          className="min-h-12 flex-1 resize-none py-2.5"
          value={imp.text}
          maxLength={8000}
          onChange={(e) => imp.edit(e.target.value)}
          placeholder="Skriv eller lim inn …"
        />
        {imp.canPaste ? (
          <Button type="button" variant="outline" size="icon" className="h-12 w-12 shrink-0" onClick={imp.paste} disabled={imp.busy} aria-label="Lim inn fra utklippstavla">
            <ClipboardPaste className="h-5 w-5" aria-hidden />
          </Button>
        ) : null}
        <FileButton imp={imp} inline />
      </div>
      <ErrorText error={imp.error} />
      <p role="status" className={imp.saved ? "flex items-center gap-1.5 text-sm text-[var(--color-success)]" : "sr-only"}>
        {imp.saved ? (
          <>
            <Check className="h-4 w-4" aria-hidden /> {imp.saved}
          </>
        ) : null}
      </p>
      <div className="flex items-center justify-between gap-2">
        <Link href="/kalender/ny" className="flex min-h-11 items-center px-1 text-sm text-[var(--color-primary)] underline">
          Fyll ut selv
        </Link>
        <Button type="button" size="sm" onClick={imp.analyse} disabled={imp.busy || imp.text.trim().length < 3}>
          {imp.busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Sparkles className="h-4 w-4" aria-hidden />}
          {imp.busy ? (imp.reading === "fil" ? "Leser fila …" : "Leser …") : "Legg inn"}
        </Button>
      </div>
    </div>
  );
}

function PageInput({ imp }: { imp: Import }) {
  return (
    <div className="flex flex-col gap-3">
      <Label htmlFor="paste" className="sr-only">
        Tekst
      </Label>
      <Textarea
        id="paste"
        onPaste={imp.onPaste}
        onDrop={imp.onDrop}
        onDragOver={(e) => e.preventDefault()}
        rows={10}
        value={imp.text}
        onChange={(e) => imp.setText(e.target.value)}
        placeholder="F.eks.: «Hei! Foreldremøte for 4B tirsdag 21. oktober kl. 18 i aulaen. Husk å svare på Spond om dugnad lørdag.»"
      />
      <ErrorText error={imp.error} />
      <Button size="lg" onClick={imp.analyse} disabled={imp.busy || imp.text.trim().length < 3}>
        {imp.busy ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <Sparkles className="h-5 w-5" aria-hidden />}
        {imp.busy ? (imp.reading === "fil" ? "Leser fila …" : "Leser teksten …") : "Finn hendelser"}
      </Button>
      <FileButton imp={imp} inline={false} />
    </div>
  );
}

/**
 * Skriv eller lim inn tekst → AI foreslår hendelser → brukeren retter og lagrer.
 * `inline` er hurtigfeltet øverst i Kalender; `page` er egen side (brukes fra Beskjeder).
 * AI-forslag lagres aldri uten at de er vist og bekreftet.
 */
export function TextImport({
  people,
  initialText = "",
  variant = "page",
}: {
  people: Person[];
  initialText?: string;
  variant?: "page" | "inline";
}) {
  const inline = variant === "inline";
  const imp = useEventImport({ people, initialText, inline });

  if (imp.rows && imp.rows.length > 0) {
    return (
      <DraftReview
        rows={imp.rows}
        people={people}
        busy={imp.busy}
        error={imp.error}
        inline={inline}
        onUpdate={imp.update}
        onSave={imp.save}
        onBack={imp.back}
      />
    );
  }

  return inline ? <InlineInput imp={imp} /> : <PageInput imp={imp} />;
}
