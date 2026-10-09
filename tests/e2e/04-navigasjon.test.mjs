// Tilbake / Avbryt / reload: «Tilbake» skal aldri sende brukeren ut av appen eller til en tom side.

import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { launch, loggedIn, osloDay, trackErrors } from "./helpers.mjs";

let browser;
let context;
let page;
let errors;

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

const onCalendar = /\/kalender(\?.*)?$/;

test("Fyll ut selv → Tilbake går tilbake til kalenderen, med samme visning", async () => {
  await page.goto("/kalender?visning=liste");
  await page.getByRole("link", { name: "Fyll ut selv" }).click();
  await page.waitForURL(/\/kalender\/ny/);
  await page.getByRole("button", { name: "Tilbake", exact: true }).click();
  await page.waitForURL(/\/kalender\?visning=liste$/);
});

test("Fyll ut selv → Avbryt går tilbake til kalenderen", async () => {
  await page.goto("/kalender");
  await page.getByRole("link", { name: "Fyll ut selv" }).click();
  await page.waitForURL(/\/kalender\/ny/);
  await page.getByRole("button", { name: "Avbryt" }).click();
  await page.waitForURL(onCalendar);
});

test("siden åpnet direkte (ingen historikk) → Tilbake går til kalenderen", async () => {
  const fresh = await context.newPage();
  await fresh.goto("/kalender/ny");
  await fresh.getByRole("button", { name: "Tilbake", exact: true }).click();
  await fresh.waitForURL(onCalendar);
  await fresh.close();
});

test("etter reload → Tilbake og Avbryt går fortsatt til kalenderen", async () => {
  await page.goto("/kalender");
  await page.getByRole("link", { name: "Fyll ut selv" }).click();
  await page.waitForURL(/\/kalender\/ny/);
  await page.reload();
  await page.getByRole("button", { name: "Tilbake", exact: true }).click();
  await page.waitForURL(onCalendar);

  await page.goto("/kalender/ny");
  await page.reload();
  await page.getByRole("button", { name: "Avbryt" }).click();
  await page.waitForURL(onCalendar);
});

test("ny hendelse fra dagsarket får riktig dato og havner i kalenderen", async () => {
  const day = osloDay(3);
  const spoken = new Date(`${day}T12:00:00Z`).toLocaleDateString("nb-NO", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }); // samme tekst som skjermleseren får for dagen, f.eks. «mandag 12. oktober»
  await page.goto("/kalender");
  await page.getByRole("button", { name: new RegExp(`^${spoken},`) }).click();
  await page.getByRole("dialog").getByRole("link", { name: /Ny hendelse/ }).click();
  await page.waitForURL(new RegExp(`/kalender/ny\\?dato=${day}`));
  assert.equal(await page.getByLabel("Dato", { exact: true }).inputValue(), day);
  await page.getByLabel("Hva skjer?").fill("N-Tannlege");
  await page.getByLabel("Fra").fill("14:30");
  await page.getByRole("button", { name: "Legg i kalenderen" }).click();
  await page.waitForURL(onCalendar);
  await page.getByRole("button", { name: /N-Tannlege 14:30/ }).first().waitFor();
});
