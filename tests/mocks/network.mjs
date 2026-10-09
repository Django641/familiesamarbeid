// Forhåndslastes i `next start` under e2e (NODE_OPTIONS=--import …/network.mjs).
//
// @vercel/blob sin get() henter private filer rett fra https://<store>.private.blob.vercel-storage.com
// (kan ikke overstyres med VERCEL_BLOB_API_URL), og værkortet henter fra api.met.no. Begge
// sendes her til den falske Blob-serveren (E2E_BLOB_MOCK_URL), så testene aldri når ekte
// tjenester. Opprinnelig vertsnavn sendes med i headeren x-test-original-host.
//
// Fungerer fordi både Node sin innebygde fetch og undici-pakken (som @vercel/blob bruker)
// leser den globale dispatcheren fra samme globale symbol.

import { Agent, setGlobalDispatcher } from "undici";

const target = process.env.E2E_BLOB_MOCK_URL;
const REWRITE = [/\.blob\.vercel-storage\.com$/, /^api\.met\.no$/];

if (target) {
  const agent = new Agent().compose((dispatch) => (opts, handler) => {
    const origin = new URL(String(opts.origin));
    if (!REWRITE.some((re) => re.test(origin.hostname))) return dispatch(opts, handler);
    const extra = ["x-test-original-host", origin.hostname];
    let headers = opts.headers;
    if (Array.isArray(headers)) headers = [...headers, ...extra];
    else if (headers && typeof headers === "object") headers = { ...headers, [extra[0]]: extra[1] };
    else headers = extra;
    return dispatch({ ...opts, origin: target, headers }, handler);
  });
  setGlobalDispatcher(agent);
}
