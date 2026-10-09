// Innlogging og første oppsett. Kjøres først: lager eierens konto og familie, og samboerens
// konto via invitasjonslenken. Sesjonene gjenbrukes av de andre testfilene.

import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { after, before, test } from "node:test";

import { OWNER, PARTNER, TEST_AUTH_SECRET } from "./fixtures.mjs";
import { alert, DESKTOP, launch, newContext, registerOwner, saveSession, signIn, trackErrors } from "./helpers.mjs";

let browser;
before(async () => (browser = await launch()));
after(async () => browser?.close());

const STRANGER = { email: "fremmed@example.test", password: "fremmed-passord-1" };

async function trySignup(page, email, password) {
  await page.getByRole("radio", { name: "Første gang" }).click();
  await page.getByLabel("E-post").fill(email);
  await page.getByLabel("Velg passord").fill(password);
  await page.getByRole("button", { name: "Lag konto" }).click();
  return alert(page).textContent();
}

test("e-post utenfor ALLOWED_EMAILS kan ikke bli første bruker", async () => {
  const context = await newContext(browser);
  const page = await context.newPage();
  await page.goto("/login");
  const message = await trySignup(page, STRANGER.email, STRANGER.password);
  assert.match(message, /har ikke tilgang/);
  assert.match(page.url(), /\/login/);
  await context.close();
});

test("uinnlogget blir sendt til innlogging", async () => {
  const context = await newContext(browser);
  const page = await context.newPage();
  await page.goto("/kalender");
  await page.waitForURL(/\/login\?next=%2Fkalender/);
  const api = await page.request.get("/api/sync", { maxRedirects: 0 });
  assert.equal(api.status(), 307);
  await context.close();
});

test("API-rutene sjekker sesjonen selv (falsk cookie slipper forbi proxy, men ikke videre)", async () => {
  const context = await newContext(browser);
  const headers = { cookie: "better-auth.session_token=falsk.verdi" };
  const r = context.request;
  const statuses = {
    sync: (await r.get("/api/sync", { headers, maxRedirects: 0 })).status(),
    upload: (await r.post("/api/filer/upload", { headers, data: { type: "blob.generate-presigned-url", payload: {} }, maxRedirects: 0 })).status(),
    fil: (await r.get("/api/filer/123e4567-e89b-12d3-a456-426614174000", { headers, maxRedirects: 0 })).status(),
    ai: (await r.post("/api/ai/parse-events", { headers, data: { text: "Konsert i morgen" }, maxRedirects: 0 })).status(),
  };
  assert.deepEqual(statuses, { sync: 401, upload: 401, fil: 401, ai: 401 });
  await context.close();
});

test("første bruker lager konto uten invitasjon og setter opp familien", async () => {
  const context = await newContext(browser);
  const page = await context.newPage();
  const errors = trackErrors(page);
  await registerOwner(page);
  await page.getByRole("heading", { level: 1, name: new RegExp(OWNER.name) }).waitFor(); // «God kveld, Kari»
  assert.deepEqual(errors, []);
  await saveSession(context, OWNER);
  await context.close();
});

test("andre bruker avvises uten invitasjonskode", async () => {
  const context = await newContext(browser);
  const page = await context.newPage();
  await page.goto("/login");
  const message = await trySignup(page, PARTNER.email, PARTNER.password);
  assert.match(message, /invitasjonslenke/);
  await context.close();
});

test("gyldig invitasjonskode hjelper ikke for e-post utenfor ALLOWED_EMAILS", async () => {
  const code = createHmac("sha256", TEST_AUTH_SECRET).update(`invite:${STRANGER.email}`).digest("base64url").slice(0, 16);
  const context = await newContext(browser);
  const page = await context.newPage();
  await page.goto(`/login?${new URLSearchParams({ epost: STRANGER.email, invitasjon: code })}`);
  await page.getByLabel("Velg passord").fill(STRANGER.password);
  await page.getByRole("button", { name: "Lag konto" }).click();
  assert.match(await alert(page).textContent(), /har ikke tilgang/);
  await context.close();
});

test("samboeren blir med via invitasjonslenken fra Innstillinger", async () => {
  // Eieren henter lenken (desktop-Chromium har ikke navigator.share → kopieres til utklippstavla).
  const owner = await newContext(browser, { device: DESKTOP, permissions: ["clipboard-read", "clipboard-write"] });
  const ownerPage = await owner.newPage();
  assert.ok(await signIn(ownerPage, OWNER), "eieren skal kunne logge inn med passord");
  await ownerPage.goto("/innstillinger");
  await ownerPage.getByText(PARTNER.email).waitFor();
  await ownerPage.getByRole("button", { name: "Send invitasjon" }).click();
  await ownerPage.getByText("Invitasjonslenken er kopiert.").waitFor();
  const clip = await ownerPage.evaluate(() => navigator.clipboard.readText());
  const link = clip.match(/https?:\/\/\S+/)?.[0];
  assert.ok(link, `fant ingen lenke i «${clip}»`);
  await owner.close();

  const partner = await newContext(browser, { colorScheme: "dark" });
  const page = await partner.newPage();
  const errors = trackErrors(page);
  await page.goto(link);
  assert.equal(await page.getByLabel("E-post").inputValue(), PARTNER.email);
  await page.getByLabel("Velg passord").fill(PARTNER.password);
  await page.getByRole("button", { name: "Lag konto" }).click();
  await page.waitForURL(/\/onboarding/);
  await page.getByLabel("Hva heter du?").fill(PARTNER.name);
  await page.getByRole("button", { name: "Kom i gang" }).click();
  await page.waitForURL(/\/hjem/);
  await page.getByRole("heading", { level: 1, name: new RegExp(PARTNER.name) }).waitFor();
  assert.deepEqual(errors, []);
  await saveSession(partner, PARTNER);
  await partner.close();
});

test("feil passord gir norsk feilmelding", async () => {
  const context = await newContext(browser);
  const page = await context.newPage();
  assert.equal(await signIn(page, { email: OWNER.email, password: "feil-passord-123" }), false);
  assert.match(await alert(page).textContent(), /Feil e-post eller passord/);
  await context.close();
});
