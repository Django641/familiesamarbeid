"use client";

import { uploadPresigned } from "@vercel/blob/client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Download, ExternalLink, FileImage, FileSpreadsheet, FileText, MoreHorizontal, Search, Trash2, Upload, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetAction } from "@/components/ui/sheet";
import { DOCUMENT_CATEGORIES } from "@/lib/config";
import type { DocumentRow, Person } from "@/lib/types";
import { cn, formatBytes, osloDateKey, dayLabel } from "@/lib/utils";

import { deleteDocument, registerDocument, updateDocument } from "./actions";

type Upload = { key: string; name: string; progress: number; error?: string };

const labelFor = (v: string) => DOCUMENT_CATEGORIES.find((c) => c.value === v)?.label ?? v;

/** Blob-nøkler tåler ikke alltid æøå o.l. — ASCII i stien, originalnavnet lagres i databasen. */
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

function FileIcon({ doc }: { doc: DocumentRow }) {
  const type = doc.content_type ?? "";
  if (type.startsWith("image/")) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- privat fil via autentisert rute, ikke optimaliserbar
      <img src={`/api/filer/${doc.id}`} alt="" loading="lazy" className="h-11 w-11 shrink-0 rounded-xl object-cover" />
    );
  }
  const Icon = type.includes("sheet") || type.includes("excel") || type.includes("csv") ? FileSpreadsheet : type.includes("pdf") ? FileText : FileImage;
  return (
    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--color-bg)] text-[var(--color-primary)]" aria-hidden>
      <Icon className="h-6 w-6" />
    </span>
  );
}

export function DocumentLibrary({ documents, people }: { documents: DocumentRow[]; people: Person[] }) {
  const [local, setLocal] = useState(documents);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<string>("alle");
  const [pending, setPending] = useState<File[] | null>(null);
  const [uploadCategory, setUploadCategory] = useState("annet");
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [selected, setSelected] = useState<DocumentRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => setLocal(documents), [documents]);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const d of local) map.set(d.category, (map.get(d.category) ?? 0) + 1);
    return map;
  }, [local]);

  const q = query.trim().toLowerCase();
  const visible = local.filter(
    (d) => (filter === "alle" || d.category === filter) && (!q || d.name.toLowerCase().includes(q) || labelFor(d.category).toLowerCase().includes(q))
  );
  const todayKey = osloDateKey(new Date());
  const authorName = (uid: string | null) => people.find((p) => p.user_id === uid)?.name;

  function pick(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploadCategory(filter === "alle" ? "annet" : filter);
    setPending(Array.from(files));
  }

  async function startUpload() {
    const files = pending ?? [];
    const category = uploadCategory;
    setPending(null);
    if (fileRef.current) fileRef.current.value = "";
    setError(null);

    await Promise.all(
      files.map(async (file) => {
        const key = crypto.randomUUID();
        setUploads((prev) => [...prev, { key, name: file.name, progress: 0 }]);
        try {
          if (file.size > 50 * 1024 * 1024) throw new Error("Filen er større enn 50 MB.");
          const pathname = `dokumenter/${key}-${storageSafeName(file.name)}`;
          await uploadPresigned(pathname, file, {
            access: "private",
            handleUploadUrl: "/api/filer/upload",
            contentType: file.type || undefined,
            multipart: file.size > 20 * 1024 * 1024,
            onUploadProgress: ({ percentage }) =>
              setUploads((prev) => prev.map((u) => (u.key === key ? { ...u, progress: percentage } : u))),
          });
          const res = await registerDocument({ pathname, name: file.name, category });
          if (res.error) throw new Error(res.error);
          setUploads((prev) => prev.filter((u) => u.key !== key));
        } catch (e) {
          const message = e instanceof Error && e.message ? e.message : "Opplasting feilet.";
          setUploads((prev) => prev.map((u) => (u.key === key ? { ...u, error: message } : u)));
        }
      })
    );
  }

  function open(doc: DocumentRow, download = false) {
    setSelected(null);
    window.open(`/api/filer/${doc.id}${download ? "?last-ned" : ""}`, "_blank", "noopener");
  }

  async function rename(doc: DocumentRow) {
    const name = window.prompt("Nytt navn", doc.name)?.trim();
    if (!name || name === doc.name) return;
    setLocal((prev) => prev.map((d) => (d.id === doc.id ? { ...d, name } : d)));
    setSelected(null);
    const res = await updateDocument(doc.id, { name }).catch(() => ({ error: "Klarte ikke å gi nytt navn." }));
    if (res.error) setError(res.error);
  }

  async function recategorize(doc: DocumentRow, category: string) {
    setLocal((prev) => prev.map((d) => (d.id === doc.id ? { ...d, category } : d)));
    setSelected({ ...doc, category });
    const res = await updateDocument(doc.id, { category }).catch(() => ({ error: "Klarte ikke å flytte filen." }));
    if (res.error) setError(res.error);
  }

  async function remove(doc: DocumentRow) {
    if (!window.confirm(`Slette «${doc.name}» for godt?`)) return;
    setSelected(null);
    setLocal((prev) => prev.filter((d) => d.id !== doc.id));
    const res = await deleteDocument(doc.id).catch(() => ({ error: "Klarte ikke å slette." }));
    if (res.error) {
      setLocal((prev) => [doc, ...prev]);
      setError(res.error);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <label className="flex h-14 cursor-pointer items-center justify-center gap-2 rounded-2xl bg-[var(--color-primary)] text-base font-semibold text-[var(--color-primary-foreground)] shadow-sm focus-within:ring-2 focus-within:ring-[var(--color-primary)] focus-within:ring-offset-2 active:opacity-90">
        <Upload className="h-5 w-5" aria-hidden />
        Last opp fil eller bilde
        <input ref={fileRef} type="file" multiple className="sr-only" onChange={(e) => pick(e.target.files)} />
      </label>

      {uploads.length > 0 ? (
        <ul className="flex flex-col gap-2" aria-label="Opplastinger">
          {uploads.map((u) => (
            <li key={u.key} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate">{u.name}</span>
                {u.error ? (
                  <button
                    type="button"
                    aria-label="Fjern"
                    onClick={() => setUploads((prev) => prev.filter((x) => x.key !== u.key))}
                    className="flex h-11 w-11 items-center justify-center"
                  >
                    <X className="h-4 w-4" aria-hidden />
                  </button>
                ) : (
                  <span className="tabular-nums text-[var(--color-muted)]">{Math.round(u.progress)} %</span>
                )}
              </div>
              {u.error ? (
                <p role="alert" className="text-xs text-[var(--color-danger)]">
                  {u.error}
                </p>
              ) : (
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--color-bg)]">
                  <div className="h-full rounded-full bg-[var(--color-primary)] transition-[width]" style={{ width: `${u.progress}%` }} />
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-[var(--color-muted)]" aria-hidden />
        <Input
          type="search"
          aria-label="Søk i dokumenter"
          placeholder="Søk"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      <div role="group" aria-label="Kategori" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {[{ value: "alle", label: "Alle" }, ...DOCUMENT_CATEGORIES].map((c) => {
          const n = c.value === "alle" ? local.length : (counts.get(c.value) ?? 0);
          if (c.value !== "alle" && n === 0 && filter !== c.value) return null;
          return (
            <button
              key={c.value}
              type="button"
              aria-pressed={filter === c.value}
              onClick={() => setFilter(c.value)}
              className={cn(
                "flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm font-medium",
                filter === c.value
                  ? "border-transparent bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
                  : "border-[var(--color-border)] bg-[var(--color-surface)]"
              )}
            >
              {c.label}
              <span className="text-xs opacity-70">{n}</span>
            </button>
          );
        })}
      </div>

      {error ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {error}
        </p>
      ) : null}

      {visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--color-border)] px-6 py-10 text-center">
          <p className="text-3xl" aria-hidden>
            📂
          </p>
          <p className="mt-2 font-medium">{local.length === 0 ? "Ingen dokumenter ennå" : "Ingen treff"}</p>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            {local.length === 0
              ? "Last opp timeplaner, skjemaer, reisedokumenter og bilder dere begge trenger."
              : "Prøv et annet søk eller en annen kategori."}
          </p>
        </div>
      ) : (
        <ul className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm">
          {visible.map((d) => {
            const by = authorName(d.created_by);
            return (
              <li key={d.id} className="flex items-center border-b border-[var(--color-border)] last:border-b-0">
                <button type="button" onClick={() => open(d)} className="flex min-h-16 min-w-0 flex-1 items-center gap-3 py-2 pl-3 text-left">
                  <FileIcon doc={d} />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{d.name}</span>
                    <span className="block truncate text-xs text-[var(--color-muted)]">
                      {labelFor(d.category)} · {dayLabel(osloDateKey(d.created_at), todayKey)}
                      {d.size_bytes ? ` · ${formatBytes(d.size_bytes)}` : ""}
                      {by ? ` · ${by}` : ""}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelected(d)}
                  aria-label={`Valg for ${d.name}`}
                  className="flex h-16 w-12 shrink-0 items-center justify-center text-[var(--color-muted)]"
                >
                  <MoreHorizontal className="h-5 w-5" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <Sheet open={pending !== null} onClose={() => setPending(null)} title={pending?.length === 1 ? "Last opp fil" : `Last opp ${pending?.length ?? 0} filer`}>
        <div className="flex flex-col gap-4">
          <ul className="flex flex-col gap-1 text-sm">
            {(pending ?? []).map((f) => (
              <li key={f.name + f.size} className="flex justify-between gap-2 rounded-xl bg-[var(--color-bg)] px-3 py-2">
                <span className="truncate">{f.name}</span>
                <span className="shrink-0 text-[var(--color-muted)]">{formatBytes(f.size)}</span>
              </li>
            ))}
          </ul>
          <CategoryChips value={uploadCategory} onChange={setUploadCategory} />
          <Button size="lg" onClick={startUpload}>
            <Upload className="h-5 w-5" aria-hidden /> Last opp
          </Button>
        </div>
      </Sheet>

      <Sheet open={selected !== null} onClose={() => setSelected(null)} title={selected?.name ?? "Dokument"}>
        {selected ? (
          <div className="flex flex-col gap-1">
            <SheetAction icon={<ExternalLink className="h-4 w-4" />} label="Åpne" onClick={() => open(selected)} />
            <SheetAction icon={<Download className="h-4 w-4" />} label="Last ned" onClick={() => open(selected, true)} />
            <SheetAction icon={<FileText className="h-4 w-4" />} label="Gi nytt navn" onClick={() => rename(selected)} />
            <div className="my-2 px-1">
              <p className="mb-2 text-sm font-medium">Kategori</p>
              <CategoryChips value={selected.category} onChange={(c) => recategorize(selected, c)} />
            </div>
            <SheetAction icon={<Trash2 className="h-4 w-4" />} label="Slett" danger onClick={() => remove(selected)} />
          </div>
        ) : null}
      </Sheet>
    </div>
  );
}

function CategoryChips({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div role="radiogroup" aria-label="Kategori" className="flex flex-wrap gap-2">
      {DOCUMENT_CATEGORIES.map((c) => (
        <button
          key={c.value}
          type="button"
          role="radio"
          aria-checked={value === c.value}
          onClick={() => onChange(c.value)}
          className={cn(
            "min-h-11 rounded-full border px-4 text-sm font-medium",
            value === c.value
              ? "border-transparent bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
              : "border-[var(--color-border)] bg-[var(--color-surface)]"
          )}
        >
          {c.label}
        </button>
      ))}
    </div>
  );
}
