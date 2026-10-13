// Lekser: last opp ukeplan (PDF) → falsk Claude → godkjenningsark → lagre → /lekser, kalender,
// skjult original i Filer → avkrysning lagres → «Erstatt?» beholder avkrysning.

import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";

import { OWNER } from "./fixtures.mjs";
import {
  aiWeeklyPlan,
  blobFiles,
  insertEvent,
  launch,
  loggedIn,
  nextAiResponse,
  oslo,
  osloMonday,
  peopleIds,
  resetAi,
  sql,
  trackErrors,
  waitUntil,
} from "./helpers.mjs";

let browser;
let page;
let errors;

const PDF = Buffer.from("%PDF-1.4\n% Ukeplan\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n");
const MONDAY = osloMonday(1); // neste uke: alt ligger fram i tid
const day = (n) => {
  const [y, m, d] = MONDAY.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

before(async () => {
  browser = await launch();
  ({ page } = await loggedIn(browser, OWNER));
  errors = trackErrors(page);
});

after(async () => {
  try {
    assert.deepEqual(errors, [], "ingen JavaScript-feil i siden");
  } finally {
    await browser?.close();
  }
});

beforeEach(resetAi);

async function upload(plan) {
  await nextAiResponse({ kind: "weekly_plan", output: plan });
  await page.goto(`/lekser/ny`);
  const chooser = page.waitForEvent("filechooser");
  await page.getByText("Velg PDF eller bilder").click();
  await (await chooser).setFiles([{ name: "Ukeplan uke 43.pdf", mimeType: "application/pdf", buffer: PDF }]);
}

test("tom uke viser kort med «Last opp ukeplan»", async () => {
  await page.goto(`/lekser?uke=${MONDAY}`);
  await page.getByText(/Ingen ukeplan for uke/).waitFor();
  await page.getByRole("link", { name: "Last opp ukeplan" }).click();
  await page.waitForURL((u) => u.pathname === "/lekser/ny");
});

test("last opp → ark → rediger → lagre → lekser, kalender og skjult original", async () => {
  const ids = await peopleIds();
  // Gymtøy torsdag finnes alt i kalenderen → skal ikke være huket.
  await insertEvent({ title: "Gymtøy", category: "skole", start: oslo(day(3)), allDay: true, people: [ids.Mia] });

  await upload(aiWeeklyPlan({ week_start: MONDAY }));
  await page.getByRole("button", { name: /^Lagre:/ }).waitFor();

  // Ark: Mia er valgt, tre grupper, dublett er ikke huket og forklart.
  assert.equal(await page.getByRole("button", { name: "Mia", exact: true }).getAttribute("aria-pressed"), "true");
  await page.getByRole("region", { name: "Til kalenderen" }).waitFor();
  await page.getByRole("region", { name: "Lekser" }).waitFor();
  await page.getByRole("region", { name: "Mål" }).waitFor();
  assert.equal(await page.getByRole("checkbox", { name: "Ta med «🩳 Gymtøy»" }).getAttribute("aria-checked"), "false");
  await page.getByText("Finnes alt i kalenderen").waitFor();
  await page.getByRole("button", { name: "Lagre: 1 i kalenderen, 2 lekser, 1 mål" }).waitFor();

  // Rediger en rad i bunnarket.
  await page.getByRole("button", { name: /Øv på glosene denne uka/ }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByRole("textbox", { name: "Tekst" }).fill("Øv på glosene");
  await sheet.getByRole("button", { name: "Ferdig" }).click();

  await page.getByRole("button", { name: /^Lagre:/ }).click();
  await page.waitForURL((u) => u.pathname === "/lekser" && u.searchParams.get("uke") === MONDAY && u.searchParams.get("barn") === ids.Mia);

  await page.getByText("Jeg kan 7-gangen").waitFor();
  await page.getByRole("button", { name: /Les side 12–15 i lesebok/ }).first().waitFor();
  await page.getByRole("region", { name: "Hele uka" }).getByText("Øv på glosene").waitFor();
  await page.getByRole("link", { name: /Ukeplan Mia uke/ }).waitFor();

  // Kalenderen: tur som skole/Mia, gymtøy ikke dobbelt.
  const evs = await sql("select title, category, person_ids, all_day from events where title in ('Tur til Nordmarka', '🩳 Gymtøy', 'Gymtøy') order by title");
  assert.deepEqual(evs.map((e) => e.title), ["Gymtøy", "Tur til Nordmarka"]);
  const tur = evs.find((e) => e.title === "Tur til Nordmarka");
  assert.equal(tur.category, "skole");
  assert.deepEqual(tur.person_ids, [ids.Mia]);

  // Originalen: i Blob, koblet til uka, skjult fra Filer.
  const docs = await sql("select name, category, homework_week_id, pathname from documents where name like 'Ukeplan Mia%'");
  assert.equal(docs.length, 1);
  assert.equal(docs[0].category, "skole");
  assert.ok(docs[0].homework_week_id);
  assert.ok((await blobFiles()).some((f) => f.pathname === docs[0].pathname));
  await page.goto("/dokumenter");
  await page.getByRole("searchbox", { name: "Søk i dokumenter" }).waitFor();
  assert.equal(await page.getByText(docs[0].name).count(), 0, "ukeplanen vises ikke i Filer");

  // Original via /api/filer/[id] (innlogget).
  const doc = (await sql("select id from documents where name like 'Ukeplan Mia%'"))[0];
  assert.equal((await page.request.get(`/api/filer/${doc.id}`)).status(), 200);
});

test("avkrysning lagres; «Erstatt?» beholder avkrysning for identisk tekst", async () => {
  const ids = await peopleIds();
  await page.goto(`/lekser?uke=${MONDAY}&barn=${ids.Mia}`);
  const row = "Les side 12–15 i lesebok";
  await page.getByRole("button", { name: `Marker «${row}» som gjort` }).click();
  await page.getByRole("button", { name: `Marker «${row}» som ikke gjort` }).waitFor();
  await waitUntil(async () => (await sql("select done from homework_items where text = $1", [row]))[0]?.done === true, "avkrysningen lagres");
  await page.reload();
  await page.getByRole("button", { name: `Marker «${row}» som ikke gjort` }).waitFor();

  // Ny opplasting for samme uke: spør om å erstatte.
  await upload(aiWeeklyPlan({ week_start: MONDAY }));
  await page.getByRole("button", { name: /^Lagre:/ }).waitFor();
  let asked = "";
  page.once("dialog", (d) => {
    asked = d.message();
    void d.accept();
  });
  await page.getByRole("button", { name: /^Lagre:/ }).click();
  await page.waitForURL((u) => u.pathname === "/lekser");
  assert.match(asked, /Erstatte/);
  await page.getByRole("button", { name: `Marker «${row}» som ikke gjort` }).waitFor();

  // Ingen dobbelte rader etter erstatning; to originaler er koblet.
  const n = await sql("select count(*)::int as n from homework_items where text = $1", [row]);
  assert.equal(n[0].n, 1);
  const docs = await sql("select count(*)::int as n from documents where name like 'Ukeplan Mia%' and homework_week_id is not null");
  assert.equal(docs[0].n, 2);
});

test("legg til for hånd, slett med angre", async () => {
  const ids = await peopleIds();
  await page.goto(`/lekser?uke=${MONDAY}&barn=${ids.Mia}`);
  await page.getByRole("button", { name: "Legg til" }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByRole("textbox", { name: "Tekst" }).fill("Husk lesebok");
  await sheet.getByRole("button", { name: "Fr" }).click();
  await sheet.getByRole("button", { name: "Lagre", exact: true }).click();
  await page.getByRole("button", { name: "Husk lesebok", exact: true }).waitFor();
  await waitUntil(async () => (await sql("select source from homework_items where text = 'Husk lesebok'")).length === 1, "lagret");

  await page.getByRole("button", { name: "Husk lesebok", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Slett" }).click();
  await page.getByRole("button", { name: "Husk lesebok", exact: true }).waitFor({ state: "detached" });
  await page.getByRole("button", { name: "Angre" }).click();
  await page.getByRole("button", { name: "Husk lesebok", exact: true }).waitFor();
});
