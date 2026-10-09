// Klientkode: gjør et bilde/PDF klart for AI-tolkning.
//
// Vanlige bilder (JPEG/PNG/WebP/GIF) under 3,5 MB sendes uendret — Claude leser dem
// direkte, og vi unngår canvas-omkoding, som i Safari kan gi et helt hvitt bilde
// (f.eks. Mac-skjermbilder med Display P3-fargeprofil). Bare HEIC og store bilder
// tegnes om til JPEG med maks 2000 px på lengste side. Vercel tar maks 4,5 MB per
// kall, og Claude tar maks 5 MB per bilde (base64 gjør fila ca. 4/3 større).

const MAX_EDGE = 2000;
const MAX_PDF_BYTES = 4 * 1024 * 1024;
const MAX_PASSTHROUGH_BYTES = 3.5 * 1024 * 1024;
const PASSTHROUGH_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_CLAUDE_EDGE = 8000; // Claude avviser bilder med en side over 8000 px

export async function prepareUpload(file: File): Promise<File> {
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
    if (file.size > MAX_PDF_BYTES) throw new Error("PDF-en er for stor (maks 4 MB). Ta et skjermbilde av siden i stedet.");
    return file.type === "application/pdf" ? file : new File([file], file.name, { type: "application/pdf" });
  }
  if (!file.type.startsWith("image/") && !/\.(heic|heif|jpe?g|png|webp|gif)$/i.test(file.name)) {
    throw new Error("Velg et bilde eller en PDF.");
  }
  if (PASSTHROUGH_TYPES.includes(file.type) && file.size <= MAX_PASSTHROUGH_BYTES && (await fitsClaude(file))) {
    return file;
  }

  const canvas = await drawScaled(file);
  try {
    if (looksBlank(canvas)) {
      throw new Error("Klarte ikke å lese bildet her. Ta et skjermbilde av det i stedet, eller lim inn teksten.");
    }
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (!blob) throw new Error("Klarte ikke å lese bildet.");
    return new File([blob], "bilde.jpg", { type: "image/jpeg" });
  } finally {
    canvas.width = 0; // frigjør lerretsminnet (viktig på iPhone)
    canvas.height = 0;
  }
}

/** Lange skjermbilder (f.eks. 1170 × 9000) må skaleres; ellers kan de sendes som de er. */
async function fitsClaude(file: File): Promise<boolean> {
  if (typeof createImageBitmap !== "function") return true; // ukjent: la serveren/Claude avgjøre
  try {
    const bitmap = await createImageBitmap(file);
    const ok = Math.max(bitmap.width, bitmap.height) <= MAX_CLAUDE_EDGE;
    bitmap.close();
    return ok;
  } catch {
    return true; // kan ikke måle her — Claude kan som regel lese fila likevel
  }
}

/**
 * Kopierer innholdet i en fil fra en lim inn-/slipp-hendelse. Safari gjør slike filer
 * uleselige når hendelsen er ferdig, så lesingen må startes mens hendelsen pågår.
 */
export function snapshotFile(file: File): Promise<File> {
  const read = file.arrayBuffer(); // startes synkront, inne i hendelsen
  return read.then((buf) => new File([buf], file.name || "utklipp", { type: file.type }));
}

async function drawScaled(file: File): Promise<HTMLCanvasElement> {
  const source = await decode(file);
  try {
    const width = "naturalWidth" in source ? source.naturalWidth : source.width;
    const height = "naturalHeight" in source ? source.naturalHeight : source.height;
    if (!width || !height) throw new Error("Klarte ikke å åpne bildet. Prøv et skjermbilde i stedet.");
    const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Klarte ikke å lese bildet.");
    ctx.fillStyle = "#fff"; // gjennomsiktige PNG-er får hvit bakgrunn i JPEG
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    if ("close" in source) source.close();
  }
}

/** createImageBitmap dekoder ferdig før tegning; <img> er reserve (f.eks. HEIC i eldre Safari). */
async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch {
      // faller tilbake til <img>
    }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Klarte ikke å åpne bildet. Prøv et skjermbilde i stedet."));
      img.src = url;
    });
  } finally {
    // Bildet er dekodet når onload har kjørt; URL-en trengs ikke lenger.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

/**
 * Ensfarget lerret = noe gikk galt i dekodingen (Safari kan gi helt hvitt). Tegner
 * ned til 64 × 64 og sjekker alle punktene, så både stående og liggende bilder dekkes.
 */
function looksBlank(canvas: HTMLCanvasElement): boolean {
  const small = document.createElement("canvas");
  small.width = 64;
  small.height = 64;
  const ctx = small.getContext("2d");
  if (!ctx) return false;
  ctx.drawImage(canvas, 0, 0, 64, 64);
  const { data } = ctx.getImageData(0, 0, 64, 64);
  const [r, g, b] = [data[0], data[1], data[2]];
  for (let i = 4; i < data.length; i += 4) {
    if (Math.abs(data[i] - r) > 6 || Math.abs(data[i + 1] - g) > 6 || Math.abs(data[i + 2] - b) > 6) return false;
  }
  return true;
}
