"use strict";
const fs = require("node:fs");
const path = require("node:path");

let pass = 0, fail = 0;
function eq(name, got, want) { if (JSON.stringify(got) === JSON.stringify(want)) { pass++; console.log("  ok ", name); } else { fail++; console.error("FAIL", name, "got", got, "want", want); } }

function loadHandler(file, env, fetchImpl) {
  let src = fs.readFileSync(path.join(__dirname, "api", file), "utf8");
  src = src.replace(/export default async function handler/, "async function handler");
  const fakeProcess = { env: { ...env } };
  return new Function("process", "fetch", "AbortSignal", "Buffer", `${src}\nreturn handler;`)(fakeProcess, fetchImpl, AbortSignal, Buffer);
}

function response() {
  return { statusCode: 200, headers: {}, body: null, headersSent: false,
    setHeader(k, v) { this.headers[k] = v; },
    status(n) { this.statusCode = n; return this; },
    json(v) { this.body = v; this.headersSent = true; return this; },
    writeHead(n, h) { this.statusCode = n; Object.assign(this.headers, h); this.headersSent = true; },
    write() {}, end() {},
  };
}

async function call(handler, req) { const res = response(); await handler(req, res); return res; }

async function main() {
  const neverFetch = async () => { throw new Error("fetch should not run"); };
  let h = loadHandler("txline.js", {}, neverFetch);
  eq("API rejects POST", (await call(h, { method: "POST", query: {} })).statusCode, 405);
  eq("API rejects malformed fixture", (await call(h, { method: "GET", query: { fixtureId: "1822x" } })).statusCode, 400);
  eq("API rejects unlisted fixture", (await call(h, { method: "GET", query: { fixtureId: "99999999" } })).statusCode, 404);
  eq("API reports missing backend credentials", (await call(h, { method: "GET", query: { fixtureId: "18222446" } })).statusCode, 503);

  const rows = [
    { BookmakerId: 7, MarketPeriod: null, SuperOddsType: "1X2_PARTICIPANT_RESULT", Pct: [90, 5, 5], Ts: 900 },
    { BookmakerId: 10021, MarketPeriod: "H1", SuperOddsType: "1X2_PARTICIPANT_RESULT", Pct: [80, 10, 10], Ts: 800 },
    { BookmakerId: 10021, MarketPeriod: null, SuperOddsType: "1X2_PARTICIPANT_RESULT", Pct: [40, 30, 30], Ts: 500 },
    { BookmakerId: 10021, MarketPeriod: null, SuperOddsType: "1X2_PARTICIPANT_RESULT", Pct: [45, 25, 30], Ts: 700 },
  ];
  h = loadHandler("txline.js", { TXLINE_JWT: "secret", TXLINE_API_TOKEN: "secret" }, async () => ({ ok: true, text: async () => JSON.stringify(rows) }));
  const odds = await call(h, { method: "GET", query: { fixtureId: "18222446" } });
  eq("odds uses newest full-match consensus source", odds.body, { ok: true, fixtureId: "18222446", p1: 45, draw: 25, p2: 30, ts: 700 });
  eq("odds response has short CDN cache", odds.headers["Cache-Control"], "s-maxage=10, stale-while-revalidate=30");

  const stream = loadHandler("txline-stream.js", { TXLINE_JWT: "secret", TXLINE_API_TOKEN: "secret" }, neverFetch);
  eq("stream rejects POST", (await call(stream, { method: "POST", query: {}, headers: {}, on() {} })).statusCode, 405);
  eq("stream rejects malformed fixture", (await call(stream, { method: "GET", query: { fixtureId: "%" }, headers: {}, on() {} })).statusCode, 400);

  console.log(`\napi.test.js: ${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
