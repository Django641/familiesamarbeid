"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { FileText, Loader2, Trash2, Upload } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { DOCUMENT_CATEGORIES } from "@/lib/config";
import { createClient } from "@/lib/supabase/client";
import type { DocumentRow } from "@/lib/types";
import { cn, formatBytes, formatDateTime } from "@/lib/utils";

const BUCKET = "family-files";

/** Storage-nøkler tåler ikke alltid æøå o.l. — gjør om til ASCII (originalnavnet lagres i tabellen). */
function storageSafeName(name: string): string {
  return name
    .replace(/æ/g, "ae").replace(/Æ/g, "Ae").replace(/ø/g, "o").replace(/Ø/g, "O").replace(/å/g, "a").replace(/Å/g, "A")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .slice(-120);
}
const MAX_BYTES = 25 * 1024 * 1024;

/**
 * Delte filer i privat Supabase Storage-bucket. Sti: <household_id>/<uuid>-<navn>.
 * Åpning skjer via kortlevde signerte URL-er (60 s).
 */
export function DocumentList({ householdId, documents }: { householdId: string; documents: DocumentRow[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [local, setLocal] = useState(documents);
  const [category, setCategory] = useState("annet");
  const [filter, setFilter] = useState("alle");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => setLocal(documents), [documents]);
  const refresh = () => startTransition(() => router.refresh());

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    const supabase = createClient();
    for (const file of Array.from(files)) {
      if (file.size > MAX_BYTES) {
        setError(`«${file.name}» er større enn 25 MB.`);
        continue;
      }
      const safeName = storageSafeName(file.name);
      const path = `${householdId}/${crypto.randomUUID()}-${safeName}`;
      const { error: upError } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type || undefined });
      if (upError) {
        setError(`Klarte ikke å laste opp «${file.name}».`);
        continue;
      }
      const { error: dbError } = await supabase.from("documents").insert({
        household_id: householdId,
        name: file.name,
        storage_path: path,
        mime_type: file.type || null,
        size_bytes: file.size,
        category,
      });
      if (dbError) {
        await supabase.storage.from(BUCKET).remove([path]);
        setError(`Klarte ikke å lagre «${file.name}».`);
      }
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
    refresh();
  }

  async function open(doc: DocumentRow) {
    // Åpne fanen synkront (ellers blokkerer iOS popup), og sett URL når den er klar.
    const win = window.open("", "_blank");
    const { data, error: urlError } = await createClient().storage.from(BUCKET).createSignedUrl(doc.storage_path, 60);
    if (urlError || !data) {
      win?.close();
      setError("Klarte ikke å åpne filen.");
      return;
    }
    if (win) win.location.href = data.signedUrl;
    else window.location.href = data.signedUrl;
  }

  async function remove(doc: DocumentRow) {
    if (!window.confirm(`Slette «${doc.name}»?`)) return;
    setLocal((prev) => prev.filter((d) => d.id !== doc.id));
    const supabase = createClient();
    const { error: dbError } = await supabase.from("documents").delete().eq("id", doc.id);
    if (dbError) {
      setLocal((prev) => [doc, ...prev]);
      setError("Klarte ikke å slette.");
      return;
    }
    await supabase.storage.from(BUCKET).remove([doc.storage_path]);
    refresh();
  }

  const visible = filter === "alle" ? local : local.filter((d) => d.category === filter);
  const labelFor = (v: string) => DOCUMENT_CATEGORIES.find((c) => c.value === v)?.label ?? v;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-2 gap-2">
          <Select aria-label="Kategori for nye filer" value={category} onChange={(e) => setCategory(e.target.value)}>
            {DOCUMENT_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>
          <label
            className={cn(
              "flex h-12 cursor-pointer items-center justify-center gap-2 rounded-xl bg-[var(--color-primary)] px-4 font-medium text-[var(--color-primary-foreground)] focus-within:ring-2 focus-within:ring-[var(--color-primary)] focus-within:ring-offset-2",
              uploading && "opacity-60"
            )}
          >
            {uploading ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <Upload className="h-5 w-5" aria-hidden />}
            {uploading ? "Laster opp …" : "Last opp"}
            <input
              ref={fileRef}
              type="file"
              multiple
              className="sr-only"
              disabled={uploading}
              onChange={(e) => upload(e.target.files)}
            />
          </label>
        </div>
        <p className="text-xs text-[var(--color-muted)]">
          PDF, bilder, skjemaer — maks 25 MB per fil. Bare dere to har tilgang.
        </p>
      </div>

      <Select aria-label="Vis kategori" value={filter} onChange={(e) => setFilter(e.target.value)}>
        <option value="alle">Alle kategorier</option>
        {DOCUMENT_CATEGORIES.map((c) => (
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
      </Select>

      {error ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {error}
        </p>
      ) : null}

      {visible.length === 0 ? (
        <p className="mt-4 text-center text-sm text-[var(--color-muted)]">Ingen dokumenter her ennå.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {visible.map((d) => (
            <li key={d.id}>
              <Card>
                <CardContent className="flex items-center gap-2 p-2">
                  <button
                    type="button"
                    onClick={() => open(d)}
                    className="flex min-h-11 min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    <FileText className="h-6 w-6 shrink-0 text-[var(--color-primary)]" aria-hidden />
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{d.name}</span>
                      <span className="block text-xs text-[var(--color-muted)]">
                        {labelFor(d.category)} · {formatDateTime(d.created_at)}
                        {d.size_bytes ? ` · ${formatBytes(d.size_bytes)}` : ""}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(d)}
                    aria-label={`Slett ${d.name}`}
                    className="flex h-11 w-11 items-center justify-center text-[var(--color-muted)] hover:text-[var(--color-danger)]"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
