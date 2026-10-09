// Falsk Vercel Blob for e2e-testene. Implementerer akkurat de kallene @vercel/blob 2.x gjør
// i dokumentflyten (lest fra node_modules/@vercel/blob/dist):
//
// API (serveren peker hit via VERCEL_BLOB_API_URL, nettleseren rutes hit av testen):
// - POST /signed-token        issueSignedToken() → { clientSigningToken, delegationToken }
// - PUT  /?pathname=…         uploadPresigned() fra nettleseren, med vercel-blob-delegation og
//                             vercel-blob-signature i URL-en. Signaturen sjekkes som hos Vercel:
//                             HMAC-SHA256(clientSigningToken, kanonisk streng), base64url.
// - GET  /?url=…              head()
// - POST /delete              del()
// Lagring (privat blob-URL https://<store>.private.blob.vercel-storage.com/<sti>, som
// tests/mocks/network.mjs sender hit med headeren x-test-original-host):
// - GET  /<sti>               get() — med ETag og 304 ved If-None-Match
// Kontroll for testene:
// - GET  /__files             filene som ligger lagret (uten innhold)
// - GET  /__log               alle kall
//
// Kan startes alene: `node tests/mocks/blob.mjs [port]`.

import { createHash, createHmac } from "node:crypto";
import http from "node:http";

const CANONICAL_KEYS = [
  "vercel-blob-add-random-suffix",
  "vercel-blob-allow-overwrite",
  "vercel-blob-allowed-content-types",
  "vercel-blob-cache-control-max-age",
  "vercel-blob-callback-token-payload",
  "vercel-blob-callback-url",
  "vercel-blob-if-match",
  "vercel-blob-maximum-size-in-bytes",
  "vercel-blob-valid-until",
];

const b64url = (buf) => Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (s) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, PUT, POST, OPTIONS",
  "access-control-allow-headers": "*",
  "access-control-expose-headers": "*",
};

function json(res, status, data) {
  res.writeHead(status, { "content-type": "application/json", ...CORS });
  res.end(JSON.stringify(data));
}

function blobError(res, status, code, message) {
  json(res, status, { error: { code, message } });
}

export async function startBlobMock({ port = 0, host = "127.0.0.1", storeId = "teststore", quiet = true } = {}) {
  const files = new Map(); // pathname → { body, contentType, uploadedAt, etag }
  const signingKeys = new Map(); // delegationToken → clientSigningToken
  const log = [];

  const blobUrl = (pathname) => `https://${storeId}.private.blob.vercel-storage.com/${pathname}`;
  const meta = (pathname, f) => ({
    url: blobUrl(pathname),
    downloadUrl: `${blobUrl(pathname)}?download=1`,
    pathname,
    size: f.body.length,
    contentType: f.contentType,
    access: f.access ?? null,
    contentDisposition: `attachment; filename="${pathname.split("/").pop()}"`,
    cacheControl: "public, max-age=2592000",
    uploadedAt: f.uploadedAt,
    etag: f.etag,
  });

  function verifyPresigned(url, operation) {
    const delegation = url.searchParams.get("vercel-blob-delegation");
    const signature = url.searchParams.get("vercel-blob-signature");
    const pathname = url.searchParams.get("pathname");
    if (!delegation || !signature || !pathname) return "mangler presign-parametere";
    const key = signingKeys.get(delegation);
    if (!key) return "ukjent delegation-token";
    const scope = JSON.parse(fromB64url(delegation.split(".")[0]).toString());
    if (scope.pathname !== pathname) return `stien ${pathname} matcher ikke tokenet (${scope.pathname})`;
    if (!scope.operations?.includes(operation)) return `tokenet tillater ikke ${operation}`;
    if (Date.now() > scope.validUntil) return "tokenet er utløpt";
    const lines = [`operation=${operation}`, `pathname=${pathname}`];
    for (const k of CANONICAL_KEYS) {
      const v = url.searchParams.get(k);
      if (v) lines.push(`${k}=${v}`);
    }
    lines.sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
    const expected = b64url(createHmac("sha256", key).update(lines.join("\n")).digest());
    return expected === signature ? null : "feil signatur";
  }

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://mock");
      const body = await readBody(req);
      const originalHost = req.headers["x-test-original-host"];
      log.push({ at: new Date().toISOString(), method: req.method, path: url.pathname, host: originalHost ?? null });
      if (!quiet) console.log("[blob-mock]", req.method, originalHost ?? "", url.pathname + url.search.slice(0, 80));

      if (req.method === "OPTIONS") {
        res.writeHead(204, CORS);
        return res.end();
      }

      // --- Lagringsdomenet (get) ---
      if (typeof originalHost === "string" && originalHost.endsWith(".blob.vercel-storage.com")) {
        if (!String(req.headers.authorization ?? "").startsWith("Bearer vercel_blob_rw_")) {
          return blobError(res, 403, "forbidden", "Mangler lesetilgang");
        }
        const pathname = decodeURIComponent(url.pathname.slice(1));
        const f = files.get(pathname);
        if (!f) {
          res.writeHead(404, { "content-type": "text/plain" });
          return res.end("Not found");
        }
        const headers = {
          etag: f.etag,
          "last-modified": new Date(f.uploadedAt).toUTCString(),
          "cache-control": "private, max-age=0",
        };
        if (req.headers["if-none-match"] === f.etag) {
          res.writeHead(304, headers);
          return res.end();
        }
        res.writeHead(200, { ...headers, "content-type": f.contentType, "content-length": String(f.body.length) });
        return res.end(f.body);
      }

      // --- Kontrollruter for testene ---
      if (url.pathname === "/__files") {
        return json(res, 200, [...files.entries()].map(([p, f]) => meta(p, f)));
      }
      if (url.pathname === "/__log") return json(res, 200, log);

      // --- API ---
      if (url.pathname === "/signed-token" && req.method === "POST") {
        if (!String(req.headers.authorization ?? "").startsWith("Bearer vercel_blob_rw_")) {
          return blobError(res, 403, "forbidden", "Mangler BLOB_READ_WRITE_TOKEN");
        }
        const opts = JSON.parse(body.toString() || "{}");
        const scope = {
          storeId: `store_${storeId}`,
          pathname: opts.pathname ?? "*",
          operations: opts.operations ?? ["put", "get", "head", "delete"],
          validUntil: opts.validUntil ?? Date.now() + 3_600_000,
          maximumSizeInBytes: opts.maximumSizeInBytes,
          allowedContentTypes: opts.allowedContentTypes,
        };
        const payload = b64url(JSON.stringify(scope));
        const delegationToken = `${payload}.${b64url(createHash("sha256").update(payload).digest())}`;
        const clientSigningToken = `signing_${b64url(createHash("sha256").update(delegationToken + Math.random()).digest())}`;
        signingKeys.set(delegationToken, clientSigningToken);
        return json(res, 200, { clientSigningToken, delegationToken });
      }

      if (url.pathname === "/" && req.method === "PUT") {
        const problem = verifyPresigned(url, "put");
        if (problem) return blobError(res, 403, "forbidden", problem);
        const pathname = url.searchParams.get("pathname");
        const scope = JSON.parse(fromB64url(url.searchParams.get("vercel-blob-delegation").split(".")[0]).toString());
        if (scope.maximumSizeInBytes && body.length > scope.maximumSizeInBytes) {
          return blobError(res, 400, "bad_request", `the file length cannot be greater than ${scope.maximumSizeInBytes}`);
        }
        if (files.has(pathname) && req.headers["x-allow-overwrite"] !== "1") {
          return blobError(res, 400, "bad_request", "This blob already exists");
        }
        const f = {
          body,
          contentType: String(req.headers["x-content-type"] ?? "application/octet-stream"),
          access: req.headers["x-vercel-blob-access"] ? String(req.headers["x-vercel-blob-access"]) : null,
          uploadedAt: new Date().toISOString(),
          etag: `"${createHash("md5").update(body).digest("hex")}"`,
        };
        files.set(pathname, f);
        const m = meta(pathname, f);
        return json(res, 200, {
          url: m.url,
          downloadUrl: m.downloadUrl,
          pathname,
          contentType: m.contentType,
          contentDisposition: m.contentDisposition,
          etag: m.etag,
        });
      }

      if (url.pathname === "/" && req.method === "GET" && url.searchParams.has("url")) {
        const target = url.searchParams.get("url");
        const pathname = target.startsWith("http") ? new URL(target).pathname.slice(1) : target;
        const f = files.get(pathname);
        if (!f) return blobError(res, 404, "not_found", "The requested blob does not exist");
        return json(res, 200, meta(pathname, f));
      }

      if (url.pathname === "/delete" && req.method === "POST") {
        const { urls = [] } = JSON.parse(body.toString() || "{}");
        for (const u of urls) files.delete(u.startsWith("http") ? new URL(u).pathname.slice(1) : u);
        return json(res, 200, {});
      }

      // Alt annet (f.eks. met.no, som network.mjs også sender hit): svar raskt med 404.
      blobError(res, 404, "not_found", `ukjent rute ${req.method} ${url.pathname}`);
    } catch (error) {
      blobError(res, 500, "internal_server_error", String(error));
    }
  });

  await new Promise((resolve) => server.listen(port, host, resolve));
  const address = server.address();
  return {
    url: `http://${host}:${address.port}`,
    readWriteToken: `vercel_blob_rw_${storeId}_testtoken`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const mock = await startBlobMock({ port: Number(process.argv[2] ?? 4998), quiet: false });
  console.log(`Falsk Vercel Blob på ${mock.url} (BLOB_READ_WRITE_TOKEN=${mock.readWriteToken})`);
}
