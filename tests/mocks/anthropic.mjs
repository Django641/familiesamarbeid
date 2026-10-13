// Falsk Anthropic Messages API for e2e-testene (appen peker hit via ANTHROPIC_BASE_URL).
//
// - POST /v1/messages            svarer i samme form som ekte Messages API. Innholdet velges
//                                ut fra JSON-skjemaet appen ber om (events / ordered / place_after / weekly_plan),
//                                eller fra et svar testen har lagt i kø.
// - POST /__next-response        legg et svar i kø: { output: {...} } (blir JSON i text-blokka),
//                                eller { text: "..." }, { status, error } for feil, ev. { stop_reason }.
//                                Valgfritt { kind: "events" | "ordered" | "place_after" | "weekly_plan" } — da brukes
//                                svaret bare for den typen kall. Valgfritt { match: "tekst" } — da brukes svaret
//                                bare for kall der et vedlegg inneholder teksten (uavhengig av kallrekkefølge).
// - GET  /__last-request         siste kall appen gjorde, med vedlegg (base64) og systemprompt.
// - GET  /__requests             alle kall (uten vedleggsdata).
// - POST /__reset                tøm kø og logg.
//
// Kan startes alene: `node tests/mocks/anthropic.mjs [port]`.

import http from "node:http";

function kindOf(body) {
  const props = body?.output_config?.format?.schema?.properties ?? {};
  if ("events" in props) return "events";
  if ("ordered" in props) return "ordered";
  if ("place_after" in props) return "place_after";
  if ("homework" in props) return "weekly_plan";
  return "ukjent";
}

function textOf(content) {
  if (typeof content === "string") return content;
  return (content ?? [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

function addDays(dateKey, n) {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/**
 * Standardsvar for ukeplan: tolker systemprompten på samme måte som Claude ville gjort —
 * første barn i familielista («- Navn (barn)») og «Mandag i denne uka er YYYY-MM-DD».
 */
function defaultWeeklyPlan(body) {
  const system = typeof body.system === "string" ? body.system : JSON.stringify(body.system);
  const monday = system.match(/Mandag i denne uka er (\d{4}-\d{2}-\d{2})/)?.[1] ?? "";
  const child = system.match(/^- (.+?) \(barn\)/m)?.[1] ?? "";
  if (!monday) return { person: child, week_start: "", goals: [], homework: [], calendar: [], explanation: "Ingen uke i prompten." };
  return {
    person: child,
    week_start: monday,
    goals: ["Jeg kan 7-gangen"],
    homework: [
      { text: "Les side 12–15 i lesebok", due: addDays(monday, 1) },
      { text: "Øv på glosene denne uka", due: "" },
    ],
    calendar: [
      { title: "Tur til Nordmarka", date: addDays(monday, 2), start_time: "09:00", end_time: "13:00", all_day: false, kind: "hendelse", notes: "Oppmøte ved skolen" },
      { title: "🩳 Gymtøy", date: addDays(monday, 3), start_time: "", end_time: "", all_day: true, kind: "ta_med", notes: "" },
    ],
    explanation: "",
  };
}

/** Standardsvar når testen ikke har bedt om noe spesielt. */
function defaultOutput(kind, body) {
  const userText = textOf(body.messages?.[0]?.content);
  if (kind === "ordered") {
    const count = (userText.match(/^\d+\. /gm) ?? []).length;
    return { ordered: Array.from({ length: count }, (_, i) => i + 1) };
  }
  if (kind === "place_after") return { place_after: 0 };
  if (kind === "weekly_plan") return defaultWeeklyPlan(body);
  return { events: [], explanation: "Testserveren har ikke fått beskjed om hva den skal svare." };
}

function summarize(body) {
  const content = body.messages?.[0]?.content;
  const attachments = (Array.isArray(content) ? content : [])
    .filter((b) => b.source?.type === "base64")
    .map((b) => ({
      type: b.type,
      media_type: b.source.media_type,
      bytes: Buffer.from(b.source.data, "base64").length,
      data: b.source.data,
    }));
  return {
    at: new Date().toISOString(),
    kind: kindOf(body),
    model: body.model,
    max_tokens: body.max_tokens,
    effort: body.output_config?.effort ?? null,
    schema: body.output_config?.format?.schema ?? null,
    fallbacks: body.fallbacks ?? null,
    system: typeof body.system === "string" ? body.system : JSON.stringify(body.system),
    text: textOf(content),
    attachments,
  };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function json(res, status, data, headers = {}) {
  res.writeHead(status, { "content-type": "application/json", ...headers });
  res.end(JSON.stringify(data));
}

export async function startAnthropicMock({ port = 0, host = "127.0.0.1", quiet = true } = {}) {
  const queue = [];
  const requests = [];
  let n = 0;

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://mock");
      const raw = await readBody(req);

      if (url.pathname === "/__next-response" && req.method === "POST") {
        queue.push(JSON.parse(raw.toString() || "{}"));
        return json(res, 200, { queued: queue.length });
      }
      if (url.pathname === "/__last-request") {
        return requests.length ? json(res, 200, requests.at(-1)) : json(res, 404, { error: "ingen kall ennå" });
      }
      if (url.pathname === "/__requests") {
        return json(
          res,
          200,
          requests.map(({ attachments, ...r }) => ({ ...r, attachments: attachments.map(({ data, ...a }) => a) }))
        );
      }
      if (url.pathname === "/__reset" && req.method === "POST") {
        queue.length = 0;
        requests.length = 0;
        return json(res, 200, { ok: true });
      }

      if (url.pathname === "/v1/messages" && req.method === "POST") {
        const body = JSON.parse(raw.toString() || "{}");
        const record = summarize(body);
        requests.push(record);
        if (!quiet) console.log("[anthropic-mock]", record.kind, record.model, record.attachments.map((a) => a.media_type));

        // Valgfritt { match: "tekst" }: bare for kall der et vedlegg (dekodet som latin1) inneholder teksten.
        // Gjør svar uavhengige av i hvilken rekkefølge parallelle kall kommer.
        const attachmentText = record.attachments.map((a) => Buffer.from(a.data, "base64").toString("latin1")).join("\n");
        const index = queue.findIndex(
          (q) => (!q.kind || q.kind === record.kind) && (!q.match || attachmentText.includes(q.match))
        );
        const planned = index >= 0 ? queue.splice(index, 1)[0] : null;
        if (planned?.status && planned.status >= 400) {
          return json(
            res,
            planned.status,
            { type: "error", error: { type: planned.errorType ?? "api_error", message: planned.error ?? "testfeil" } },
            { "request-id": `req_mock_${++n}` }
          );
        }
        const text = planned?.text ?? JSON.stringify(planned?.output ?? defaultOutput(record.kind, body));
        return json(
          res,
          200,
          {
            id: `msg_mock_${++n}`,
            type: "message",
            role: "assistant",
            model: body.model,
            content: [{ type: "text", text }],
            stop_reason: planned?.stop_reason ?? "end_turn",
            stop_sequence: null,
            usage: { input_tokens: 100, output_tokens: 20 },
          },
          { "request-id": `req_mock_${n}` }
        );
      }

      json(res, 404, { type: "error", error: { type: "not_found_error", message: `ukjent rute ${url.pathname}` } });
    } catch (error) {
      json(res, 500, { type: "error", error: { type: "api_error", message: String(error) } });
    }
  });

  await new Promise((resolve) => server.listen(port, host, resolve));
  const address = server.address();
  return {
    url: `http://${host}:${address.port}`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const mock = await startAnthropicMock({ port: Number(process.argv[2] ?? 4999), quiet: false });
  console.log(`Falsk Anthropic på ${mock.url}`);
}
