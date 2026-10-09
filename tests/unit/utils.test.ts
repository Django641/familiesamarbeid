import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { addDays, dayLabel, osloDateKey, osloTime, osloToIso } from "@/lib/utils";

describe("osloToIso", () => {
  test("sommertid (UTC+2) og vintertid (UTC+1)", () => {
    assert.equal(osloToIso("2026-07-01", "12:00"), "2026-07-01T10:00:00.000Z");
    assert.equal(osloToIso("2026-01-15", "12:00"), "2026-01-15T11:00:00.000Z");
  });

  test("over skiftet til vintertid søndag 25.10.2026", () => {
    assert.equal(osloToIso("2026-10-24", "12:00"), "2026-10-24T10:00:00.000Z");
    assert.equal(osloToIso("2026-10-25"), "2026-10-24T22:00:00.000Z"); // midnatt, fortsatt sommertid
    assert.equal(osloToIso("2026-10-25", "12:00"), "2026-10-25T11:00:00.000Z");
    assert.equal(osloToIso("2026-10-26"), "2026-10-25T23:00:00.000Z");
  });

  test("over skiftet til sommertid søndag 29.3.2026", () => {
    assert.equal(osloToIso("2026-03-29"), "2026-03-28T23:00:00.000Z");
    assert.equal(osloToIso("2026-03-29", "12:00"), "2026-03-29T10:00:00.000Z");
  });

  test("tur-retur med osloDateKey/osloTime gir samme dato og klokkeslett", () => {
    for (const [date, time] of [
      ["2026-10-25", "00:00"],
      ["2026-10-25", "23:30"],
      ["2026-03-29", "04:00"],
      ["2026-12-31", "23:59"],
    ]) {
      const iso = osloToIso(date, time);
      assert.equal(osloDateKey(iso), date, `${date} ${time}`);
      assert.equal(osloTime(iso), time, `${date} ${time}`);
    }
  });
});

describe("osloDateKey", () => {
  test("bruker Oslo-dato, ikke UTC-dato", () => {
    assert.equal(osloDateKey(new Date("2026-10-24T22:30:00Z")), "2026-10-25");
    assert.equal(osloDateKey("2026-12-31T23:30:00Z"), "2027-01-01");
    assert.equal(osloDateKey("2026-06-30T21:59:00Z"), "2026-06-30");
  });
});

describe("addDays", () => {
  test("over måned, år og skuddår", () => {
    assert.equal(addDays("2026-10-31", 1), "2026-11-01");
    assert.equal(addDays("2026-12-31", 1), "2027-01-01");
    assert.equal(addDays("2028-02-28", 1), "2028-02-29");
    assert.equal(addDays("2026-03-01", -1), "2026-02-28");
    assert.equal(addDays("2026-10-25", 0), "2026-10-25");
  });

  test("påvirkes ikke av sommertid", () => {
    assert.equal(addDays("2026-10-24", 2), "2026-10-26");
    assert.equal(addDays("2026-03-28", 2), "2026-03-30");
  });

  test("ugyldig dato normaliseres (brukes til å avvise ?fra=2026-13-45)", () => {
    assert.notEqual(addDays("2026-13-45", 0), "2026-13-45");
  });
});

describe("dayLabel", () => {
  test("i dag, i morgen, i går og ukedag", () => {
    assert.equal(dayLabel("2026-10-09", "2026-10-09"), "I dag");
    assert.equal(dayLabel("2026-10-10", "2026-10-09"), "I morgen");
    assert.equal(dayLabel("2026-10-08", "2026-10-09"), "I går");
    assert.match(dayLabel("2026-10-13", "2026-10-09"), /^Tirsdag 13\. okt/);
  });
});
