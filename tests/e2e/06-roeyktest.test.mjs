// Røyktest for handleliste, gjøremål og beskjeder — og live-synk mellom to telefoner.

import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { PARTNER } from "./fixtures.mjs";
import { aiRequests, launch, loggedIn, resetAi, sql, trackErrors, waitUntil } from "./helpers.mjs";

/** Venter til server-actionen er lagret, så en reload ikke avbryter den. */
const saved = (query, params, what) => waitUntil(async () => (await sql(query, params)).length > 0, what);

let browser;
let page;
let errors;

before(async () => {
  browser = await launch();
  ({ page } = await loggedIn(browser));
  errors = trackErrors(page);
  await resetAi();
});

after(async () => {
  try {
    assert.deepEqual(errors, [], "ingen JavaScript-feil i siden");
  } finally {
    await browser?.close();
  }
});

test("handleliste: legg til, sorter med (falsk) AI, kryss av og rydd", async () => {
  await page.goto("/handleliste");
  for (const name of ["Kaffe", "Melk", "Brød"]) {
    await page.getByLabel("Ny vare").fill(name);
    await page.keyboard.press("Enter");
    await page.getByRole("button", { name: `Rediger ${name}` }).waitFor();
  }

  await page.getByRole("button", { name: "Sorter som i butikken" }).click();
  await waitUntil(async () => (await aiRequests()).some((r) => r.kind === "ordered"), "sorteringskall til Claude");
  const sort = (await aiRequests()).find((r) => r.kind === "ordered");
  for (const name of ["Kaffe", "Melk", "Brød"]) assert.match(sort.text, new RegExp(`\\d+\\. ${name}`));
  await page.getByRole("button", { name: "Sorter som i butikken" }).waitFor(); // ferdig («Sorterer …» borte)

  await page.getByRole("button", { name: "Melk: marker som kjøpt" }).click();
  await page.getByRole("button", { name: "Melk: marker som ikke kjøpt" }).waitFor();
  await page.getByRole("button", { name: /Rydd bort kjøpte \(1\)/ }).click();
  await page.getByRole("button", { name: "Rediger Melk" }).waitFor({ state: "detached" });
  await waitUntil(async () => (await sql("select 1 from shopping_items where name = 'Melk'")).length === 0, "Melk ryddet bort i databasen");
  await page.reload();
  await page.getByRole("button", { name: "Rediger Kaffe" }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Rediger Melk" }).count(), 0);
});

test("handleliste: ny vare synes på den andre telefonen uten å laste på nytt", async () => {
  const other = await loggedIn(browser, PARTNER);
  const otherErrors = trackErrors(other.page);
  await other.page.goto("/handleliste");
  await other.page.getByRole("button", { name: "Rediger Kaffe" }).waitFor();

  await page.getByLabel("Ny vare").fill("Egg");
  await page.keyboard.press("Enter");
  // Live-synk spør hvert 5. sekund.
  await other.page.getByRole("button", { name: "Rediger Egg" }).waitFor({ timeout: 15_000 });
  assert.deepEqual(otherErrors, []);
  await other.context.close();
});

test("gjøremål: legg til med person og frist, gjort, angre, gjort", async () => {
  const title = "Signere skjema for skoletur";
  await page.goto("/gjoremal");
  await page.getByLabel("Nytt gjøremål").fill(title);
  await page.getByRole("group", { name: "Hvem tar det?" }).getByRole("button", { name: "Mia" }).click();
  await page.getByRole("group", { name: "Frist" }).getByRole("button", { name: "I morgen" }).click();
  await page.getByRole("button", { name: "Legg til", exact: true }).click();
  const markDone = page.getByRole("button", { name: `Marker «${title}» som gjort` });
  await markDone.click();
  await page.getByRole("status").filter({ hasText: `«${title}» er gjort` }).waitFor();
  await page.getByRole("button", { name: "Angre" }).click();
  await markDone.waitFor();

  await markDone.click();
  await markDone.waitFor({ state: "detached" });
  await saved("select 1 from tasks where title = $1 and done", [title], "gjøremålet lagret som gjort");
  await page.reload();
  await page.getByRole("button", { name: /^Gjort/ }).click();
  await page.getByRole("button", { name: `Marker «${title}» som ikke gjort` }).waitFor();
});

test("beskjeder: send og se beskjeden etter reload", async () => {
  await page.goto("/beskjeder");
  await page.getByLabel("Ny beskjed").fill("Husk gymtøy til Noa på torsdag");
  await page.getByRole("button", { name: "Send" }).click();
  const list = page.getByRole("list", { name: "Beskjeder" });
  await list.getByText("Husk gymtøy til Noa på torsdag").waitFor();
  await saved("select 1 from messages where body = $1", ["Husk gymtøy til Noa på torsdag"], "beskjeden lagret");
  await page.reload();
  await list.getByText("Husk gymtøy til Noa på torsdag").waitFor();
});

test("hjem viser dagens oversikt uten feil (vær fra met.no er blokkert i test)", async () => {
  const response = await page.goto("/hjem");
  assert.equal(response.status(), 200);
  await page.getByRole("heading", { level: 1 }).waitFor();
});
