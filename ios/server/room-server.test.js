"use strict";
const { spawn } = require("node:child_process");
const http = require("node:http");
const path = require("node:path");

const port = 18000 + (process.pid % 1000);
const child = spawn(process.execPath, [path.join(__dirname, "room-server.js")], { env: { ...process.env, PORT: String(port), ROOM_ORIGINS: "https://hilo-royale.vercel.app" }, stdio: "ignore" });
let pass = 0, fail = 0;
function eq(name, got, want) { if (got === want) { pass++; console.log("  ok ", name); } else { fail++; console.error("FAIL", name, "got", got, "want", want); } }
function raw(pathname, options = {}) { return new Promise((resolve, reject) => { const req = http.request({ host: "127.0.0.1", port, path: pathname, method: options.method || "GET", headers: options.headers || {} }, res => { let body = ""; res.on("data", c => body += c); res.on("end", () => resolve({ status: res.statusCode, body })); }); req.on("error", reject); if (options.body) req.write(options.body); req.end(); }); }
async function ready() { for (let i = 0; i < 30; i++) { try { const r = await raw("/health"); if (r.status === 200) return; } catch {} await new Promise(r => setTimeout(r, 100)); } throw new Error("room server did not start"); }

(async () => {
  try {
    await ready();
    eq("snapshot read does not allocate a room", JSON.parse((await raw("/api/rooms/ABC" )).body).players.length, 0);
    eq("malformed URI is rejected, not fatal", (await raw("/api/rooms/%")).status, 400);
    eq("server remains healthy after malformed URI", (await raw("/health")).status, 200);
    eq("hostile browser origin is denied", (await raw("/api/rooms/ABC", { headers: { Origin: "https://evil.example" } })).status, 403);
    const joined = await raw("/api/rooms/ABC/join", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: "fan-test", name: "Test Fan", avatarUrl: "https://tracking.invalid/a.png" }) });
    eq("valid join succeeds", joined.status, 200);
    eq("room snapshot does not expose avatar URL", joined.body.includes("avatarUrl"), false);
  } finally {
    child.kill();
  }
  console.log(`\nroom-server.test.js: ${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
})().catch(error => { child.kill(); console.error(error); process.exitCode = 1; });
