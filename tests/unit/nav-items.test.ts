import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { DEFAULT_NAV, isMoreActive, parseNavCookie, serializeNav, toggleNav } from "@/lib/nav-items";

describe("parseNavCookie", () => {
  test("mangler eller tom → standard", () => {
    assert.deepEqual(parseNavCookie(undefined), [...DEFAULT_NAV]);
    assert.deepEqual(parseNavCookie(""), [...DEFAULT_NAV]);
  });

  test("gyldig valg beholdes, i fast rekkefølge", () => {
    assert.deepEqual(parseNavCookie("beskjeder,gjoremal,hjem"), ["hjem", "gjoremal", "beskjeder"]);
  });

  test("ukjent punkt, for mange eller dubletter → standard / dedupet", () => {
    assert.deepEqual(parseNavCookie("hjem,ukjent"), [...DEFAULT_NAV]);
    assert.deepEqual(parseNavCookie("hjem,kalender,handle,lekser,gjoremal,beskjeder"), [...DEFAULT_NAV]);
    assert.deepEqual(parseNavCookie("hjem,hjem"), ["hjem"]);
  });
});

describe("toggleNav", () => {
  test("legger til og fjerner", () => {
    assert.deepEqual(toggleNav(["hjem", "kalender"], "gjoremal"), ["hjem", "kalender", "gjoremal"]);
    assert.deepEqual(toggleNav(["hjem", "kalender"], "kalender"), ["hjem"]);
  });

  test("maks 5 og min 1", () => {
    assert.deepEqual(toggleNav([...DEFAULT_NAV], "filer"), [...DEFAULT_NAV]);
    assert.deepEqual(toggleNav(["hjem"], "hjem"), ["hjem"]);
  });

  test("serializeNav kan leses av parseNavCookie", () => {
    const ids = toggleNav(["hjem", "kalender"], "filer");
    assert.deepEqual(parseNavCookie(serializeNav(ids)), ids);
  });
});

describe("isMoreActive", () => {
  test("aktiv for sider som ikke står i menyen, ikke for Innstillinger", () => {
    assert.equal(isMoreActive("/gjoremal", [...DEFAULT_NAV]), true);
    assert.equal(isMoreActive("/dokumenter/abc", [...DEFAULT_NAV]), true);
    assert.equal(isMoreActive("/innstillinger", [...DEFAULT_NAV]), false);
    assert.equal(isMoreActive("/kalender", [...DEFAULT_NAV]), false);
    assert.equal(isMoreActive("/gjoremal", ["hjem", "gjoremal"]), false);
  });
});
