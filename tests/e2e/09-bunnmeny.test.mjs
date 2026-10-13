// Bunnmenyen: «Mer»-arket, og valg av hvilke fem sider som står nederst (cookie per telefon).

import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { launch, loggedIn, trackErrors } from "./helpers.mjs";

let browser;
let page;
let errors;

before(async () => {
  browser = await launch();
  ({ page } = await loggedIn(browser));
  errors = trackErrors(page);
});

after(async () => {
  try {
    assert.deepEqual(errors, [], "ingen JavaScript-feil i siden");
  } finally {
    await browser?.close();
  }
});

const nav = () => page.getByRole("navigation", { name: "Hovednavigasjon" });

test("standardmenyen har Lekser og Mer, ikke Gjøremål og Filer", async () => {
  await page.goto("/hjem");
  await nav().getByRole("link", { name: "Lekser" }).waitFor();
  await nav().getByRole("button", { name: "Mer" }).waitFor();
  assert.equal(await nav().getByRole("link", { name: "Gjøremål" }).count(), 0);
  assert.equal(await nav().getByRole("link", { name: "Filer" }).count(), 0);
});

test("Mer-arket åpner Gjøremål, og Mer er aktiv der", async () => {
  await page.goto("/hjem");
  await nav().getByRole("button", { name: "Mer" }).click();
  const sheet = page.getByRole("dialog", { name: "Mer" });
  await sheet.getByRole("link", { name: "Filer" }).waitFor();
  await sheet.getByRole("link", { name: "Innstillinger" }).waitFor();
  await sheet.getByRole("link", { name: "Gjøremål" }).click();
  await page.waitForURL(/\/gjoremal/);
  // Mer er aktiv (blå) når siden ligger bak den — sjekk via stil på knappen
  const color = await nav().getByRole("button", { name: "Mer" }).evaluate((el) => getComputedStyle(el).color);
  const home = await nav().getByRole("link", { name: "Lekser" }).evaluate((el) => getComputedStyle(el).color);
  assert.notEqual(color, home, "Mer skal være markert som aktiv");
});

test("Lekser-lenken åpner Lekser-siden, ikke 404", async () => {
  await page.goto("/hjem");
  await nav().getByRole("link", { name: "Lekser" }).click();
  await page.waitForURL(/\/lekser/);
  await page.getByRole("group", { name: "Velg barn" }).waitFor();
});

test("Innstillinger → Bunnmeny: Gjøremål inn (Lekser ut) vises nederst etter omlasting", async () => {
  await page.goto("/innstillinger");
  const lekser = page.getByRole("checkbox", { name: "Lekser" });
  const gjoremal = page.getByRole("checkbox", { name: "Gjøremål" });
  // Fem er valgt: Gjøremål kan ikke legges til før noe tas bort
  await gjoremal.click({ force: true }); // aria-disabled: trykket skal ikke gjøre noe
  assert.equal(await gjoremal.getAttribute("aria-checked"), "false");
  await lekser.click();
  await gjoremal.click();
  await page.waitForFunction(() => document.cookie.includes("bunnmeny=") && document.cookie.includes("gjoremal"));
  await page.reload();
  await nav().getByRole("link", { name: "Gjøremål" }).waitFor();
  assert.equal(await nav().getByRole("link", { name: "Lekser" }).count(), 0);

  // Lekser ligger nå under Mer
  await nav().getByRole("button", { name: "Mer" }).click();
  await page.getByRole("dialog", { name: "Mer" }).getByRole("link", { name: "Lekser" }).waitFor();
});
