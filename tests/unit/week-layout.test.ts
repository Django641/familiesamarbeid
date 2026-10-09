import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { isoWeek, layoutWeek, MAX_BAR_LANES, mondayOf, prepareEvents } from "@/lib/week-layout";

import { event, person } from "./helpers";

describe("mondayOf", () => {
  test("midt i uka og søndag gir samme mandag", () => {
    assert.equal(mondayOf("2026-10-15"), "2026-10-12"); // torsdag
    assert.equal(mondayOf("2026-10-18"), "2026-10-12"); // søndag
    assert.equal(mondayOf("2026-10-12"), "2026-10-12"); // mandag
  });

  test("over årsskiftet", () => {
    assert.equal(mondayOf("2027-01-01"), "2026-12-28");
    assert.equal(mondayOf("2027-01-03"), "2026-12-28");
  });
});

describe("isoWeek (norske ukenummer)", () => {
  test("vanlige uker", () => {
    assert.equal(isoWeek("2026-10-15"), 42);
    assert.equal(isoWeek("2026-01-01"), 1); // torsdag → uke 1
  });

  test("2026 har uke 53, som fortsetter inn i 2027", () => {
    assert.equal(isoWeek("2026-12-28"), 53);
    assert.equal(isoWeek("2026-12-31"), 53);
    assert.equal(isoWeek("2027-01-01"), 53);
    assert.equal(isoWeek("2027-01-03"), 53);
    assert.equal(isoWeek("2027-01-04"), 1);
  });

  test("29.–31. desember kan være uke 1 i neste år", () => {
    assert.equal(isoWeek("2025-12-29"), 1);
  });
});

describe("layoutWeek", () => {
  const people = [person("K", 0), person("S", 1), person("A", 2), person("L", 3)];
  const events = [
    event("Høstferie", "2026-10-05", "2026-10-13"), // fra uka før, slutter tirsdag
    event("Bergen", "2026-10-14T07:10", "2026-10-16T18:00", { people: ["K"] }), // tidsbestemt over flere dager → stolpe
    event("Kurs", "2026-10-17", "2026-10-20", { people: ["S"] }), // inn i neste uke
    event("Fotball", "2026-10-15T17:15", "2026-10-15T18:30", { people: ["L"] }),
    event("Bursdag", "2026-10-15", null, { people: ["A"] }), // heldag én dag → stolpe
    event("Ekstra", "2026-10-15", null, { people: ["L"] }), // tredje stolpe torsdag → skjult
    event("Midnatt", "2026-10-16T22:00", "2026-10-17T00:00", { people: ["K"] }), // slutter ved midnatt → én dag
    event("Neste uke", "2026-10-21T10:00", null),
  ];
  const week = layoutWeek(prepareEvents(events), "2026-10-12", people);
  const bar = (title: string) => week.bars.find((b) => b.event.title === title);

  test("ukenummer og sju dager", () => {
    assert.equal(week.weekNumber, 42);
    assert.deepEqual(
      week.days.map((d) => d.dateKey),
      ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18"]
    );
  });

  test("stolpe fra uka før klippes og fortsetter fra venstre", () => {
    const b = bar("Høstferie");
    assert.ok(b);
    assert.equal(b.startCol, 0);
    assert.equal(b.endCol, 1);
    assert.equal(b.continuesLeft, true);
    assert.equal(b.continuesRight, false);
  });

  test("tidsbestemt flerdagshendelse blir stolpe, voksne øverst", () => {
    const b = bar("Bergen");
    assert.ok(b);
    assert.deepEqual([b.startCol, b.endCol, b.lane], [2, 4, 0]);
  });

  test("ledig luke i bane 0 gjenbrukes", () => {
    assert.equal(bar("Høstferie")?.lane, 0);
  });

  test("stolpe inn i neste uke fortsetter til høyre", () => {
    const b = bar("Kurs");
    assert.ok(b);
    assert.equal(b.startCol, 5);
    assert.equal(b.endCol, 6);
    assert.equal(b.continuesRight, true);
  });

  test("maks to baner; stolpe uten plass telles som skjult", () => {
    assert.ok(week.bars.every((b) => b.lane < MAX_BAR_LANES));
    assert.equal(bar("Ekstra"), undefined);
    assert.equal(week.days[3].hiddenBars, 1);
  });

  test("tidsbestemt enkeltdagshendelse er merke med klokkeslett", () => {
    assert.deepEqual(
      week.days[3].marks.map((m) => [m.event.title, m.time]),
      [["Fotball", "17:15"]]
    );
  });

  test("hendelse som slutter ved midnatt hører bare til dagen den starter", () => {
    assert.ok(week.days[4].marks.some((m) => m.event.title === "Midnatt"));
    assert.ok(!week.days[5].marks.some((m) => m.event.title === "Midnatt"));
    assert.equal(bar("Midnatt"), undefined);
  });

  test("total per dag teller både stolper og merker", () => {
    assert.equal(week.days[3].total, 4); // Bergen, Fotball, Bursdag, Ekstra
  });

  test("hendelser utenfor uka tas ikke med", () => {
    const all = [...week.bars.map((b) => b.event.title), ...week.days.flatMap((d) => d.marks.map((m) => m.event.title))];
    assert.ok(!all.includes("Neste uke"));
  });
});
