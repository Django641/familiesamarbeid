#!/usr/bin/env node
// Kjører nettlesertestene (tests/e2e) mot en lokal produksjonsbygg av appen:
//   PGlite (tom database i en temp-mappe) → migrasjoner → falsk Claude + falsk Blob →
//   `next build` → `next start` → `node --test tests/e2e/*.test.mjs` → rydd opp.
//
//   npm run e2e                      alt
//   npm run e2e -- --no-build        gjenbruk forrige e2e-build (raskere)
//   npm run e2e -- kalender          bare testfiler med «kalender» i navnet
//   npm run e2e -- --keep            behold temp-mappa (database + logger)
//
// Alle prosesser startes i egne prosessgrupper og drepes ved slutt, feil og Ctrl-C.

import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { OWNER, PARTNER, TEST_AUTH_SECRET } from "../tests/e2e/fixtures.mjs";
import { startAnthropicMock } from "../tests/mocks/anthropic.mjs";
import { startBlobMock } from "../tests/mocks/blob.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const noBuild = args.includes("--no-build");
const keep = args.includes("--keep");
const filters = args.filter((a) => !a.startsWith("--"));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "familiesamarbeid-e2e-"));
const logDir = path.join(tmp, "logs");
fs.mkdirSync(logDir);
const children = new Set();
const closers = [];
const started = Date.now();
const seconds = () => `${((Date.now() - started) / 1000).toFixed(1)} s`;
const log = (msg) => console.log(`[e2e ${seconds()}] ${msg}`);

// ---------------------------------------------------------------------------
// Prosesser
// ---------------------------------------------------------------------------

function run(name, command, argv, { env, inherit = false } = {}) {
  const logFile = path.join(logDir, `${name}.log`);
  const out = inherit ? "inherit" : fs.openSync(logFile, "a");
  const child = spawn(command, argv, { cwd: root, env, detached: true, stdio: ["ignore", out, out] });
  child.logFile = logFile;
  child.exited = new Promise((resolve) => child.on("exit", (code, signal) => resolve(code ?? (signal ? 1 : 0))));
  children.add(child);
  child.exited.then(() => children.delete(child));
  return child;
}

function killGroup(child, signal) {
  try {
    process.kill(-child.pid, signal); // hele gruppa vi selv startet (next start kan ha barn)
  } catch {
    // allerede borte
  }
}

let cleaning = null;
function cleanup() {
  cleaning ??= (async () => {
    for (const child of children) killGroup(child, "SIGTERM");
    const deadline = Date.now() + 5000;
    while (children.size > 0 && Date.now() < deadline) await new Promise((r) => setTimeout(r, 100));
    for (const child of children) killGroup(child, "SIGKILL");
    await Promise.allSettled(closers.map((close) => close()));
  })();
  return cleaning;
}

process.on("exit", () => {
  for (const child of children) killGroup(child, "SIGKILL");
});
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, async () => {
    console.log(`\n[e2e] ${signal} — rydder opp …`);
    await cleanup();
    if (!keep) fs.rmSync(tmp, { recursive: true, force: true });
    process.exit(130);
  });
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function portIsFree(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once("error", () => resolve(false));
    srv.listen(port, "127.0.0.1", () => srv.close(() => resolve(true)));
  });
}

async function waitFor(what, check, child, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let exited = false;
  child?.exited.then(() => (exited = true));
  while (Date.now() < deadline) {
    if (exited) throw new Error(`${what} stoppet under oppstart. Se ${child.logFile}`);
    if (await check().catch(() => false)) return;
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`${what} ble ikke klar innen ${timeoutMs / 1000} s${child ? `. Se ${child.logFile}` : ""}`);
}

const canConnect = (port) =>
  new Promise((resolve) => {
    const socket = net.connect(port, "127.0.0.1");
    socket.once("connect", () => (socket.end(), resolve(true)));
    socket.once("error", () => resolve(false));
  });

function tail(file, lines = 40) {
  try {
    return fs.readFileSync(file, "utf8").split("\n").slice(-lines).join("\n");
  } catch {
    return "(ingen logg)";
  }
}

// ---------------------------------------------------------------------------
// Hovedløp
// ---------------------------------------------------------------------------

async function main() {
  const node = process.execPath;
  const nextBin = path.join(root, "node_modules/next/dist/bin/next");

  // 1) Database
  const pgPort = await freePort();
  const pg = run("pglite", node, [
    path.join(root, "node_modules/@electric-sql/pglite-socket/dist/scripts/server.js"),
    `--db=${path.join(tmp, "db")}`,
    `--port=${pgPort}`,
    "--max-connections=10", // uten denne kræsjer appens pg-pool
  ]);
  await waitFor("PGlite", () => canConnect(pgPort), pg, 30_000);
  const databaseUrl = `postgres://postgres:postgres@127.0.0.1:${pgPort}/postgres`;
  log(`PGlite på port ${pgPort}`);

  const baseEnv = { ...process.env };
  // Ingenting fra utviklerens miljø eller .env-filer skal lekke inn i testserveren.
  for (const key of ["DATABASE_URL_UNPOOLED", "POSTGRES_URL", "BLOB_WEBHOOK_PUBLIC_KEY", "VERCEL_OIDC_TOKEN", "BLOB_STORE_ID"]) {
    delete baseEnv[key];
  }
  const migrate = run("migrate", node, ["scripts/migrate.mjs"], { env: { ...baseEnv, DATABASE_URL: databaseUrl } });
  if ((await migrate.exited) !== 0) throw new Error(`Migrasjonene feilet:\n${tail(migrate.logFile)}`);
  log("Migrasjoner kjørt");

  // 2) Porter. NEXT_PUBLIC_* bakes inn i builden (appens adresse, og Blob-adressen nettleseren
  //    laster opp til), så portene huskes til neste --no-build.
  const marker = path.join(root, ".next/e2e-build.json");
  const buildId = () => fs.readFileSync(path.join(root, ".next/BUILD_ID"), "utf8").trim();
  let saved = null;
  if (noBuild) {
    try {
      saved = JSON.parse(fs.readFileSync(marker, "utf8"));
      if (saved.buildId !== buildId()) {
        saved = null;
        log("Siste build er ikke en e2e-build (f.eks. etter npm run check) — bygger på nytt.");
      }
    } catch {
      saved = null;
      log("Fant ingen e2e-build — bygger.");
    }
    for (const port of [saved?.appPort, saved?.blobPort].filter(Boolean)) {
      if (!(await portIsFree(port))) throw new Error(`Port ${port} (fra forrige e2e-build) er opptatt. Kjør uten --no-build.`);
    }
  }
  const mustBuild = saved === null;
  const appPort = saved?.appPort ?? (await freePort());
  const baseUrl = `http://localhost:${appPort}`;

  // 3) Falske tjenester
  const anthropic = await startAnthropicMock();
  const blob = await startBlobMock({ port: saved?.blobPort ?? 0 });
  closers.push(anthropic.close, blob.close);
  log(`Falsk Claude på ${anthropic.url}, falsk Blob på ${blob.url}`);

  const appEnv = {
    ...baseEnv,
    NODE_ENV: "production",
    NEXT_TELEMETRY_DISABLED: "1",
    __NEXT_PROCESSED_ENV: "true", // ikke les .env.local o.l.
    DATABASE_URL: databaseUrl,
    BETTER_AUTH_SECRET: TEST_AUTH_SECRET,
    ALLOWED_EMAILS: `${OWNER.email},${PARTNER.email}`,
    NEXT_PUBLIC_APP_URL: baseUrl,
    ANTHROPIC_API_KEY: "sk-ant-test",
    ANTHROPIC_BASE_URL: anthropic.url,
    BLOB_READ_WRITE_TOKEN: blob.readWriteToken,
    VERCEL_BLOB_API_URL: blob.url,
    VERCEL_BLOB_RETRIES: "0",
    // Nettleseren laster opp rett til Blob-API-et. Playwright kan ikke videresende fil-innhold
    // fra en avskåret forespørsel, så builden peker nettleseren til den falske Blob-serveren.
    // «localhost» (ikke 127.0.0.1): da bruker @vercel/blob XHR i stedet for strømmet fetch,
    // som Chromium bare tillater over HTTP/2 (ERR_ALPN_NEGOTIATION_FAILED mot vanlig HTTP).
    NEXT_PUBLIC_VERCEL_BLOB_API_URL: blob.url.replace("127.0.0.1", "localhost"),
    E2E_BLOB_MOCK_URL: blob.url,
    // Tomme verdier overstyres ikke av .env-filer. BLOB_WEBHOOK_PUBLIC_KEY skal mangle:
    // opplasting må virke uten (feilen 9. okt).
    BLOB_WEBHOOK_PUBLIC_KEY: "",
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: "",
    VAPID_PRIVATE_KEY: "",
    NO_PROXY: ["localhost", "127.0.0.1", baseEnv.NO_PROXY].filter(Boolean).join(","),
    no_proxy: ["localhost", "127.0.0.1", baseEnv.no_proxy].filter(Boolean).join(","),
  };

  // 4) Build
  if (mustBuild) {
    log("Bygger (next build) …");
    const build = run("build", node, [nextBin, "build"], { env: appEnv });
    if ((await build.exited) !== 0) throw new Error(`next build feilet:\n${tail(build.logFile, 60)}`);
    fs.writeFileSync(marker, JSON.stringify({ appPort, blobPort: new URL(blob.url).port * 1, buildId: buildId() }));
    log("Build ferdig");
  }

  // 5) Start appen
  const app = run("next", node, [nextBin, "start", "-p", String(appPort), "-H", "127.0.0.1"], {
    env: { ...appEnv, NODE_OPTIONS: `${baseEnv.NODE_OPTIONS ?? ""} --import ${pathToFileURL(path.join(root, "tests/mocks/network.mjs")).href}`.trim() },
  });
  await waitFor(
    "next start",
    async () => (await fetch(`${baseUrl}/login`, { redirect: "manual" })).status === 200,
    app,
    60_000
  );
  log(`Appen kjører på ${baseUrl}`);

  // 6) Testene (én fil om gangen, i navnerekkefølge — 01-auth-onboarding lager familien)
  const testDir = path.join(root, "tests/e2e");
  const files = fs
    .readdirSync(testDir)
    .filter((f) => f.endsWith(".test.mjs"))
    .filter((f) => filters.length === 0 || filters.some((x) => f.includes(x)))
    .sort()
    .map((f) => path.join("tests/e2e", f));
  if (files.length === 0) throw new Error(`Ingen testfiler matcher ${filters.join(", ")}`);

  const tests = run(
    "tests",
    node,
    ["--test", "--test-concurrency=1", "--test-timeout=120000", "--test-reporter=spec", ...files],
    {
      inherit: true,
      env: {
        ...baseEnv,
        E2E_BASE_URL: baseUrl,
        E2E_ANTHROPIC_URL: anthropic.url,
        E2E_BLOB_URL: blob.url,
        E2E_TMP: tmp,
        E2E_DATABASE_URL: databaseUrl, // bare til å legge inn testdata
        NO_PROXY: appEnv.NO_PROXY,
        no_proxy: appEnv.no_proxy,
      },
    }
  );
  const TEST_LIMIT_MS = 5 * 60_000;
  let timer;
  const limit = new Promise((resolve) => {
    timer = setTimeout(() => {
      console.error(`\n[e2e] Testene brukte over ${TEST_LIMIT_MS / 60_000} minutter — avbryter og rydder opp.`);
      killGroup(tests, "SIGKILL");
      resolve(124);
    }, TEST_LIMIT_MS);
  });
  const code = await Promise.race([tests.exited, limit]);
  clearTimeout(timer);
  if (code !== 0) {
    console.log(`\n[e2e] Siste linjer fra appens logg (${app.logFile}):\n${tail(app.logFile)}`);
  }
  return code;
}

let exitCode = 1;
try {
  exitCode = await main();
} catch (error) {
  console.error(`\n[e2e] ${error instanceof Error ? error.message : error}`);
  exitCode = 1;
} finally {
  await cleanup();
  if (keep || exitCode !== 0) {
    log(`Logger og database ligger i ${tmp}`);
  } else {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  log(exitCode === 0 ? "Ferdig — alt bestått." : "Ferdig — noe feilet.");
}
process.exit(exitCode);
