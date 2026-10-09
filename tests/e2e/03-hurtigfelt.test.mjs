// Hurtigfeltet øverst i Kalender: tekst, bilde og PDF → falsk Claude → forslag → lagre.
// Sjekker hva appen faktisk sender til Claude (bildet skal ikke være blankt, PDF som document).
// Desktop-Chromium med utklippstavle-tilgang (⌘V/Ctrl+V fra Mac-en er hovedbruken her).

import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";

import { OWNER } from "./fixtures.mjs";
import {
  aiEvent,
  aiRequests,
  alert,
  DESKTOP,
  inspectImage,
  isBlue,
  isRed,
  lastAiRequest,
  launch,
  loggedIn,
  makeTestPng,
  nextAiResponse,
  osloDay,
  resetAi,
  trackErrors,
  waitUntil,
} from "./helpers.mjs";

let browser;
let page;
let errors;

const FIELD = "Ny hendelse: skriv eller lim inn tekst";
const field = () => page.getByLabel(FIELD);
const titleInput = () => page.getByRole("textbox", { name: "Tittel" });
/** En liten, gyldig nok PDF (den falske Claude leser den ikke, men sjekker byte for byte). */
const PDF = Buffer.from("%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n");

before(async () => {
  browser = await launch();
  ({ page } = await loggedIn(browser, OWNER, { device: DESKTOP, permissions: ["clipboard-read", "clipboard-write"] }));
  errors = trackErrors(page);
});

after(async () => {
  try {
    assert.deepEqual(errors, [], "ingen JavaScript-feil i siden");
  } finally {
    await browser?.close();
  }
});

beforeEach(async () => {
  await resetAi();
  await page.goto("/kalender");
  await field().waitFor();
});

/** Venter på at forslaget vises, og går tilbake til tekstfeltet. */
async function expectProposalAndGoBack(title = "Fra fil") {
  await titleInput().waitFor();
  assert.equal(await titleInput().inputValue(), title);
  await page.getByRole("button", { name: "Tilbake til teksten" }).click();
  await field().waitFor();
}

/** Limer inn i feltet med en syntetisk paste-hendelse (for filer, som ikke kan legges på ekte utklippstavle). */
async function dispatchPaste({ text, files = [] }) {
  return field().evaluate(
    (el, { text, files }) => {
      const dt = new DataTransfer();
      if (text) dt.setData("text/plain", text);
      for (const f of files) {
        const bytes = Uint8Array.from(atob(f.base64), (c) => c.charCodeAt(0));
        dt.items.add(new File([bytes], f.name, { type: f.type }));
      }
      const event = new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true });
      el.dispatchEvent(event);
      return event.defaultPrevented;
    },
    { text, files }
  );
}

test("tekst → AI-forslag → lagre → hendelsen står i kalenderen", async () => {
  const date = osloDay(1);
  await nextAiResponse({
    kind: "events",
    output: {
      events: [aiEvent({ title: "Konsert Oslo Spektrum", date, start_time: "20:00", location: "Oslo Spektrum", people: [OWNER.name] })],
      explanation: "",
    },
  });
  await field().fill("Konsert i morgen kl 20 Oslo Spektrum");
  await page.getByRole("button", { name: "Legg inn" }).click();

  await titleInput().waitFor();
  assert.equal(await titleInput().inputValue(), "Konsert Oslo Spektrum");
  assert.equal(await page.getByRole("textbox", { name: "Dato" }).inputValue(), date);
  assert.equal(await page.getByRole("textbox", { name: "Klokkeslett" }).inputValue(), "20:00");

  const sent = await lastAiRequest();
  assert.equal(sent.kind, "events");
  assert.equal(sent.model, "claude-opus-5-5");
  assert.equal(sent.effort, "low");
  assert.equal(sent.attachments.length, 0);
  assert.match(sent.text, /Konsert i morgen kl 20 Oslo Spektrum/);
  assert.match(sent.system, /Mia \(barn\)/, "familien er med i systemprompten");
  assert.match(sent.system, new RegExp(`Den som skriver er ${OWNER.name}`));

  await page.getByRole("button", { name: "Lagre 1 i kalenderen" }).click();
  await page.getByRole("status").filter({ hasText: "«Konsert Oslo Spektrum» er lagt i kalenderen" }).waitFor();
  await page.getByRole("button", { name: /Konsert Oslo Spektrum 20:00/ }).first().waitFor();
});

test("tomt AI-svar viser forklaringen fra Claude", async () => {
  await nextAiResponse({ output: { events: [], explanation: "Teksten inneholder ingen datoer." } });
  await field().fill("Hei, hvordan går det?");
  await page.getByRole("button", { name: "Legg inn" }).click();
  assert.equal(
    await alert(page).textContent(),
    "Fant ingen hendelser med dato i teksten. Teksten inneholder ingen datoer."
  );
});

test("feil fra Claude gir norsk melding, ikke rå feil", async () => {
  await nextAiResponse({ status: 400, errorType: "invalid_request_error", error: "Could not process image" });
  await field().fill("Konsert i morgen kl 20");
  await page.getByRole("button", { name: "Legg inn" }).click();
  assert.match(await alert(page).textContent(), /AI-en klarte ikke å lese dette/);
});

test("⌘V med skjermbilde sender bildet (ikke blankt) til Claude", async () => {
  await nextAiResponse({ output: { events: [aiEvent({ title: "Fra fil" })], explanation: "" } });
  const png = await makeTestPng(page);
  // Ekte utklippstavle + ekte tastetrykk (som ⌘V på Mac).
  await page.evaluate(async (base64) => {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    await navigator.clipboard.write([new ClipboardItem({ "image/png": new Blob([bytes], { type: "image/png" }) })]);
  }, png);
  await field().focus();
  await page.keyboard.press("ControlOrMeta+V");
  await expectProposalAndGoBack();

  const sent = await lastAiRequest();
  assert.equal(sent.attachments.length, 1);
  const [image] = sent.attachments;
  assert.equal(image.type, "image");
  assert.equal(sent.effort, "medium");
  const seen = await inspectImage(page, image.data, image.media_type);
  assert.equal(seen.width, 600);
  assert.ok(seen.distinctColors > 3, `bildet ser ensfarget ut: ${JSON.stringify(seen)}`);
  assert.ok(isRed(seen.topLeft), `forventet rødt øverst til venstre, fikk ${seen.topLeft}`);
  assert.ok(isBlue(seen.bottomRight), `forventet blått nederst til høyre, fikk ${seen.bottomRight}`);
});

test("lite skjermbilde sendes uendret (ingen canvas-omkoding): PNG, byte for byte likt originalen", async () => {
  await nextAiResponse({ output: { events: [aiEvent({ title: "Fra fil" })], explanation: "" } });
  const png = await makeTestPng(page);
  assert.equal(await dispatchPaste({ files: [{ name: "skjermbilde.png", type: "image/png", base64: png }] }), true);
  await expectProposalAndGoBack();

  const [image] = (await lastAiRequest()).attachments;
  assert.equal(image.media_type, "image/png");
  assert.equal(image.data, png, "bildet når Claude byte for byte likt originalen");
});

test("veldig langt skjermbilde skaleres ned til JPEG og er fortsatt ikke blankt", async () => {
  await nextAiResponse({ output: { events: [aiEvent({ title: "Fra fil" })], explanation: "" } });
  const png = await makeTestPng(page, { width: 8400, height: 1200 }); // over Claudes grense på 8000 px
  assert.equal(await dispatchPaste({ files: [{ name: "skjermbilde.png", type: "image/png", base64: png }] }), true);
  await expectProposalAndGoBack();

  const [image] = (await lastAiRequest()).attachments;
  assert.equal(image.media_type, "image/jpeg");
  const seen = await inspectImage(page, image.data, image.media_type);
  assert.equal(seen.width, 2000);
  assert.ok(isRed(seen.topLeft) && isBlue(seen.bottomRight), `feil innhold: ${JSON.stringify(seen)}`);
});

test("stort bilde (over 3,5 MB) omkodes til JPEG på maks 2000 px og er ikke blankt", async () => {
  await nextAiResponse({ output: { events: [aiEvent({ title: "Fra fil" })], explanation: "" } });
  const png = await makeTestPng(page, { width: 2400, height: 1800, noise: true });
  assert.ok(Buffer.from(png, "base64").length > 3.5 * 1024 * 1024, "testbildet må være over passthrough-grensen");
  assert.equal(await dispatchPaste({ files: [{ name: "stort.png", type: "image/png", base64: png }] }), true);
  await expectProposalAndGoBack();

  const [image] = (await lastAiRequest()).attachments;
  assert.equal(image.media_type, "image/jpeg");
  assert.ok(Buffer.from(image.data, "base64").length < 3.5 * 1024 * 1024);
  const seen = await inspectImage(page, image.data, image.media_type);
  assert.ok(Math.max(seen.width, seen.height) <= 2000, `for stort: ${seen.width}x${seen.height}`);
  assert.ok(seen.distinctColors > 3, `bildet ser ensfarget ut: ${JSON.stringify(seen)}`);
  assert.ok(isRed(seen.topLeft) && isBlue(seen.bottomRight), `feil innhold: ${JSON.stringify(seen)}`);
});

test("stort ensfarget bilde stoppes med feilmelding og sendes ikke til Claude", async () => {
  const png = await makeTestPng(page, { width: 8400, height: 600, plain: true }); // omkodes, og er blankt
  await dispatchPaste({ files: [{ name: "blankt.png", type: "image/png", base64: png }] });
  await alert(page).waitFor();
  assert.match(await alert(page).textContent(), /Klarte ikke å lese bildet her/);
  assert.equal((await aiRequests()).length, 0, "ingenting sendt til Claude");
});

test("tekst + bilde på utklippstavla (Outlook/Word) limer inn teksten, uten AI-kall", async () => {
  const png = await makeTestPng(page, { width: 200, height: 100 });
  const text = "Juleavslutning 18. desember kl 17 i gymsalen";
  await page.evaluate(
    async ({ base64, text }) => {
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/plain": new Blob([text], { type: "text/plain" }),
          "image/png": new Blob([bytes], { type: "image/png" }),
        }),
      ]);
    },
    { base64: png, text }
  );
  // Tastatur (⌘V) …
  await field().focus();
  await page.keyboard.press("ControlOrMeta+V");
  await waitUntil(async () => (await field().inputValue()) === text, "teksten limes inn med ⌘V");
  // … og Lim inn-knappen.
  await field().fill("");
  await page.getByRole("button", { name: "Lim inn fra utklippstavla" }).click();
  await waitUntil(async () => (await field().inputValue()) === text, "teksten limes inn med knappen");
  assert.equal((await aiRequests()).length, 0, "ingen AI-kall når det finnes tekst");
});

test("Lim inn-knappen med bare bilde på utklippstavla sender bildet", async () => {
  await nextAiResponse({ output: { events: [aiEvent({ title: "Fra fil" })], explanation: "" } });
  const png = await makeTestPng(page);
  await page.evaluate(async (base64) => {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    await navigator.clipboard.write([new ClipboardItem({ "image/png": new Blob([bytes], { type: "image/png" }) })]);
  }, png);
  await page.getByRole("button", { name: "Lim inn fra utklippstavla" }).click();
  await expectProposalAndGoBack();
  const [image] = (await lastAiRequest()).attachments;
  const seen = await inspectImage(page, image.data, image.media_type);
  assert.ok(isRed(seen.topLeft), JSON.stringify(seen));
});

test("PDF kopiert i Finder (fil + filnavn som tekst) tolkes som dokument", async () => {
  await nextAiResponse({ output: { events: [aiEvent({ title: "Fra fil" })], explanation: "" } });
  const prevented = await dispatchPaste({
    text: "Skolebrev høst.pdf",
    files: [{ name: "Skolebrev høst.pdf", type: "application/pdf", base64: PDF.toString("base64") }],
  });
  assert.equal(prevented, true);
  await expectProposalAndGoBack();
  const [doc] = (await lastAiRequest()).attachments;
  assert.equal(doc.type, "document");
  assert.equal(doc.media_type, "application/pdf");
  assert.ok(Buffer.from(doc.data, "base64").equals(PDF), "PDF-en kommer fram uendret");
});

test("PDF via bindersen sendes som document, med teksten i feltet som kommentar", async () => {
  await nextAiResponse({ output: { events: [aiEvent({ title: "Fra fil" })], explanation: "" } });
  await field().fill("gjelder Noa");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Legg ved bilde eller PDF" }).click();
  await (await chooser).setFiles({ name: "skoleruta.pdf", mimeType: "application/pdf", buffer: PDF });
  await expectProposalAndGoBack();
  const sent = await lastAiRequest();
  assert.equal(sent.attachments[0].type, "document");
  assert.ok(Buffer.from(sent.attachments[0].data, "base64").equals(PDF));
  assert.match(sent.text, /Kommentar fra den som lastet opp: gjelder Noa/);
});

test("PDF sluppet på feltet (uten MIME-type, som fra Mail) tolkes som dokument", async () => {
  await nextAiResponse({ output: { events: [aiEvent({ title: "Fra fil" })], explanation: "" } });
  await field().evaluate((el, base64) => {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], "Skoleruta.pdf", { type: "" }));
    el.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true }));
  }, PDF.toString("base64"));
  await expectProposalAndGoBack();
  const [doc] = (await lastAiRequest()).attachments;
  assert.equal(doc.media_type, "application/pdf");
});

test("kjennetegn fra Innstillinger sendes med til Claude", async () => {
  const hints = "Født 2017, 5C på Testskolen, fotball IL Testlag J2017";
  await page.goto("/innstillinger");
  await page.getByRole("button", { name: /^Mia/ }).click();
  await page.getByLabel("Kjennetegn").fill(hints);
  await page.getByRole("button", { name: "Lagre", exact: true }).click();
  await page.getByRole("button", { name: /^Mia/ }).filter({ hasText: "5C" }).waitFor();

  await page.goto("/kalender");
  await nextAiResponse({ output: { events: [], explanation: "Ingen dato." } });
  await field().fill("Foreldremøte for 5C");
  await page.getByRole("button", { name: "Legg inn" }).click();
  await alert(page).waitFor();
  assert.match((await lastAiRequest()).system, new RegExp(`Mia \\(barn\\): ${hints}`));
});
