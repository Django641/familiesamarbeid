// Side-varianten /kalender/fra-tekst (brukes fra Beskjeder): tekst i URL → falsk Claude → forslag → lagre.

import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";

import { OWNER } from "./fixtures.mjs";
import { aiEvent, lastAiRequest, launch, loggedIn, nextAiResponse, osloDay, resetAi, trackErrors } from "./helpers.mjs";

let browser;
let page;
let errors;

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

test("fra-tekst: forhåndsutfylt tekst, to forslag, fjern ett, start på nytt, lagre", async () => {
  const text = "Foreldremøte og dugnad i oktober";
  const date = osloDay(2);
  await page.goto(`/kalender/fra-tekst?tekst=${encodeURIComponent(text)}`);
  const box = page.getByRole("textbox", { name: "Tekst" });
  assert.equal(await box.inputValue(), text);

  await nextAiResponse({
    output: {
      events: [
        aiEvent({ title: "Foreldremøte 5C", date, start_time: "18:00" }),
        aiEvent({ title: "Dugnad", date, start_time: "10:00" }),
      ],
      explanation: "",
    },
  });
  await page.getByRole("button", { name: "Finn hendelser" }).click();
  await page.getByRole("button", { name: "Lagre 2 i kalenderen" }).waitFor();
  const checks = page.getByRole("checkbox", { name: "Ta med" });
  assert.equal(await checks.count(), 2);
  assert.match((await lastAiRequest()).text, /Foreldremøte og dugnad/);

  await checks.nth(1).uncheck();
  await page.getByRole("button", { name: "Lagre 1 i kalenderen" }).waitFor();

  await page.getByRole("button", { name: "Start på nytt" }).click();
  await box.waitFor();
  assert.equal(await box.inputValue(), text, "teksten er bevart");

  await nextAiResponse({ output: { events: [aiEvent({ title: "Foreldremøte 5C", date, start_time: "18:00" })], explanation: "" } });
  await page.getByRole("button", { name: "Finn hendelser" }).click();
  await page.getByRole("button", { name: "Lagre 1 i kalenderen" }).click();
  await page.waitForURL((u) => u.pathname === "/kalender");
  await page.getByRole("button", { name: /Foreldremøte 5C 18:00/ }).first().waitFor();
});

test("beskjed → «Legg i kalenderen» åpner siden med teksten forhåndsutfylt", async () => {
  const body = "Husk svømmetur fredag kl 15";
  await page.goto("/beskjeder");
  await page.getByLabel("Ny beskjed").fill(body);
  await page.getByRole("button", { name: "Send" }).click();
  const list = page.getByRole("list", { name: "Beskjeder" });
  await list.getByText(body).waitFor();
  await list.getByText(body).click();
  await page.getByRole("button", { name: "Legg i kalenderen" }).click();
  await page.waitForURL((u) => u.pathname === "/kalender/fra-tekst");
  assert.equal(await page.getByRole("textbox", { name: "Tekst" }).inputValue(), body);
});
