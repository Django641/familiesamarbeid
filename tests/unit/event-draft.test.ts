import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  defaultRepeatUntil,
  draftFromEvent,
  draftToRow,
  expandRepeat,
  MAX_REPEATS,
  repeatDates,
  repeatSummary,
  type EventDraft,
} from "@/lib/event-draft";

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

describe("repeatDates", () => {
  test("uten gjentakelse, med until <= startdato eller uten until: bare startdatoen", () => {
    assert.deepEqual(repeatDates("2026-10-20", "none", "2026-12-15"), ["2026-10-20"]);
    assert.deepEqual(repeatDates("2026-10-20", "weekly", "2026-10-20"), ["2026-10-20"]);
    assert.deepEqual(repeatDates("2026-10-20", "weekly", "2026-10-01"), ["2026-10-20"]);
    assert.deepEqual(repeatDates("2026-10-20", "weekly", ""), ["2026-10-20"]);
  });

  test("hver uke: «til og med» er inklusiv", () => {
    const d = repeatDates("2026-10-20", "weekly", "2026-12-15");
    assert.equal(d.length, 9);
    assert.equal(d[0], "2026-10-20");
    assert.equal(d.at(-1), "2026-12-15");
    assert.equal(repeatDates("2026-10-20", "weekly", "2026-12-14").length, 8);
  });

  test("annenhver uke", () => {
    assert.deepEqual(repeatDates("2026-10-20", "biweekly", "2026-12-15"), [
      "2026-10-20",
      "2026-11-03",
      "2026-11-17",
      "2026-12-01",
      "2026-12-15",
    ]);
  });

  test("aldri flere enn MAX_REPEATS", () => {
    assert.equal(MAX_REPEATS, 60);
    assert.equal(repeatDates("2026-10-20", "weekly", "2035-01-01").length, 60);
    assert.equal(repeatDates("2026-10-20", "biweekly", "2040-01-01").length, 60);
  });
});

describe("expandRepeat", () => {
  function rows(d: Partial<EventDraft>, repeat: "none" | "weekly" | "biweekly", until: string) {
    const result = expandRepeat({ ...base, ...d }, repeat, until, "serie-1");
    if ("error" in result) assert.fail(`ventet rader, fikk feil: ${result.error}`);
    return result.rows;
  }

  test("uten gjentakelse: én rad uten series_id", () => {
    const r = rows({}, "none", "2026-12-15");
    assert.equal(r.length, 1);
    assert.equal(r[0].series_id, undefined);
  });

  test("until <= startdato: én rad uten series_id (ingen serie på én hendelse)", () => {
    const r = rows({}, "weekly", "2026-10-20");
    assert.equal(r.length, 1);
    assert.equal("series_id" in r[0], false);
  });

  test("flere ganger: alle får samme series_id", () => {
    const r = rows({}, "weekly", "2026-12-15");
    assert.equal(r.length, 9);
    assert.ok(r.every((x) => x.series_id === "serie-1"));
  });

  test("maks 60 rader", () => {
    assert.equal(rows({}, "weekly", "2035-01-01").length, 60);
  });

  test("tittel, sted og personer følger med i alle rader", () => {
    for (const r of rows({}, "weekly", "2026-11-10")) {
      assert.equal(r.title, "Foreldremøte");
      assert.equal(r.location, "Aulaen");
      assert.deepEqual(r.person_ids, ["a"]);
    }
  });

  test("flerdagshendelse: både start og slutt flyttes ett steg per gang", () => {
    const r = rows({ date: "2026-10-20", startTime: "18:00", endDate: "2026-10-22", endTime: "10:00" }, "weekly", "2026-11-03");
    assert.deepEqual(
      r.map((x) => [x.starts_at, x.ends_at]),
      [
        ["2026-10-20T16:00:00.000Z", "2026-10-22T08:00:00.000Z"],
        ["2026-10-27T17:00:00.000Z", "2026-10-29T09:00:00.000Z"],
        ["2026-11-03T17:00:00.000Z", "2026-11-05T09:00:00.000Z"],
      ]
    );
  });

  test("annenhver uke flytter slutten to uker om gangen", () => {
    const r = rows({ allDay: true, startTime: "", endTime: "", date: "2026-10-20", endDate: "2026-10-21" }, "biweekly", "2026-11-03");
    assert.equal(r.length, 2);
    assert.equal(r[1].starts_at, "2026-11-02T23:00:00.000Z"); // 3. nov. 00:00 Oslo (vintertid)
    assert.equal(r[1].ends_at, "2026-11-03T23:00:00.000Z"); // 4. nov. 00:00 Oslo (21. okt. + 14 dager)
  });

  test("sommertid: 17:30 Oslo-tid beholdes over siste søndag i oktober (UTC-tiden endres)", () => {
    const r = rows({ date: "2026-10-20", startTime: "17:30", endDate: "2026-10-20", endTime: "18:30" }, "weekly", "2026-11-03");
    assert.deepEqual(
      r.map((x) => x.starts_at),
      ["2026-10-20T15:30:00.000Z", "2026-10-27T16:30:00.000Z", "2026-11-03T16:30:00.000Z"]
    );
    assert.equal(r[1].ends_at, "2026-10-27T17:30:00.000Z");
  });

  test("sommertid om våren: 17:30 går fra 16:30Z til 15:30Z", () => {
    const r = rows({ date: "2027-03-23", startTime: "17:30", endDate: "2027-03-23", endTime: "" }, "weekly", "2027-03-30");
    assert.deepEqual(
      r.map((x) => x.starts_at),
      ["2027-03-23T16:30:00.000Z", "2027-03-30T15:30:00.000Z"]
    );
  });

  test("ugyldig utkast gir feilmelding, ikke halve serier", () => {
    const result = expandRepeat({ ...base, title: " " }, "weekly", "2026-12-15", "x");
    assert.ok("error" in result);
  });
});

describe("defaultRepeatUntil", () => {
  test("høst → jul (19. des.)", () => {
    assert.equal(defaultRepeatUntil("2026-10-20"), "2026-12-19");
    assert.equal(defaultRepeatUntil("2026-11-20"), "2026-12-19");
  });

  test("vår → sommerferie (19. juni)", () => {
    assert.equal(defaultRepeatUntil("2026-01-13"), "2026-06-19");
    assert.equal(defaultRepeatUntil("2026-05-10"), "2026-06-19");
  });

  test("for nær skoleslutt (under fire uker) hopper til neste", () => {
    assert.equal(defaultRepeatUntil("2026-05-25"), "2026-12-19");
    assert.equal(defaultRepeatUntil("2026-11-25"), "2027-06-19");
  });

  test("sent på året → neste sommer", () => {
    assert.equal(defaultRepeatUntil("2026-12-01"), "2027-06-19");
    assert.equal(defaultRepeatUntil("2026-12-30"), "2027-06-19");
  });

  test("alltid minst fire uker etter startdatoen", () => {
    for (const date of ["2026-01-01", "2026-06-18", "2026-06-20", "2026-12-18", "2026-12-31", "2027-02-28"]) {
      assert.ok(defaultRepeatUntil(date) >= repeatDates(date, "weekly", "2099-01-01")[4], date);
    }
  });
});

describe("repeatSummary", () => {
  test("ukedag, klokkeslett og antall", () => {
    const s = repeatSummary({ date: "2026-10-20", allDay: false, startTime: "17:30" }, "weekly", "2026-12-15");
    assert.match(s, /^Hver tirsdag kl\. 17:30 · 9 ganger, siste /);
  });

  test("annenhver uke og heldag uten klokkeslett", () => {
    const s = repeatSummary({ date: "2026-10-20", allDay: true, startTime: "" }, "biweekly", "2026-12-15");
    assert.match(s, /^Annenhver tirsdag · 5 ganger/);
  });

  test("én gang eller ingen gjentakelse", () => {
    assert.match(repeatSummary({ date: "2026-10-20", allDay: false, startTime: "17:30" }, "weekly", "2026-10-20"), /Bare én gang/);
    assert.equal(repeatSummary({ date: "2026-10-20", allDay: false, startTime: "17:30" }, "none", "2026-12-15"), "");
  });
});
