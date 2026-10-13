// Lekser, flere filer og avbrudd: to barn i én opplasting, flere skjermbilder av samme plan,
// ukjent barn, Avbryt rydder Blob, og systemprompten til hurtigfeltet er uendret etter refaktoreringen.
// Svarene knyttes til filinnholdet (match), siden filene leses parallelt i vilkårlig rekkefølge.

import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";

import { OWNER } from "./fixtures.mjs";
import {
  aiRequests,
  aiWeeklyPlan,
  blobFiles,
  inspectImage,
  lastAiRequest,
  launch,
  makeTestPng,
  loggedIn,
  nextAiResponse,
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

const pdf = (marker) =>
  Buffer.from(`%PDF-1.4\n% ${marker}\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n`);

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

async function pickImages(buffers) {
  await page.goto("/lekser/ny");
  const chooser = page.waitForEvent("filechooser");
  await page.getByText("Velg PDF eller bilder").click();
  await (await chooser).setFiles(buffers.map((buffer, i) => ({ name: `skjermbilde-${i + 1}.png`, mimeType: "image/png", buffer })));
}

async function pick(files) {
  await page.goto("/lekser/ny");
  const chooser = page.waitForEvent("filechooser");
  await page.getByText("Velg PDF eller bilder").click();
  await (await chooser).setFiles(files.map(({ name, marker }) => ({ name, mimeType: "application/pdf", buffer: pdf(marker) })));
}

const savedPaths = async () => (await blobFiles()).map((f) => f.pathname);

test("to barn i samme opplasting gir to ark som lagres hver for seg", async () => {
  const ids = await peopleIds();
  const week = osloMonday(3);
  await nextAiResponse({
    kind: "weekly_plan",
    match: "MARKER-MIA",
    output: aiWeeklyPlan({ person: "Mia", week_start: week, goals: ["Mål for Mia"], homework: [{ text: "Lekse for Mia", due: "" }], calendar: [] }),
  });
  await nextAiResponse({
    kind: "weekly_plan",
    match: "MARKER-NOA",
    output: aiWeeklyPlan({ person: "Noa", week_start: week, goals: ["Mål for Noa"], homework: [{ text: "Lekse for Noa", due: "" }], calendar: [] }),
  });
  // Rekkefølgen i arkene følger rekkefølgen på filene, ikke hvilket kall som ble ferdig først.
  await pick([
    { name: "plan-mia.pdf", marker: "MARKER-MIA" },
    { name: "plan-noa.pdf", marker: "MARKER-NOA" },
  ]);

  await page.getByText("Ukeplan 1 av 2").waitFor();
  assert.equal(await page.getByRole("button", { name: "Mia", exact: true }).getAttribute("aria-pressed"), "true");
  assert.equal(await page.getByRole("button", { name: "Noa", exact: true }).getAttribute("aria-pressed"), "false");
  await page.getByRole("button", { name: /Lekse for Mia/ }).waitFor();
  assert.equal(await page.getByRole("button", { name: /Lekse for Noa/ }).count(), 0, "Noas lekse hører til ark 2");
  await page.getByRole("button", { name: /Hopp over · Neste: Noa/ }).waitFor();

  await page.getByRole("button", { name: /^Lagre:/ }).click();
  await page.getByText("Ukeplan 2 av 2").waitFor();
  await page.getByText("Mia er lagret.").waitFor();
  assert.equal(await page.getByRole("button", { name: "Noa", exact: true }).getAttribute("aria-pressed"), "true");
  await page.getByRole("button", { name: /Lekse for Noa/ }).waitFor();
  await page.getByRole("button", { name: /^Lagre:/ }).click();
  await page.waitForURL((u) => u.pathname === "/lekser" && u.searchParams.get("uke") === week);
  assert.equal(new URL(page.url()).searchParams.get("barn"), null, "to barn lagret → ingen enkeltvisning");

  const rows = await sql(
    "select w.person_id, i.text, i.kind from homework_items i join homework_weeks w on w.id = i.week_id where w.week_start = $1 order by i.text",
    [week]
  );
  assert.deepEqual(
    rows.map((r) => [r.person_id, r.text]),
    [
      [ids.Mia, "Lekse for Mia"],
      [ids.Noa, "Lekse for Noa"],
      [ids.Mia, "Mål for Mia"],
      [ids.Noa, "Mål for Noa"],
    ]
  );
  const docs = await sql("select d.name, w.person_id from documents d join homework_weeks w on w.id = d.homework_week_id where w.week_start = $1", [week]);
  assert.deepEqual(docs.map((d) => d.person_id).sort(), [ids.Mia, ids.Noa].sort(), "én original per barn");
  assert.equal((await aiRequests()).filter((r) => r.kind === "weekly_plan").length, 2, "ett kall per fil");
});

test("flere PDF-er for samme barn slås sammen til ett ark; uka hentes fra filen som har den", async () => {
  const ids = await peopleIds();
  const week = osloMonday(4);
  await nextAiResponse({
    kind: "weekly_plan",
    match: "MARKER-DEL1",
    output: aiWeeklyPlan({
      person: "Mia",
      week_start: "", // første bilde viser ikke uka
      goals: [],
      homework: [{ text: "Lekse A", due: "" }, { text: "Felles lekse", due: "" }],
      calendar: [],
    }),
  });
  await nextAiResponse({
    kind: "weekly_plan",
    match: "MARKER-DEL2",
    output: aiWeeklyPlan({
      person: "Mia",
      week_start: week,
      goals: ["Mål B"],
      homework: [{ text: "Lekse B", due: "" }, { text: "Felles lekse", due: "" }],
      calendar: [],
    }),
  });
  await pick([
    { name: "del1.pdf", marker: "MARKER-DEL1" },
    { name: "del2.pdf", marker: "MARKER-DEL2" },
  ]);

  await page.getByRole("button", { name: /^Lagre:/ }).waitFor();
  assert.equal(await page.getByText(/Ukeplan \d av \d/).count(), 0, "bare ett ark");
  await page.getByRole("button", { name: /Lekse A/ }).waitFor();
  await page.getByRole("button", { name: /Lekse B/ }).waitFor();
  assert.equal(await page.getByRole("button", { name: /Felles lekse/ }).count(), 1, "like rader tas med én gang");
  await page.getByRole("button", { name: "Lagre: 3 lekser, 1 mål" }).waitFor();

  await page.getByRole("button", { name: /^Lagre:/ }).click();
  await page.waitForURL((u) => u.pathname === "/lekser" && u.searchParams.get("uke") === week && u.searchParams.get("barn") === ids.Mia);

  const items = await sql(
    "select i.text from homework_items i join homework_weeks w on w.id = i.week_id where w.week_start = $1 and w.person_id = $2 order by i.text",
    [week, ids.Mia]
  );
  assert.deepEqual(items.map((r) => r.text), ["Felles lekse", "Lekse A", "Lekse B", "Mål B"].sort());
  const docs = await sql("select count(*)::int as n from documents d join homework_weeks w on w.id = d.homework_week_id where w.week_start = $1", [week]);
  assert.equal(docs[0].n, 2, "begge originalene er koblet til uka");
});

test("flere skjermbilder går i ÉTT AI-kall med alle bildene, og gir ett ark", async () => {
  const ids = await peopleIds();
  const week = osloMonday(7);
  const a = Buffer.from(await makeTestPng(page, { width: 600, height: 400 }), "base64");
  const b = Buffer.from(await makeTestPng(page, { width: 500, height: 700 }), "base64");
  await nextAiResponse({
    kind: "weekly_plan",
    output: aiWeeklyPlan({ person: "Mia", week_start: week, goals: [], homework: [{ text: "Lekse fra bildene", due: "" }], calendar: [] }),
  });
  await pickImages([a, b]);

  await page.getByRole("button", { name: /Lekse fra bildene/ }).waitFor();
  const calls = (await aiRequests()).filter((r) => r.kind === "weekly_plan");
  assert.equal(calls.length, 1, "ett kall for alle bildene");
  const sent = await lastAiRequest();
  assert.equal(sent.attachments.length, 2);
  for (const att of sent.attachments) {
    assert.match(att.media_type, /^image\//);
    const info = await inspectImage(page, att.data, att.media_type);
    assert.ok(info.distinctColors > 1, "bildet som sendes er ikke blankt");
  }
  assert.match(sent.text, /2 bildene/);
  assert.doesNotMatch(sent.text, /Dette er .*ukeplan/, "ingen gjette-hint om barnet i kommentaren");

  await page.getByRole("button", { name: /^Lagre:/ }).click();
  await page.waitForURL((u) => u.pathname === "/lekser" && u.searchParams.get("uke") === week && u.searchParams.get("barn") === ids.Mia);
  const docs = await sql("select count(*)::int as n from documents d join homework_weeks w on w.id = d.homework_week_id where w.week_start = $1", [week]);
  assert.equal(docs[0].n, 2, "begge originalene er koblet til uka");
});

test("ukjent barn: «Gjelder» må velges før lagring", async () => {
  const ids = await peopleIds();
  const week = osloMonday(5);
  await nextAiResponse({
    kind: "weekly_plan",
    output: aiWeeklyPlan({ person: "", week_start: week, goals: [], homework: [{ text: "Lekse uten eier", due: "" }], calendar: [] }),
  });
  await pick([{ name: "ukjent.pdf", marker: "MARKER-UKJENT" }]);

  await page.getByText("Fant ikke hvem planen gjelder").waitFor();
  const save = page.getByRole("button", { name: /^Lagre:/ });
  await save.waitFor();
  assert.equal(await save.isDisabled(), true, "Lagre er av til et barn er valgt");
  assert.equal(await page.getByRole("button", { name: "Mia", exact: true }).getAttribute("aria-pressed"), "false");
  assert.equal(await page.getByRole("button", { name: "Noa", exact: true }).getAttribute("aria-pressed"), "false");
  assert.equal((await sql("select count(*)::int as n from homework_items where text = 'Lekse uten eier'"))[0].n, 0);

  await page.getByRole("button", { name: "Noa", exact: true }).click();
  await page.getByText("Fant ikke hvem planen gjelder").waitFor({ state: "detached" });
  await save.click();
  await page.waitForURL((u) => u.pathname === "/lekser" && u.searchParams.get("barn") === ids.Noa);
  const rows = await sql("select w.person_id from homework_items i join homework_weeks w on w.id = i.week_id where i.text = 'Lekse uten eier'");
  assert.deepEqual(rows.map((r) => r.person_id), [ids.Noa]);
});

test("Avbryt sletter originalen i Blob og lagrer ingen dokumenter eller lekser", async () => {
  const week = osloMonday(6);
  const before = await savedPaths();
  await nextAiResponse({
    kind: "weekly_plan",
    output: aiWeeklyPlan({ person: "Mia", week_start: week, goals: [], homework: [{ text: "Lekse som avbrytes", due: "" }], calendar: [] }),
  });
  const docsBefore = (await sql("select count(*)::int as n from documents"))[0].n;
  await pick([{ name: "avbryt.pdf", marker: "MARKER-AVBRYT" }]);
  await page.getByRole("button", { name: /^Lagre:/ }).waitFor();

  // Originalen ligger i Blob mens arket er åpent.
  await waitUntil(async () => (await savedPaths()).some((p) => !before.includes(p) && p.includes("avbryt.pdf")), "originalen er lastet opp");
  const added = (await savedPaths()).filter((p) => !before.includes(p));
  assert.equal(added.length, 1);

  await page.getByRole("button", { name: "Avbryt", exact: true }).click();
  await page.waitForURL((u) => u.pathname === "/lekser" && !u.searchParams.has("uke"));
  await waitUntil(async () => !(await savedPaths()).includes(added[0]), "originalen er slettet fra Blob");
  assert.equal((await sql("select count(*)::int as n from documents"))[0].n, docsBefore, "ingen dokument opprettet");
  assert.equal((await sql("select count(*)::int as n from documents where pathname = $1", [added[0]]))[0].n, 0);
  assert.equal((await sql("select count(*)::int as n from homework_items where text = 'Lekse som avbrytes'"))[0].n, 0);
  assert.equal((await sql("select count(*)::int as n from homework_weeks where week_start = $1", [week]))[0].n, 0);
});

test("hurtigfeltets systemprompt er uendret etter refaktoreringen (parse-events)", async () => {
  await nextAiResponse({ kind: "events", output: { events: [], explanation: "Ingen dato." } });
  await page.goto("/kalender");
  const field = page.getByLabel("Ny hendelse: skriv eller lim inn tekst");
  await field.fill("Foreldremøte for 4B");
  await page.getByRole("button", { name: "Legg inn" }).click();
  // Vent på selve kallet (en annen melding med role=alert kan dukke opp før svaret er registrert).
  const eventsRequest = async () => (await aiRequests()).filter((r) => r.kind === "events").at(-1);
  await waitUntil(async () => Boolean(await eventsRequest()), "hurtigfeltet har kalt Claude");
  const { system } = await eventsRequest();

  // Ordrett fra versjonen før refaktoreringen (lib/ai-route.ts GRADE_RULE er flyttet ut av prompten).
  const peopleRule =
    "- «people»: bruk bare navn fra familielista. Bruk kjennetegnene til å koble meldingen til riktig person: klasse/trinn, skole, lag, aktivitet, arbeidsplass. En melding til «4. trinn» eller «4B» gjelder barnet som går der. Klassetrinn regnes ut fra fødselsår: trinn = startåret for skoleåret − fødselsår − 5 (skoleåret starter i august; født 2017 → 4. trinn i skoleåret 2026/27). Står både fødselsår og en klasse i kjennetegnene, gjelder fødselsåret for trinnet (klassen kan være fra i fjor), mens bokstaven (f.eks. «B» i 4B) fortsatt gjelder. Er det uklart hvem det gjelder, la «people» stå tom heller enn å gjette.";
  assert.ok(system.includes(peopleRule), "people-regelen er ordrett lik");
  assert.match(system, /^Du hjelper en norsk familie med å legge hendelser i en delt kalender\./);
  assert.match(system, /I dag er \p{L}+ \d{4}-\d{2}-\d{2} \(Europe\/Oslo\)\. Relative datoer/u);
  assert.match(system, /Familien \(med kjennetegn de voksne har skrevet\):\n- .+ \((barn|voksen)\)/);
  assert.match(system, /\nDen som skriver er Kari: «jeg», «meg» og «min» betyr Kari\./);
});
