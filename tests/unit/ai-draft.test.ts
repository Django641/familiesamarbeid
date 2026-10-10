import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { isReadableFile, toRow, type AiEvent } from "@/app/(app)/kalender/fra-tekst/ai-draft";

import { person } from "./helpers";

const base: AiEvent = {
  title: "Trening",
  date: "2026-11-03",
  start_time: "17:30",
  end_date: "2026-11-03",
  end_time: "18:30",
  all_day: false,
  location: "",
  category: "aktivitet",
  people: [],
  notes: "",
};

describe("toRow", () => {
  test("gyldig hendelse med klokkeslett beholdes", () => {
    const r = toRow(base, [], 0);
    assert.equal(r.allDay, false);
    assert.equal(r.startTime, "17:30");
    assert.equal(r.endTime, "18:30");
    assert.equal(r.selected, true);
  });

  test("ugyldig eller manglende klokkeslett gir heldag", () => {
    for (const start_time of ["", "5pm", "17:3"]) {
      const r = toRow({ ...base, start_time }, [], 0);
      assert.equal(r.allDay, true, start_time);
      assert.equal(r.startTime, "");
      assert.equal(r.endTime, "");
    }
  });

  test("ukjent kategori blir «annet»", () => {
    assert.equal(toRow({ ...base, category: "finnes-ikke" }, [], 0).category, "annet");
  });

  test("personnavn kobles uavhengig av store/små bokstaver", () => {
    const ada = { ...person("p1"), name: "Mia" };
    const lea = { ...person("p2"), name: "Noa" };
    const r = toRow({ ...base, people: ["MIA", "ukjent"] }, [ada, lea], 0);
    assert.deepEqual(r.personIds, ["p1"]);
  });

  test("end_date faller tilbake til date når den er ugyldig", () => {
    assert.equal(toRow({ ...base, end_date: "" }, [], 0).endDate, base.date);
    assert.equal(toRow({ ...base, end_date: "i morgen" }, [], 0).endDate, base.date);
  });
});

describe("toRow: repeat", () => {
  test("weekly og biweekly fra AI-en plukkes opp", () => {
    assert.equal(toRow({ ...base, repeat: "weekly" }, [], 0).repeat, "weekly");
    assert.equal(toRow({ ...base, repeat: "biweekly" }, [], 0).repeat, "biweekly");
  });

  test("manglende eller ukjent verdi gir none", () => {
    assert.equal(toRow(base, [], 0).repeat, "none");
    for (const repeat of ["", "daily", "WEEKLY", "monthly"]) {
      assert.equal(toRow({ ...base, repeat }, [], 0).repeat, "none", repeat);
    }
  });

  test("«til og med» foreslås ut fra datoen", () => {
    assert.equal(toRow({ ...base, date: "2026-10-20" }, [], 0).repeatUntil, "2026-12-19");
    assert.equal(toRow({ ...base, date: "2026-01-13" }, [], 0).repeatUntil, "2026-06-19");
  });
});

describe("isReadableFile", () => {
  const file = (name: string, type: string) => new File([""], name, { type });

  test("tom MIME-type godtas på filendelse", () => {
    assert.equal(isReadableFile(file("brev.pdf", "")), true);
    assert.equal(isReadableFile(file("IMG_1.HEIC", "")), true);
  });

  test("bilder og PDF godtas på MIME-type", () => {
    assert.equal(isReadableFile(file("x", "image/png")), true);
    assert.equal(isReadableFile(file("x", "application/pdf")), true);
  });

  test("video og tekst avvises", () => {
    assert.equal(isReadableFile(file("film.mov", "video/quicktime")), false);
    assert.equal(isReadableFile(file("notat.txt", "text/plain")), false);
  });
});
