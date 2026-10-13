import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  assignUnknownToSoleChild,
  batchUploads,
  carryOverDone,
  defaultWeekStart,
  groupWeek,
  type HomeworkEntry,
  homeworkDayFor,
  homeworkForDay,
  inferWeekStart,
  mergeDrafts,
  planDocumentName,
  recheckRow,
  shiftHomeworkDates,
  weekLabel,
} from "@/lib/homework";
import type { PlanDraft, PlanRow } from "@/lib/weekly-plan-draft";

import { event } from "./helpers";

// 2026-10-19 er mandag (uke 43).
const row = (over: Partial<PlanRow>): PlanRow => ({
  key: "x",
  group: "lekse",
  selected: true,
  text: "Les",
  date: "",
  allDay: true,
  startTime: "",
  endTime: "",
  notes: "",
  kind: "hendelse",
  duplicate: false,
  past: false,
  ...over,
});
const draft = (over: Partial<PlanDraft>): PlanDraft => ({
  personId: "ada",
  weekStart: "2026-10-19",
  weekGuessed: false,
  rows: [],
  explanation: "",
  ...over,
});
const entry = (over: Partial<HomeworkEntry>): HomeworkEntry => ({
  id: "i",
  person_id: "ada",
  kind: "lekse",
  due_date: null,
  text: "Les",
  done: false,
  done_at: null,
  source: "manuell",
  position: 0,
  ...over,
});

describe("uke", () => {
  test("weekLabel", () => {
    assert.equal(weekLabel("2026-10-19"), "Uke 43 · 19.–23. okt.");
    assert.equal(weekLabel("2026-10-26"), "Uke 44 · 26.–30. okt.");
    assert.equal(weekLabel("2026-11-30"), "Uke 49 · 30. nov.–4. des.");
  });

  test("defaultWeekStart: neste uke fra fredag kl. 14 hvis den finnes", () => {
    assert.equal(defaultWeekStart("2026-10-21", "09:00", true), "2026-10-19");
    assert.equal(defaultWeekStart("2026-10-23", "13:59", true), "2026-10-19");
    assert.equal(defaultWeekStart("2026-10-23", "14:00", true), "2026-10-26");
    assert.equal(defaultWeekStart("2026-10-23", "15:00", false), "2026-10-19");
    assert.equal(defaultWeekStart("2026-10-25", "10:00", true), "2026-10-26"); // søndag
    assert.equal(defaultWeekStart("2026-10-24", "10:00", false), "2026-10-19"); // lørdag
  });
});

describe("homeworkDayFor", () => {
  test("hverdag før/etter 14", () => {
    assert.deepEqual(homeworkDayFor("2026-10-20", "08:00"), { dateKey: "2026-10-20", title: "Lekser i dag" });
    assert.deepEqual(homeworkDayFor("2026-10-20", "14:00"), { dateKey: "2026-10-21", title: "Lekser til i morgen" });
  });
  test("fredag etter 14 og helg → mandag", () => {
    const monday = { dateKey: "2026-10-26", title: "Lekser til mandag" };
    assert.deepEqual(homeworkDayFor("2026-10-23", "15:00"), monday);
    assert.deepEqual(homeworkDayFor("2026-10-23", "13:00"), { dateKey: "2026-10-23", title: "Lekser i dag" });
    assert.deepEqual(homeworkDayFor("2026-10-24", "09:00"), monday);
    assert.deepEqual(homeworkDayFor("2026-10-25", "20:00"), monday);
  });
});

describe("groupWeek", () => {
  test("mål, hele uka og dager i rekkefølge", () => {
    const g = groupWeek([
      entry({ id: "1", due_date: "2026-10-21", text: "B" }),
      entry({ id: "2", due_date: "2026-10-20", text: "A" }),
      entry({ id: "3", text: "Ukelekse" }),
      entry({ id: "4", kind: "mal", text: "Mål" }),
    ]);
    assert.deepEqual(g.goals.map((e) => e.id), ["4"]);
    assert.deepEqual(g.wholeWeek.map((e) => e.id), ["3"]);
    assert.deepEqual(g.days.map((d) => d.dateKey), ["2026-10-20", "2026-10-21"]);
  });
});

describe("sammenslåing", () => {
  test("samme barn slås sammen, dubletter fjernes, uka fra den som fant den", () => {
    const a = draft({ weekGuessed: true, weekStart: "2026-10-12", rows: [row({ key: "a", text: "Les s. 12" }), row({ key: "b", group: "mal", text: "Mål" })] });
    const b = draft({ rows: [row({ key: "c", text: "les s. 12!" }), row({ key: "d", text: "Skriv" })] });
    const m = mergeDrafts([a, b]);
    assert.equal(m.weekStart, "2026-10-19");
    assert.equal(m.weekGuessed, false);
    assert.deepEqual(m.rows.map((r) => r.text), ["Les s. 12", "Mål", "Skriv"]);
    assert.equal(new Set(m.rows.map((r) => r.key)).size, 3);
  });

  test("bare uker som er gjettet → fortsatt gjettet", () => {
    const m = mergeDrafts([draft({ weekGuessed: true }), draft({ weekGuessed: true })]);
    assert.equal(m.weekGuessed, true);
  });
});

describe("redigering i arket", () => {
  test("shiftHomeworkDates flytter bare lekser med dag", () => {
    const rows = shiftHomeworkDates(
      [row({ date: "2026-10-20" }), row({ date: "" }), row({ group: "kalender", date: "2026-10-21" })],
      7
    );
    assert.deepEqual(rows.map((r) => r.date), ["2026-10-27", "", "2026-10-21"]);
  });

  test("recheckRow: dublett oppdages når barnet velges", () => {
    const existing = [event("Gymtøy", "2026-10-22", null, { allDay: true, people: ["ada"] })];
    const r = row({ group: "kalender", text: "🩳 Gymtøy", date: "2026-10-22" });
    assert.equal(recheckRow(r, existing, "ada", "2026-10-19").duplicate, true);
    assert.equal(recheckRow(r, existing, "ada", "2026-10-19").selected, false);
    assert.equal(recheckRow(r, existing, "lea", "2026-10-19"), r);
    assert.equal(recheckRow(r, [], "ada", "2026-10-23").past, true);
  });
});

describe("carryOverDone", () => {
  test("beholder avkrysning for identisk tekst, ikke for endret", () => {
    const at = new Date("2026-10-20T10:00:00Z");
    const out = carryOverDone(
      [
        { kind: "lekse", text: "Les s. 12", done: true, done_at: at },
        { kind: "lekse", text: "Skriv", done: false, done_at: null },
      ],
      [
        { kind: "lekse", text: " les s. 12 " },
        { kind: "lekse", text: "Skriv" },
        { kind: "lekse", text: "Ny" },
        { kind: "mal", text: "Les s. 12" },
      ]
    );
    assert.deepEqual(out, [
      { done: true, done_at: at },
      { done: false, done_at: null },
      { done: false, done_at: null },
      { done: false, done_at: null },
    ]);
  });
});

describe("hjem", () => {
  test("homeworkForDay: åpne lekser på dagen, per barn", () => {
    const out = homeworkForDay(
      [
        entry({ id: "1", due_date: "2026-10-21" }),
        entry({ id: "2", due_date: "2026-10-21", done: true }),
        entry({ id: "3", due_date: "2026-10-22" }),
        entry({ id: "4", person_id: "lea", due_date: "2026-10-21" }),
        entry({ id: "5", person_id: "lea", kind: "mal", due_date: "2026-10-21" }),
      ],
      "2026-10-21",
      ["lea", "ada"]
    );
    assert.deepEqual(out.map((c) => [c.personId, c.entries.map((e) => e.id)]), [["lea", ["4"]], ["ada", ["1"]]]);
  });
});

test("planDocumentName", () => {
  assert.equal(planDocumentName("Ada", "2026-10-19"), "Ukeplan Ada uke 43");
  assert.equal(planDocumentName("Ada", "2026-10-19", 1), "Ukeplan Ada uke 43 (2)");
});

describe("opplasting", () => {
  const img = (size: number) => ({ prepared: { type: "image/png", size } });
  const pdf = { prepared: { type: "application/pdf", size: 10 } };
  const MB = 1024 * 1024;

  test("bilder i ett kall under grensen, ellers delt; PDF alene", () => {
    assert.deepEqual(batchUploads([img(MB), img(MB), img(MB)]).map((b) => b.length), [3]);
    assert.deepEqual(batchUploads([img(2 * MB), img(2 * MB), img(MB)]).map((b) => b.length), [2, 1]);
    assert.deepEqual(batchUploads([img(MB), pdf, img(MB)]).map((b) => b.length), [1, 2]);
  });

  test("inferWeekStart: mest brukte mandag når uka mangler", () => {
    const ai = {
      week_start: "",
      homework: [{ text: "a", due: "2026-10-21" }, { text: "b", due: "" }],
      calendar: [{ title: "t", date: "2026-10-22", start_time: "", end_time: "", all_day: true, kind: "hendelse", notes: "" }, { title: "u", date: "2026-10-28", start_time: "", end_time: "", all_day: true, kind: "hendelse", notes: "" }],
    };
    assert.equal(inferWeekStart(ai), "2026-10-19");
    assert.equal(inferWeekStart({ ...ai, week_start: "2026-11-04" }), "2026-11-02");
    assert.equal(inferWeekStart({ week_start: "", homework: [], calendar: [] }), "");
  });

  test("assignUnknownToSoleChild: ukjent slås inn bare når det finnes ett kjent barn", () => {
    const a = draft({ personId: "ada" });
    const u = draft({ personId: "" });
    assert.equal(assignUnknownToSoleChild([a, u], [], "2026-10-19")[1].personId, "ada");
    const both = [a, draft({ personId: "lea" }), u];
    assert.equal(assignUnknownToSoleChild(both, [], "2026-10-19")[2].personId, "");
    // En hel PDF-plan uten gjenkjent barn tildeles ikke (kan være det andre barnets).
    assert.equal(assignUnknownToSoleChild([a, u], [], "2026-10-19", [true, false])[1].personId, "");
  });

  test("recheckRow beholder valget brukeren selv har gjort", () => {
    const existing = [event("Gymtøy", "2026-10-22", null, { allDay: true, people: ["ada"] })];
    const r = row({ group: "kalender", text: "Gymtøy", date: "2026-10-22", selected: true, userSelected: true });
    assert.equal(recheckRow(r, existing, "ada", "2026-10-19").selected, true);
  });
});
