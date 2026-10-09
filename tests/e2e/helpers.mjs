// Felles hjelpere for nettlesertestene. Startes via scripts/e2e.mjs, som setter E2E_*-variablene.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import pg from "pg";
import { chromium } from "playwright-core";

import { CHILDREN, OWNER } from "./fixtures.mjs";

export const BASE = process.env.E2E_BASE_URL;
export const ANTHROPIC = process.env.E2E_ANTHROPIC_URL;
export const BLOB = process.env.E2E_BLOB_URL;
const TMP = process.env.E2E_TMP;

if (!BASE || !ANTHROPIC || !BLOB || !TMP) {
  throw new Error("Kjør e2e-testene med `npm run e2e` (scripts/e2e.mjs setter opp server og mocks).");
}

/** Oslo-dato «YYYY-MM-DD», n dager fram. */
export function osloDay(n = 0) {
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Oslo" });
  const [y, m, d] = today.split("-").map(Number);
  // Dager legges til selve datoen (UTC-regning på kalenderdatoer), ikke n × 24 t — sommertidsskiftet har 23/25 t.
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export const IPHONE = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
};
export const DESKTOP = { viewport: { width: 1280, height: 900 } };

let contexts = 0;

export async function launch() {
  return chromium.launch();
}

/**
 * Ny nettleserkontekst («en telefon»). Hver kontekst får sin egen x-forwarded-for, så
 * Better Auth sin grense på tre innlogginger per 10 s per IP gjelder per telefon, som i virkeligheten.
 */
export async function newContext(browser, { device = IPHONE, storageState, colorScheme = "light", permissions } = {}) {
  contexts += 1;
  const context = await browser.newContext({
    ...device,
    baseURL: BASE,
    locale: "nb-NO",
    timezoneId: "Europe/Oslo",
    colorScheme,
    storageState,
    extraHTTPHeaders: { "x-forwarded-for": `10.${process.pid % 250}.${Math.floor(contexts / 250)}.${contexts % 250}` },
  });
  if (permissions) await context.grantPermissions(permissions, { origin: BASE });
  context.setDefaultTimeout(15_000);
  return context;
}

/** Venter til `check()` blir sann (poller, ingen faste pauser). */
export async function waitUntil(check, what = "betingelsen", timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`Tidsavbrudd: ${what}`);
}

/** Samler JavaScript-feil i siden, så testen kan kreve at det ikke var noen. */
export function trackErrors(page) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

/**
 * Synlig feilmelding (role="alert" med tekst). Next har sin egen tomme role="alert"
 * (rute-annonsøren), så tomme elementer filtreres bort.
 */
export function alert(page) {
  return page.getByRole("alert").filter({ hasText: /\S/ }).first();
}

export async function signIn(page, user) {
  await page.goto("/login");
  await page.getByLabel("E-post").fill(user.email);
  await page.getByLabel("Passord", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  const result = await Promise.race([
    page.waitForURL(/\/(hjem|onboarding)/).then(() => "ok"),
    alert(page).waitFor().then(() => "feil"),
  ]);
  return result === "ok";
}

/** Første gang: lag eierens konto og familie (bare mulig når databasen er tom). */
export async function registerOwner(page) {
  await page.goto("/login");
  await page.getByRole("radio", { name: "Første gang" }).click();
  await page.getByLabel("E-post").fill(OWNER.email);
  await page.getByLabel("Velg passord").fill(OWNER.password);
  await page.getByRole("button", { name: "Lag konto" }).click();
  await page.waitForURL(/\/onboarding/);
  await page.getByLabel("Hva heter du?").fill(OWNER.name);
  for (const [i, name] of CHILDREN.entries()) {
    await page.getByRole("textbox", { name: `Barn ${i + 1}` }).fill(name);
  }
  await page.getByRole("button", { name: "Kom i gang" }).click();
  await page.waitForURL(/\/hjem/);
}

/**
 * Innlogget kontekst for en bruker. Sesjonen lagres i temp-mappa og gjenbrukes av
 * neste testfil, så vi logger inn så sjelden som mulig. Finnes ikke eieren ennå
 * (testfila kjøres alene), lages den.
 */
export async function loggedIn(browser, user = OWNER, options = {}) {
  const stateFile = path.join(TMP, `sesjon-${user.email}.json`);
  if (fs.existsSync(stateFile)) {
    const context = await newContext(browser, { ...options, storageState: stateFile });
    return { context, page: await context.newPage() };
  }
  const context = await newContext(browser, options);
  const page = await context.newPage();
  if (!(await signIn(page, user))) {
    assert.equal(user, OWNER, `${user.email} finnes ikke — lag kontoen i testen først`);
    await registerOwner(page);
  }
  await context.storageState({ path: stateFile });
  return { context, page };
}

/** Lagrer sesjonen for en bruker som nettopp er laget/innlogget i `context`. */
export async function saveSession(context, user) {
  await context.storageState({ path: path.join(TMP, `sesjon-${user.email}.json`) });
}

// --- Testdata rett i databasen ---------------------------------------------

/** Kjører én SQL-spørring mot testdatabasen (bare til å legge inn testdata). */
export async function sql(text, params = []) {
  const client = new pg.Client({ connectionString: process.env.E2E_DATABASE_URL });
  await client.connect();
  try {
    return (await client.query(text, params)).rows;
  } finally {
    await client.end();
  }
}

/** Personene i familien, som { navn: id }. */
export async function peopleIds() {
  const rows = await sql("select id, name from people order by position");
  return Object.fromEntries(rows.map((r) => [r.name, r.id]));
}

/** Oslo-tid → ISO. Grovt (sommer/vinter via Intl), godt nok for testdata. */
export function oslo(dateKey, time = "00:00") {
  const guess = new Date(`${dateKey}T${time}:00Z`);
  const local = new Date(guess.toLocaleString("en-US", { timeZone: "Europe/Oslo" }));
  const utc = new Date(guess.toLocaleString("en-US", { timeZone: "UTC" }));
  return new Date(guess.getTime() - (local.getTime() - utc.getTime())).toISOString();
}

export async function insertEvent({ title, category = "annet", start, end = null, allDay = false, people = [], location = null }) {
  const [row] = await sql(
    "insert into events (title, category, starts_at, ends_at, all_day, person_ids, location) values ($1, $2, $3, $4, $5, $6, $7) returning id",
    [title, category, start, end, allDay, people, location]
  );
  return row.id;
}

// --- Falsk Claude ---------------------------------------------------------

/** Neste AI-svar: `output` blir JSON-teksten Claude «svarer» med. */
export async function nextAiResponse(response) {
  const res = await fetch(`${ANTHROPIC}/__next-response`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(response),
  });
  assert.equal(res.status, 200);
}

export async function lastAiRequest() {
  const res = await fetch(`${ANTHROPIC}/__last-request`);
  return res.ok ? res.json() : null;
}

export async function aiRequests() {
  return (await fetch(`${ANTHROPIC}/__requests`)).json();
}

export async function resetAi() {
  await fetch(`${ANTHROPIC}/__reset`, { method: "POST" });
}

/** Ett AI-forslag i formatet appen ber Claude om (se app/api/ai/parse-events/route.ts). */
export function aiEvent(overrides = {}) {
  const date = overrides.date ?? osloDay(1);
  return {
    title: "Testhendelse",
    date,
    start_time: "18:00",
    end_date: date,
    end_time: "",
    all_day: false,
    location: "",
    category: "annet",
    people: [],
    notes: "",
    ...overrides,
  };
}

// --- Falsk Blob -----------------------------------------------------------

export async function blobFiles() {
  return (await fetch(`${BLOB}/__files`)).json();
}

// --- Bilder ----------------------------------------------------------------

/**
 * Tegner et syntetisk «skjermbilde» i nettleseren og returnerer det som PNG (base64).
 * Rødt felt øverst til venstre, blått nederst til høyre, tekst i midten — lett å kjenne igjen.
 */
export async function makeTestPng(page, { width = 600, height = 400, noise = false, plain = false } = {}) {
  return page.evaluate(
    async ({ width, height, noise, plain }) => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      if (noise) {
        const img = ctx.getImageData(0, 0, width, height);
        let seed = 123456789; // xorshift: reproduserbar «støy» som ikke lar seg pakke (PNG må bli stor)
        const next = () => ((seed ^= seed << 13), (seed ^= seed >>> 17), (seed ^= seed << 5), seed >>> 0);
        for (let i = 0; i < img.data.length; i += 4) {
          const v = next();
          img.data[i] = v & 255;
          img.data[i + 1] = (v >>> 8) & 255;
          img.data[i + 2] = (v >>> 16) & 255;
          img.data[i + 3] = 255;
        }
        ctx.putImageData(img, 0, 0);
      }
      if (!plain) {
      ctx.fillStyle = "#e11d48";
      ctx.fillRect(0, 0, width / 3, height / 3);
      ctx.fillStyle = "#1d4ed8";
      ctx.fillRect((width * 2) / 3, (height * 2) / 3, width / 3, height / 3);
      ctx.fillStyle = "#111111";
      ctx.font = `${Math.round(height / 10)}px sans-serif`;
      ctx.fillText("Foreldremøte 5C tirsdag kl 18", width / 10, height / 2);
      }
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let binary = "";
      for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return btoa(binary);
    },
    { width, height, noise, plain }
  );
}

/**
 * Dekoder et bilde (base64) i nettleseren og beskriver det: størrelse, om det er ensfarget,
 * og fargen i hjørnene. Brukes til å sjekke at bildet Claude fikk ikke er blankt.
 */
export async function inspectImage(page, base64, mediaType) {
  return page.evaluate(
    async ({ base64, mediaType }) => {
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const bitmap = await createImageBitmap(new Blob([bytes], { type: mediaType }));
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(bitmap, 0, 0);
      const pixel = (x, y) => Array.from(ctx.getImageData(Math.floor(x), Math.floor(y), 1, 1).data.slice(0, 3));
      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      let distinct = new Set();
      for (let i = 0; i < data.length && distinct.size < 50; i += 4 * 97) distinct.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
      return {
        width: bitmap.width,
        height: bitmap.height,
        distinctColors: distinct.size,
        topLeft: pixel(bitmap.width / 6, bitmap.height / 6),
        bottomRight: pixel((bitmap.width * 5) / 6, (bitmap.height * 5) / 6),
      };
    },
    { base64, mediaType }
  );
}

/** «Rødaktig» / «blåaktig» med god margin (JPEG-komprimering endrer fargene litt). */
export const isRed = ([r, g, b]) => r > 180 && g < 90 && b < 120;
export const isBlue = ([r, g, b]) => b > 160 && r < 90 && g < 120;
