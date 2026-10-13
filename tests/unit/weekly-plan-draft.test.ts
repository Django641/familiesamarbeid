import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  type AiWeeklyPlan,
  draftFromAiPlan,
  isDateKey,
  isDuplicateEvent,
  matchChild,
  moveRow,
  normalizeTitle,
  rowError,
  rowToEventDraft,
  saveLabel,
  similarTitles,
} from "@/lib/weekly-plan-draft";
import { draftToRow } from "@/lib/event-draft";

import { event, person } from "./helpers";

const ada = { ...person("ada"), name: "Ada", kind: "barn" as const };
const lea = { ...person("lea"), name: "Lea", kind: "barn" as const };
const kari = { ...person("kari"), name: "Kari", kind: "voksen" as const };
const people = [kari, ada, lea];

// Mandag 2026-10-19 (uke 43). «I dag» er søndag før.
const WEEK = "2026-10-19";
const TODAY = "2026-10-18";

const plan: AiWeeklyPlan = {
  person: "Lea",
  week_start: WEEK,
  goals: ["Jeg kan 7-gangen"],
  homework: [
    { text: "Les s. 12–15", due: "2026-10-20" },
    { text: "Øv på glosene", due: "" },
  ],
  calendar: [
    { title: "Tur til Nordmarka", date: "2026-10-21", start_time: "09:00", end_time: "13:00", all_day: false, kind: "hendelse", notes: "" },
    { title: "🩳 Gymtøy", date: "2026-10-22", start_time: "", end_time: "", all_day: true, kind: "ta_med", notes: "" },
  ],
  explanation: "",
};

function draft(ai: Partial<AiWeeklyPlan> = {}, existing = [] as ReturnType<typeof event>[], today = TODAY) {
  return draftFromAiPlan({ ...plan, ...ai }, { people, existingEvents: existing, today });
}

describe("normalizeTitle / similarTitles", () => {
  test("emoji, store bokstaver og tegnsetting fjernes", () => {
    assert.equal(normalizeTitle("🩳 Gymtøy!"), "gymtøy");
    assert.equal(normalizeTitle("  GYMTØY  "), "gymtøy");
    assert.equal(normalizeTitle("🏊‍♀️ Svømmetøy 🏊"), "svømmetøy");
  });

  test("lik etter normalisering eller hele ord inni hverandre", () => {
    assert.ok(similarTitles("🩳 Gymtøy", "gymtøy"));
    assert.ok(similarTitles("Gymtøy", "Gymtøy og drikkeflaske"));
    assert.ok(similarTitles("Foreldremøte 3B", "Foreldremøte"));
  });

  test("ulike titler, delord og for korte titler matcher ikke", () => {
    assert.ok(!similarTitles("Gymtøy", "Svømmetøy"));
    assert.ok(!similarTitles("Gym", "Gymtøy"));
    assert.ok(!similarTitles("Tur", "Tur til Nordmarka"));
    assert.ok(!similarTitles("Tøy", "Gymtøy"));
    assert.ok(!similarTitles("🩳", "🩳"));
  });
});

describe("isDuplicateEvent", () => {
  const row = { text: "🩳 Gymtøy", date: "2026-10-22" };

  test("samme dag, samme barn og lik tittel", () => {
    const e = event("Gymtøy", "2026-10-22", null, { people: ["lea"] });
    assert.ok(isDuplicateEvent(row, [e], "lea"));
  });

  test("annen dag, annet barn eller annen tittel er ikke dublett", () => {
    assert.ok(!isDuplicateEvent(row, [event("Gymtøy", "2026-10-23", null, { people: ["lea"] })], "lea"));
    assert.ok(!isDuplicateEvent(row, [event("Gymtøy", "2026-10-22", null, { people: ["ada"] })], "lea"));
    assert.ok(!isDuplicateEvent(row, [event("Svømming", "2026-10-22", null, { people: ["lea"] })], "lea"));
  });

  test("dagen sammenlignes i Oslo-tid, ikke UTC", () => {
    // 23:30 Oslo (CEST) er 21:30 UTC samme dag; 00:30 Oslo den 23. er 22:30 UTC den 22.
    const late = event("Gymtøy", "2026-10-22T23:30", null, { people: ["lea"] });
    const early = event("Gymtøy", "2026-10-23T00:30", null, { people: ["lea"] });
    assert.ok(isDuplicateEvent(row, [late], "lea"));
    assert.ok(!isDuplicateEvent(row, [early], "lea"));
  });

  test("flerdagshendelse dekker hver dag", () => {
    const trip = event("Gymtøy-leir", "2026-10-21", "2026-10-23", { people: ["lea"] });
    assert.ok(isDuplicateEvent(row, [trip], "lea"));
  });

  test("ukjent barn: bare dato og tittel avgjør", () => {
    assert.ok(isDuplicateEvent(row, [event("Gymtøy", "2026-10-22", null, { people: ["ada"] })], ""));
  });

  test("rad uten dato er aldri dublett", () => {
    assert.ok(!isDuplicateEvent({ text: "Gymtøy", date: "" }, [event("Gymtøy", "2026-10-22", null)], "lea"));
  });
});

describe("matchChild", () => {
  test("navn matches uavhengig av store/små bokstaver, bare barn", () => {
    assert.equal(matchChild("lea", people), "lea");
    assert.equal(matchChild(" ADA ", people), "ada");
    assert.equal(matchChild("Kari", people), "");
    assert.equal(matchChild("", people), "");
    assert.equal(matchChild("Ole", people), "");
  });
});

describe("isDateKey", () => {
  test("avviser ugyldige og umulige datoer", () => {
    assert.ok(isDateKey("2026-10-19"));
    assert.ok(isDateKey("2028-02-29"));
    assert.ok(!isDateKey("2026-02-30"));
    assert.ok(!isDateKey("2026-13-01"));
    assert.ok(!isDateKey("19.10.2026"));
    assert.ok(!isDateKey(""));
  });
});

describe("draftFromAiPlan", () => {
  test("fordeler på kalender, lekser og mål med alt forhåndshuket", () => {
    const d = draft();
    assert.equal(d.personId, "lea");
    assert.equal(d.weekStart, WEEK);
    assert.equal(d.weekGuessed, false);
    assert.deepEqual(
      d.rows.map((r) => [r.group, r.text, r.date, r.selected]),
      [
        ["kalender", "Tur til Nordmarka", "2026-10-21", true],
        ["kalender", "🩳 Gymtøy", "2026-10-22", true],
        ["lekse", "Øv på glosene", "", true],
        ["lekse", "Les s. 12–15", "2026-10-20", true],
        ["mal", "Jeg kan 7-gangen", "", true],
      ]
    );
    assert.deepEqual(new Set(d.rows.map((r) => r.key)).size, d.rows.length);
  });

  test("ta med blir heldag selv om AI-en oppga klokkeslett", () => {
    const d = draft({
      calendar: [{ ...plan.calendar[1], start_time: "08:00", end_time: "09:00", all_day: false }],
    });
    assert.equal(d.rows[0].allDay, true);
    assert.equal(d.rows[0].startTime, "");
    assert.equal(d.rows[0].endTime, "");
  });

  test("hendelse uten gyldig klokkeslett blir heldag; ukjent kind blir hendelse", () => {
    const d = draft({
      calendar: [{ ...plan.calendar[0], start_time: "9", all_day: false, kind: "noe-annet" }],
    });
    assert.equal(d.rows[0].allDay, true);
    assert.equal(d.rows[0].kind, "hendelse");
  });

  test("dublett i kalenderen er ikke forhåndshuket (også gjentakende «Gymtøy hver torsdag»)", () => {
    const gym = event("Gymtøy", "2026-10-22", null, { people: ["lea"] });
    const d = draft({}, [gym]);
    const row = d.rows.find((r) => r.text.includes("Gymtøy"))!;
    assert.equal(row.duplicate, true);
    assert.equal(row.selected, false);
    assert.equal(d.rows.find((r) => r.text.startsWith("Tur"))!.selected, true);
  });

  test("dublett for et annet barn teller ikke", () => {
    const gym = event("Gymtøy", "2026-10-22", null, { people: ["ada"] });
    assert.equal(draft({}, [gym]).rows.find((r) => r.text.includes("Gymtøy"))!.selected, true);
  });

  test("passerte kalenderdatoer er ikke forhåndshuket, i dag er det", () => {
    const d = draft({}, [], "2026-10-22");
    assert.equal(d.rows.find((r) => r.text.startsWith("Tur"))!.past, true);
    assert.equal(d.rows.find((r) => r.text.startsWith("Tur"))!.selected, false);
    assert.equal(d.rows.find((r) => r.text.includes("Gymtøy"))!.selected, true);
    // lekser påvirkes ikke av «passert»
    assert.equal(d.rows.find((r) => r.text.startsWith("Les"))!.selected, true);
  });

  test("kalenderrad uten gyldig dato beholdes, men er ikke huket", () => {
    const d = draft({ calendar: [{ ...plan.calendar[0], date: "tirsdag" }] });
    assert.equal(d.rows[0].date, "");
    assert.equal(d.rows[0].selected, false);
    assert.equal(rowError(d.rows[0]), "Velg en dato.");
  });

  test("uke: ikke-mandag snappes til mandagen; manglende uke gir inneværende uke og weekGuessed", () => {
    assert.equal(draft({ week_start: "2026-10-22" }).weekStart, WEEK);
    const guessed = draft({ week_start: "" });
    assert.equal(guessed.weekStart, "2026-10-12");
    assert.equal(guessed.weekGuessed, true);
    assert.equal(draft({ week_start: "2026-02-30" }).weekGuessed, true);
  });

  test("lekse med frist utenfor uka eller ugyldig frist blir «hele uka»", () => {
    const d = draft({
      homework: [
        { text: "A", due: "2026-10-26" },
        { text: "B", due: "2026-10-18" },
        { text: "C", due: "tirsdag" },
        { text: "D", due: "2026-10-23" },
      ],
    });
    assert.deepEqual(
      d.rows.filter((r) => r.group === "lekse").map((r) => [r.text, r.date]),
      [
        ["A", ""],
        ["B", ""],
        ["C", ""],
        ["D", "2026-10-23"],
      ]
    );
  });

  test("ukjent barn gir tom personId; tomme tekster fjernes", () => {
    const d = draft({ person: "Ole", goals: ["  ", "Mål"], homework: [{ text: " ", due: "" }], calendar: [] });
    assert.equal(d.personId, "");
    assert.deepEqual(
      d.rows.map((r) => r.text),
      ["Mål"]
    );
  });

  test("tomt svar gir ingen rader", () => {
    const d = draft({ goals: [], homework: [], calendar: [], explanation: "Bildet viser ikke en ukeplan" });
    assert.equal(d.rows.length, 0);
    assert.equal(d.explanation, "Bildet viser ikke en ukeplan");
  });
});

describe("moveRow", () => {
  const rows = draft().rows;
  const tur = rows.find((r) => r.text.startsWith("Tur"))!;
  const lekse = rows.find((r) => r.text.startsWith("Les"))!;
  const mal = rows.find((r) => r.group === "mal")!;

  test("kalender → lekse beholder dagen når den er i uka", () => {
    const moved = moveRow(tur, "lekse", WEEK);
    assert.equal(moved.group, "lekse");
    assert.equal(moved.date, "2026-10-21");
  });

  test("kalender → mål nullstiller dag", () => {
    assert.equal(moveRow(tur, "mal", WEEK).date, "");
  });

  test("lekse → kalender får dagen, heldag og kan lagres; «hele uka» får mandag", () => {
    const moved = moveRow(lekse, "kalender", WEEK);
    assert.equal(moved.date, "2026-10-20");
    assert.equal(moved.allDay, true);
    assert.equal(rowError(moved), null);
    assert.equal(moveRow(mal, "kalender", WEEK).date, WEEK);
  });

  test("samme gruppe endrer ingenting", () => {
    assert.equal(moveRow(tur, "kalender", WEEK), tur);
  });
});

describe("rowToEventDraft", () => {
  test("gir kategori skole og barnet som person, og går gjennom draftToRow (heldag = midnatt Oslo)", () => {
    const gym = draft().rows.find((r) => r.text.includes("Gymtøy"))!;
    const result = draftToRow(rowToEventDraft(gym, "lea"));
    assert.ok("row" in result);
    assert.equal(result.row.category, "skole");
    assert.deepEqual(result.row.person_ids, ["lea"]);
    assert.equal(result.row.all_day, true);
    // 22. okt. 00:00 Oslo (CEST) = 21. okt. 22:00 UTC
    assert.equal(result.row.starts_at, "2026-10-21T22:00:00.000Z");
    assert.equal(result.row.ends_at, null);
  });

  test("tidsbestemt hendelse får klokkeslett over sommertidsskiftet (25. okt.)", () => {
    const tur = draft({
      calendar: [{ ...plan.calendar[0], date: "2026-10-26", start_time: "09:00", end_time: "13:00" }],
    }).rows[0];
    const result = draftToRow(rowToEventDraft(tur, "lea"));
    assert.ok("row" in result);
    assert.equal(result.row.starts_at, "2026-10-26T08:00:00.000Z"); // CET: UTC+1
  });
});

describe("saveLabel", () => {
  test("teller valgte rader per gruppe", () => {
    assert.equal(saveLabel(draft().rows), "Lagre: 2 i kalenderen, 2 lekser, 1 mål");
    const rows = draft().rows.map((r) => (r.group === "lekse" ? { ...r, selected: false } : r));
    assert.equal(saveLabel(rows), "Lagre: 2 i kalenderen, 1 mål");
  });

  test("entall og tomt valg", () => {
    const one = draft({ calendar: [], goals: [], homework: [plan.homework[0]] }).rows;
    assert.equal(saveLabel(one), "Lagre: 1 lekse");
    assert.equal(saveLabel(one.map((r) => ({ ...r, selected: false }))), "Ingenting å lagre");
  });
});
