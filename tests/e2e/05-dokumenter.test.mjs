// Dokumenter: opplasting direkte til (falsk) Vercel Blob → lista → åpne via /api/filer/[id] → slett.
// Testserveren kjører UTEN BLOB_WEBHOOK_PUBLIC_KEY — opplasting skal virke likevel (feilen 9. okt:
// «Failed to retrieve the presigned URL»).

import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { alert, blobFiles, launch, loggedIn, trackErrors, waitUntil } from "./helpers.mjs";

let browser;
let context;
let page;
let errors;

const PDF = Buffer.from("%PDF-1.4\n% Timeplan høst\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n");
const PDF_NAME = "Timeplan høst.pdf";
const HTML_NAME = "lenke.html";
const PATH_RE = /^dokumenter\/[0-9a-f-]{36}-Timeplan_host\.pdf$/;

before(async () => {
  browser = await launch();
  ({ context, page } = await loggedIn(browser));
  errors = trackErrors(page);
});

after(async () => {
  try {
    assert.deepEqual(errors, [], "ingen JavaScript-feil i siden");
  } finally {
    await browser?.close();
  }
});

const row = (name) => page.getByRole("listitem").filter({ has: page.getByRole("button", { name: `Valg for ${name}` }) });

async function upload(files, category) {
  const chooser = page.waitForEvent("filechooser");
  await page.getByText("Last opp fil eller bilde").click();
  await (await chooser).setFiles(files);
  const sheet = page.getByRole("dialog");
  await sheet.waitFor();
  if (category) await sheet.getByRole("radio", { name: category }).click();
  await sheet.getByRole("button", { name: "Last opp", exact: true }).click();
  // Vent på rad i lista — eller feilmelding i opplastingslista (vis den, så feilen er lett å forstå).
  const name = files[0].name;
  const outcome = await Promise.race([
    row(name).waitFor().then(() => null),
    alert(page).waitFor().then(() => alert(page).textContent()),
  ]);
  assert.equal(outcome, null, `opplastingen av ${name} feilet i appen: «${outcome}»`);
}

/** Id-en til et dokument: «Åpne» kaller window.open(/api/filer/<id>). */
async function documentUrl(name) {
  const navigation = context.waitForEvent("request", (r) => r.isNavigationRequest() && r.url().includes("/api/filer/"));
  const popup = context.waitForEvent("page");
  await row(name).getByRole("button").first().click();
  const url = new URL((await navigation).url());
  await (await popup).close();
  assert.match(url.pathname, /^\/api\/filer\/[0-9a-f-]{36}$/);
  return url.pathname;
}

test("/api/filer/upload gir presignedUrlPayload uten BLOB_WEBHOOK_PUBLIC_KEY", async () => {
  const res = await page.request.post("/api/filer/upload", {
    data: {
      type: "blob.generate-presigned-url",
      payload: { pathname: "dokumenter/123e4567-e89b-12d3-a456-426614174000-test.pdf", clientPayload: null, multipart: false },
    },
  });
  assert.equal(res.status(), 200, await res.text());
  const body = await res.json();
  assert.ok(body.presignedUrlPayload?.delegationToken, JSON.stringify(body));
  assert.ok(body.presignedUrlPayload?.signature);
});

test("/api/filer/upload avviser ugyldig sti og webhook-kall", async () => {
  const badPath = await page.request.post("/api/filer/upload", {
    data: { type: "blob.generate-presigned-url", payload: { pathname: "../hemmelig.pdf", clientPayload: null, multipart: false } },
  });
  assert.equal(badPath.status(), 400);
  const webhook = await page.request.post("/api/filer/upload", { data: { type: "blob.upload-completed", payload: {} } });
  assert.equal(webhook.status(), 400);
});

test("last opp PDF → vises i lista med kategori", async () => {
  await page.goto("/dokumenter");
  await upload([{ name: PDF_NAME, mimeType: "application/pdf", buffer: PDF }], "Skole/barnehage");
  await row(PDF_NAME).waitFor();
  assert.match(await row(PDF_NAME).textContent(), /Skole\/barnehage/);
  // Ingen feilmelding i opplastingslista.
  assert.equal(await page.getByRole("list", { name: "Opplastinger" }).count(), 0);

  const stored = (await blobFiles()).find((f) => PATH_RE.test(f.pathname));
  assert.ok(stored, "fila ligger i Blob med ASCII-trygg sti");
  assert.equal(stored.size, PDF.length);
  assert.equal(stored.contentType, "application/pdf");
  assert.equal(stored.access, "private", "dokumenter lastes opp som private i Blob");

  // Etter reload (fra databasen, ikke bare lokal state).
  await page.reload();
  await row(PDF_NAME).waitFor();
});

test("åpne PDF via /api/filer/[id]: privat, inline, riktig innhold, ETag/304", async () => {
  const url = await documentUrl(PDF_NAME);
  const res = await page.request.get(url);
  assert.equal(res.status(), 200);
  assert.equal(res.headers()["content-type"], "application/pdf");
  assert.equal(res.headers()["cache-control"], "private, no-cache");
  assert.match(res.headers()["content-disposition"], /^inline; filename\*=UTF-8''Timeplan%20h%C3%B8st\.pdf/);
  assert.ok((await res.body()).equals(PDF), "samme bytes som ble lastet opp");

  const etag = res.headers()["etag"];
  assert.ok(etag);
  const again = await page.request.get(url, { headers: { "if-none-match": etag } });
  assert.equal(again.status(), 304);

  const download = await page.request.get(`${url}?last-ned`);
  assert.match(download.headers()["content-disposition"], /^attachment;/);
});

test("HTML-fil lastes ned i sandkasse, vises aldri inline", async () => {
  await upload([{ name: HTML_NAME, mimeType: "text/html", buffer: Buffer.from("<script>alert(1)</script>") }]);
  await row(HTML_NAME).waitFor();
  const url = await documentUrl(HTML_NAME);
  const res = await page.request.get(url);
  assert.equal(res.headers()["content-type"], "application/octet-stream");
  assert.match(res.headers()["content-disposition"], /^attachment;/);
  assert.match(res.headers()["content-security-policy"], /sandbox/);
});

test("slett → borte fra lista, fra Blob og fra /api/filer/[id]", async () => {
  const url = await documentUrl(PDF_NAME);
  page.once("dialog", (dialog) => dialog.accept()); // «Slette … for godt?»
  await page.getByRole("button", { name: `Valg for ${PDF_NAME}` }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Slett" }).click();
  await row(PDF_NAME).waitFor({ state: "detached" });
  await waitUntil(async () => !(await blobFiles()).some((f) => PATH_RE.test(f.pathname)), "fila slettes i Blob");
  assert.equal((await page.request.get(url)).status(), 404);
  await page.reload();
  await row(HTML_NAME).waitFor();
  assert.equal(await row(PDF_NAME).count(), 0);
});
