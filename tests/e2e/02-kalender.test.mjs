// Kalender: Uker/Liste, dagsark, filter, «Vis flere uker» og ugyldige URL-er. Mobil 390 px.

import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { CHILDREN, OWNER } from "./fixtures.mjs";
import { insertEvent, launch, loggedIn, oslo, osloDay, peopleIds, sql, trackErrors } from "./helpers.mjs";

let browser;
let context;
let page;
let errors;
const [ADA, LEA] = CHILDREN;

before(async () => {
  browser = await launch();
  ({ context, page } = await loggedIn(browser));
  errors = trackErrors(page);

  const ids = await peopleIds();
  await sql("delete from events where title like 'K-%'");
  const tomorrow = osloDay(1);
  await insertEvent({ title: "K-Fotball", category: "aktivitet", start: oslo(tomorrow, "17:15"), end: oslo(tomorrow, "18:30"), people: [ids[LEA]], location: "Testhallen" });
  await insertEvent({ title: "K-Svømming", category: "aktivitet", start: oslo(tomorrow, "16:00"), end: oslo(tomorrow, "17:00"), people: [ids[ADA]] });
  await insertEvent({ title: "K-Jobbreise", category: "jobb", start: oslo(osloDay(2), "07:10"), end: oslo(osloDay(4), "18:00"), people: [ids[OWNER.name]] });
  await insertEvent({ title: "K-Høstferie", category: "skole", start: oslo(osloDay(9)), end: oslo(osloDay(13)), allDay: true });
});

after(async () => {
  try {
    assert.deepEqual(errors, [], "ingen JavaScript-feil i siden");
  } finally {
    await browser?.close();
  }
});

const weeks = () => page.locator("section[aria-label^='Uke ']");
const toggle = (name) => page.getByRole("group", { name: "Visning" }).getByRole("button", { name, exact: true });

test("Uker er standardvisningen", async () => {
  await page.goto("/kalender");
  assert.equal(await toggle("Uker").getAttribute("aria-pressed"), "true");
  assert.equal(await weeks().count(), 11); // forrige uke + 10 fram
  // I dag er merket i skjermlesertekst.
  await page.getByRole("button", { name: /i dag/ }).first().waitFor();
});

test("hendelser vises i uke-rutenettet, også stolper over flere dager", async () => {
  await page.getByRole("button", { name: /K-Fotball 17:15/ }).first().waitFor();
  // Jobbreisen dekker tre dager → tre dagknapper nevner den.
  assert.equal(await page.getByRole("button", { name: /K-Jobbreise/ }).count(), 3);
});

test("trykk på en dag åpner dagsarket med hendelsene", async () => {
  await page.getByRole("button", { name: /K-Fotball 17:15/ }).first().click();
  const sheet = page.getByRole("dialog", { name: "I morgen" });
  await sheet.waitFor();
  await sheet.getByText("K-Fotball").waitFor();
  await sheet.getByText("K-Svømming").waitFor();
  await sheet.getByRole("link", { name: /Ny hendelse/ }).waitFor();
  await sheet.getByRole("button", { name: "Lukk" }).click();
  await sheet.waitFor({ state: "hidden" });
});

test("filter på person skjuler de andres hendelser", async () => {
  const filter = page.getByRole("group", { name: "Vis hendelser for" });
  await filter.getByRole("button", { name: LEA }).click();
  await page.getByRole("button", { name: /K-Svømming/ }).first().waitFor({ state: "detached" });
  assert.ok((await page.getByRole("button", { name: /K-Fotball/ }).count()) > 0);
  await filter.getByRole("button", { name: "Alle" }).click();
  await page.getByRole("button", { name: /K-Svømming/ }).first().waitFor();
});

test("Liste-bryteren virker og huskes til neste gang", async () => {
  await toggle("Liste").click();
  await page.waitForURL(/visning=liste/);
  await page.getByText("K-Fotball").first().waitFor();
  await page.goto("/kalender");
  assert.equal(await toggle("Liste").getAttribute("aria-pressed"), "true");
  await toggle("Uker").click();
  await page.waitForURL(/visning=uker/);
  await page.goto("/kalender");
  assert.equal(await toggle("Uker").getAttribute("aria-pressed"), "true");
});

test("«Vis flere uker» legger til åtte uker", async () => {
  assert.equal(await weeks().count(), 11);
  await page.getByRole("link", { name: "Vis flere uker" }).click();
  await page.waitForURL(/uker=19/);
  await page.waitForFunction(() => document.querySelectorAll("section[aria-label^='Uke ']").length === 19);
});

test("ugyldig ?fra= og ?uker= gir ikke serverfeil", async () => {
  for (const query of ["fra=2026-13-45&uker=999", "fra=abc&uker=-4", "fra=1900-01-01", "visning=liste&fra=2026-02-30"]) {
    const response = await page.goto(`/kalender?${query}`);
    assert.equal(response.status(), 200, query);
    await page.getByRole("group", { name: "Visning" }).waitFor();
  }
  await page.goto("/kalender?fra=2026-13-45&uker=999");
  assert.equal(await weeks().count(), 60); // maks 60 uker
});
