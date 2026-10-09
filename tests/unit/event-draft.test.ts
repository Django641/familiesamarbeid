import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { draftFromEvent, draftToRow, type EventDraft } from "@/lib/event-draft";

import { event } from "./helpers";

const base: EventDraft = {
  title: "Foreldremøte",
  category: "skole",
  allDay: false,
  date: "2026-10-20",
  startTime: "18:00",
  endDate: "2026-10-20",
  endTime: "19:30",
  location: "  Aulaen ",
  description: "",
  personIds: ["a"],
};

function row(d: Partial<EventDraft>) {
  const result = draftToRow({ ...base, ...d });
  if ("error" in result) assert.fail(`ventet rad, fikk feil: ${result.error}`);
  return result.row;
}

function error(d: Partial<EventDraft>) {
  const result = draftToRow({ ...base, ...d });
  assert.ok("error" in result, "ventet feilmelding");
  return result.error;
}

describe("draftToRow", () => {
  test("tidsbestemt hendelse lagres i UTC, sted trimmes, tom beskrivelse blir null", () => {
    const r = row({});
    assert.equal(r.starts_at, "2026-10-20T16:00:00.000Z");
    assert.equal(r.ends_at, "2026-10-20T17:30:00.000Z");
    assert.equal(r.location, "Aulaen");
    assert.equal(r.description, null);
    assert.equal(r.all_day, false);
  });

  test("uten sluttid samme dag: ends_at er null", () => {
    assert.equal(row({ endTime: "" }).ends_at, null);
  });

  test("over flere dager uten sluttid: slutter 23:59 siste dag", () => {
    assert.equal(row({ endDate: "2026-10-22", endTime: "" }).ends_at, "2026-10-22T21:59:00.000Z");
  });

  test("heldag: midnatt Oslo, siste dag inklusiv, null for én dag", () => {
    const one = row({ allDay: true, startTime: "", endTime: "" });
    assert.equal(one.starts_at, "2026-10-19T22:00:00.000Z");
    assert.equal(one.ends_at, null);
    const multi = row({ allDay: true, date: "2026-10-24", endDate: "2026-10-26" });
    assert.equal(multi.starts_at, "2026-10-23T22:00:00.000Z"); // sommertid
    assert.equal(multi.ends_at, "2026-10-25T23:00:00.000Z"); // vintertid
  });

  test("sluttdato før startdato rettes til startdato", () => {
    assert.equal(row({ endDate: "2026-10-01" }).ends_at, "2026-10-20T17:30:00.000Z");
  });

  test("feilmeldinger på norsk", () => {
    assert.equal(error({ title: "   " }), "Skriv en tittel.");
    assert.equal(error({ date: "" }), "Velg en dato.");
    assert.match(error({ startTime: "" }), /klokkeslett/);
    assert.equal(error({ endTime: "17:00" }), "Slutt må være etter start.");
  });
});

describe("draftFromEvent", () => {
  test("tur-retur via utkast gir samme tidspunkter", () => {
    const e = event("Konsert", "2026-10-25T20:00", "2026-10-25T23:00");
    const d = draftFromEvent(e);
    assert.equal(d.date, "2026-10-25");
    assert.equal(d.startTime, "20:00");
    assert.equal(d.endTime, "23:00");
    const r = row(d);
    assert.equal(r.starts_at, e.starts_at.toISOString());
    assert.equal(r.ends_at, e.ends_at?.toISOString());
  });

  test("heldag over flere dager beholder siste dag", () => {
    const e = event("Høstferie", "2026-10-05", "2026-10-09");
    const d = draftFromEvent(e);
    assert.equal(d.allDay, true);
    assert.equal(d.startTime, "");
    assert.equal(d.endDate, "2026-10-09");
  });
});
