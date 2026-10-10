// Gjentakende hendelser: «Gjentas hver uke» i skjemaet (ny og eksisterende hendelse) og på AI-forslag.
// Sjekker hva som faktisk havner i databasen (antall, felles series_id, klokkeslett) og hva appen ber Claude om.

import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";

import { OWNER } from "./fixtures.mjs";
import {
  aiEvent,
  DESKTOP,
  insertEvent,
  lastAiRequest,
  launch,
  loggedIn,
  nextAiResponse,
  oslo,
  osloDay,
  resetAi,
  sql,
  trackErrors,
  waitUntil,
} from "./helpers.mjs";

let browser;
let page;
let errors;

const rowsFor = (title) =>
  sql("select id, series_id, starts_at, all_day from events where title = $1 order by starts_at", [title]);
const addDays = (key, n) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

before(async () => {
  browser = await launch();
  ({ page } = await loggedIn(browser, OWNER, { device: DESKTOP }));
  errors = trackErrors(page);
  await sql("delete from events where title like 'G-%'");
});

after(async () => {
  try {
    assert.deepEqual(errors, [], "ingen JavaScript-feil i siden");
  } finally {
    await sql("delete from events where title like 'G-%'").catch(() => {});
    await browser?.close();
  }
});

beforeEach(() => resetAi());

test("ny hendelse med «Gjentas hver uke» lager én hendelse per uke med felles serie, og hele serien kan slettes", async () => {
  const start = osloDay(3);
  const until = addDays(start, 21); // 4 ganger
  await page.goto(`/kalender/ny?dato=${start}`);
  await page.getByLabel("Hva skjer?").fill("G-Trening");
  await page.getByLabel("Fra", { exact: true }).fill("17:30");

  // Ingen «Til og med» før avkrysningen er på.
  assert.equal(await page.getByLabel("Til og med").count(), 0);
  await page.getByRole("checkbox", { name: "Gjentas hver uke" }).check();
  await page.getByLabel("Til og med").fill(until);
  const weekday = new Date(`${start}T12:00:00Z`).toLocaleDateString("nb-NO", { weekday: "long", timeZone: "UTC" });
  await page.getByText(`Hver ${weekday} kl. 17:30 · 4 ganger`).waitFor();

  await page.getByRole("button", { name: "Legg i kalenderen" }).click();
  await page.waitForURL(/\/kalender$/);

  const rows = await rowsFor("G-Trening");
  assert.equal(rows.length, 4);
  assert.ok(rows[0].series_id, "serien har series_id");
  assert.equal(new Set(rows.map((r) => r.series_id)).size, 1, "alle har samme series_id");
  assert.deepEqual(
    rows.map((r) => new Date(r.starts_at).toISOString()),
    [0, 7, 14, 21].map((n) => oslo(addDays(start, n), "17:30")),
    "17:30 Oslo-tid hver uke"
  );

  // Åpne en av dem: serien er fast, og «Slett hele serien» fjerner alle.
  await page.goto(`/kalender/${rows[1].id}`);
  await page.getByText("Gjentas fast. Endringer her gjelder bare denne gangen.").waitFor();
  assert.equal(await page.getByRole("checkbox", { name: "Gjentas hver uke" }).count(), 0);
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Slett hele serien" }).click();
  await page.waitForURL(/\/kalender$/);
  await waitUntil(async () => (await rowsFor("G-Trening")).length === 0, "serien er slettet");
});

test("enkelthendelse uten gjentakelse lager ingen serie", async () => {
  await page.goto(`/kalender/ny?dato=${osloDay(3)}`);
  await page.getByLabel("Hva skjer?").fill("G-Enkelt");
  await page.getByLabel("Fra", { exact: true }).fill("10:00");
  await page.getByRole("button", { name: "Legg i kalenderen" }).click();
  await page.waitForURL(/\/kalender$/);
  const rows = await rowsFor("G-Enkelt");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].series_id, null);
});

test("«Til og med» på startdatoen gir én vanlig hendelse, ikke en serie", async () => {
  const start = osloDay(3);
  await page.goto(`/kalender/ny?dato=${start}`);
  await page.getByLabel("Hva skjer?").fill("G-EnGang");
  await page.getByLabel("Fra", { exact: true }).fill("10:00");
  await page.getByRole("checkbox", { name: "Gjentas hver uke" }).check();
  await page.getByLabel("Til og med").fill(start);
  await page.getByText(/Bare én gang/).waitFor();
  await page.getByRole("button", { name: "Legg i kalenderen" }).click();
  await page.waitForURL(/\/kalender$/);
  const rows = await rowsFor("G-EnGang");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].series_id, null);
});

test("annenhver uke gir hver andre uke", async () => {
  const start = osloDay(3);
  await page.goto(`/kalender/ny?dato=${start}`);
  await page.getByLabel("Hva skjer?").fill("G-Annenhver");
  await page.getByLabel("Fra", { exact: true }).fill("09:00");
  await page.getByRole("checkbox", { name: "Gjentas hver uke" }).check();
  await page.getByRole("radio", { name: "Annenhver uke" }).click();
  await page.getByLabel("Til og med").fill(addDays(start, 28)); // dag 0, 14, 28
  await page.getByRole("button", { name: "Legg i kalenderen" }).click();
  await page.waitForURL(/\/kalender$/);
  const rows = await rowsFor("G-Annenhver");
  assert.deepEqual(
    rows.map((r) => new Date(r.starts_at).toISOString()),
    [0, 14, 28].map((n) => oslo(addDays(start, n), "09:00"))
  );
});

test("eksisterende enkelthendelse kan gjøres om til en serie", async () => {
  const start = osloDay(4);
  const id = await insertEvent({ title: "G-Gjøres-om", start: oslo(start, "16:00"), end: oslo(start, "17:00") });
  await page.goto(`/kalender/${id}`);
  await page.getByRole("checkbox", { name: "Gjentas hver uke" }).check();
  await page.getByLabel("Til og med").fill(addDays(start, 14)); // 3 ganger
  await page.getByRole("button", { name: "Lagre endringer" }).click();
  await page.waitForURL(/\/kalender$/);

  const rows = await rowsFor("G-Gjøres-om");
  assert.equal(rows.length, 3);
  assert.ok(rows[0].series_id);
  assert.equal(new Set(rows.map((r) => r.series_id)).size, 1);
  assert.equal(rows[0].id, id, "den opprinnelige hendelsen er første gang i serien");
  const ends = await sql("select ends_at from events where title = 'G-Gjøres-om' order by starts_at");
  assert.deepEqual(
    ends.map((r) => new Date(r.ends_at).toISOString()),
    [0, 7, 14].map((n) => oslo(addDays(start, n), "17:00")),
    "sluttid følger med"
  );
});

test("hurtigfeltet: Claude svarer repeat «weekly» → avkrysningen er forhåndshuket og lagring gir en serie", async () => {
  const date = osloDay(5);
  await nextAiResponse({
    kind: "events",
    output: {
      events: [aiEvent({ title: "G-AI-Trening", date, start_time: "17:30", category: "aktivitet", repeat: "weekly" })],
      explanation: "",
    },
  });
  await page.goto("/kalender");
  await page.getByLabel("Ny hendelse: skriv eller lim inn tekst").fill("G-AI-Trening hver tirsdag 17:30");
  await page.getByRole("button", { name: "Legg inn" }).click();

  const box = page.getByRole("checkbox", { name: "Gjentas hver uke" });
  await box.waitFor();
  assert.equal(await box.isChecked(), true, "forhåndshuket av AI-en");
  assert.equal(await page.getByRole("radio", { name: "Hver uke", exact: true }).getAttribute("aria-checked"), "true");

  // Det appen ba Claude om: repeat er med i JSON-skjemaet, som påkrevd felt med de tre verdiene.
  const sent = await lastAiRequest();
  assert.equal(sent.kind, "events");
  const item = sent.schema.properties.events.items;
  assert.deepEqual(item.properties.repeat.enum, ["none", "weekly", "biweekly"]);
  assert.ok(item.required.includes("repeat"), "repeat er påkrevd i skjemaet");

  const until = addDays(date, 14);
  await page.getByLabel("Til og med").fill(until);
  await page.getByRole("button", { name: "Lagre 1 i kalenderen" }).click();
  await page.getByRole("status").filter({ hasText: "«G-AI-Trening» er lagt i kalenderen" }).waitFor();

  const rows = await rowsFor("G-AI-Trening");
  assert.equal(rows.length, 3);
  assert.equal(new Set(rows.map((r) => r.series_id)).size, 1);
  assert.ok(rows[0].series_id);
});

test("hurtigfeltet: uten repeat i svaret er avkrysningen av, og brukeren kan huke av selv", async () => {
  const date = osloDay(5);
  const { repeat: _omit, ...withoutRepeat } = aiEvent({ title: "G-AI-Uten", date, start_time: "18:00" });
  await nextAiResponse({ kind: "events", output: { events: [withoutRepeat], explanation: "" } });
  await page.goto("/kalender");
  await page.getByLabel("Ny hendelse: skriv eller lim inn tekst").fill("G-AI-Uten");
  await page.getByRole("button", { name: "Legg inn" }).click();

  const box = page.getByRole("checkbox", { name: "Gjentas hver uke" });
  await box.waitFor();
  assert.equal(await box.isChecked(), false);
  await box.check();
  await page.getByRole("radio", { name: "Annenhver uke" }).click();
  await page.getByLabel("Til og med").fill(addDays(date, 14)); // 2 ganger
  await page.getByRole("button", { name: "Lagre 1 i kalenderen" }).click();
  await page.getByRole("status").filter({ hasText: "«G-AI-Uten» er lagt i kalenderen" }).waitFor();
  const rows = await rowsFor("G-AI-Uten");
  assert.equal(rows.length, 2);
  assert.equal(rows[0].series_id, rows[1].series_id);
});

test("hurtigfeltet: ukjent repeat-verdi fra Claude behandles som ingen gjentakelse", async () => {
  const date = osloDay(5);
  await nextAiResponse({
    kind: "events",
    output: { events: [aiEvent({ title: "G-AI-Ukjent", date, repeat: "daily" })], explanation: "" },
  });
  await page.goto("/kalender");
  await page.getByLabel("Ny hendelse: skriv eller lim inn tekst").fill("G-AI-Ukjent");
  await page.getByRole("button", { name: "Legg inn" }).click();
  const box = page.getByRole("checkbox", { name: "Gjentas hver uke" });
  await box.waitFor();
  assert.equal(await box.isChecked(), false);
  await page.getByRole("button", { name: "Lagre 1 i kalenderen" }).click();
  await page.getByRole("status").filter({ hasText: "«G-AI-Ukjent» er lagt i kalenderen" }).waitFor();
  assert.equal((await rowsFor("G-AI-Ukjent")).length, 1);
});

test("redigering av hendelse som alt er i en serie: serien er uendret, og avkrysningen finnes ikke", async () => {
  const start = osloDay(6);
  const [b] = await sql("select gen_random_uuid() as x");
  const seriesId = b.x;
  for (const n of [0, 7, 14]) {
    const id = await insertEvent({ title: "G-Serie-fast", start: oslo(addDays(start, n), "16:00") });
    await sql("update events set series_id = $1 where id = $2", [seriesId, id]);
  }
  const before = await rowsFor("G-Serie-fast");
  await page.goto(`/kalender/${before[1].id}`);
  await page.getByText("Gjentas fast. Endringer her gjelder bare denne gangen.").waitFor();
  assert.equal(await page.getByRole("checkbox", { name: "Gjentas hver uke" }).count(), 0);
  await page.getByLabel("Hva skjer?").fill("G-Serie-fast endret");
  await page.getByRole("button", { name: "Lagre endringer" }).click();
  await page.waitForURL(/\/kalender$/);

  const all = await sql("select title, series_id from events where series_id = $1 order by starts_at", [seriesId]);
  assert.equal(all.length, 3, "antall rader i serien er uendret");
  assert.deepEqual(all.map((r) => r.title), ["G-Serie-fast", "G-Serie-fast endret", "G-Serie-fast"]);
});

test("to telefoner: hendelsen ble serie mens skjemaet var åpent → feilmelding og ingen nye rader", async () => {
  const start = osloDay(7);
  const id = await insertEvent({ title: "G-Kappløp", start: oslo(start, "16:00") });
  await page.goto(`/kalender/${id}`);
  await page.getByRole("checkbox", { name: "Gjentas hver uke" }).check();
  await page.getByLabel("Til og med").fill(addDays(start, 14));
  // Den andre telefonen gjør hendelsen til en serie først.
  const [{ s }] = await sql("select gen_random_uuid() as s");
  await sql("update events set series_id = $1 where id = $2", [s, id]);
  await page.getByRole("button", { name: "Lagre endringer" }).click();
  await page.getByRole("alert").filter({ hasText: "Hendelsen er endret på den andre telefonen" }).waitFor();
  assert.equal((await rowsFor("G-Kappløp")).length, 1, "ingen nye rader");
});

test("hurtigfeltet: repeat_until fra Claude forhåndsutfyller «Til og med», og skjemaet ber om feltet", async () => {
  const date = osloDay(5);
  const until = addDays(date, 21);
  await nextAiResponse({
    kind: "events",
    output: { events: [aiEvent({ title: "G-AI-Til", date, repeat: "weekly", repeat_until: until })], explanation: "" },
  });
  await page.goto("/kalender");
  await page.getByLabel("Ny hendelse: skriv eller lim inn tekst").fill("G-AI-Til hver uke til og med om tre uker");
  await page.getByRole("button", { name: "Legg inn" }).click();
  const untilInput = page.getByLabel("Til og med");
  await untilInput.waitFor();
  assert.equal(await untilInput.inputValue(), until);

  const item = (await lastAiRequest()).schema.properties.events.items;
  assert.ok(item.required.includes("repeat_until"), "repeat_until er påkrevd i skjemaet");
  assert.equal(item.properties.repeat_until.type, "string");

  await page.getByRole("button", { name: "Lagre 1 i kalenderen" }).click();
  await page.getByRole("status").filter({ hasText: "«G-AI-Til» er lagt i kalenderen" }).waitFor();
  assert.equal((await rowsFor("G-AI-Til")).length, 4);
});
