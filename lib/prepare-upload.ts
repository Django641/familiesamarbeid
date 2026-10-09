// Klientkode: gjør et bilde/PDF klart for AI-tolkning.
// Bilder (også HEIC fra iPhone, som Safari kan dekode) tegnes om til JPEG med
// maks 2000 px på lengste side — det holder godt for å lese tekst, og gir små
// filer (Vercel tar maks 4,5 MB per kall; Claude leser ikke HEIC).

const MAX_EDGE = 2000;
const MAX_PDF_BYTES = 4 * 1024 * 1024;

export async function prepareUpload(file: File): Promise<File> {
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
    if (file.size > MAX_PDF_BYTES) throw new Error("PDF-en er for stor (maks 4 MB). Ta et skjermbilde av siden i stedet.");
    return file.type === "application/pdf" ? file : new File([file], file.name, { type: "application/pdf" });
  }
  if (!file.type.startsWith("image/") && !/\.(heic|heif|jpe?g|png|webp)$/i.test(file.name)) {
    throw new Error("Velg et bilde eller en PDF.");
  }

  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Klarte ikke å lese bildet.");
    ctx.fillStyle = "#fff"; // gjennomsiktige PNG-er får hvit bakgrunn i JPEG
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (!blob) throw new Error("Klarte ikke å lese bildet.");
    return new File([blob], "bilde.jpg", { type: "image/jpeg" });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** decode() har vært ustabil i enkelte WebKit-versjoner — fall tilbake til onload. */
function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const fail = () => reject(new Error("Klarte ikke å åpne bildet. Prøv et skjermbilde i stedet."));
    img.onload = () => resolve(img);
    img.onerror = fail;
    img.src = url;
    img.decode().then(() => resolve(img), () => undefined); // onload/onerror avgjør hvis decode svikter
  });
}
