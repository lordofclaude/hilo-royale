#!/usr/bin/env node
"use strict";

// Zero-dependency local server with the same clean-URL behavior as Vercel.
// This keeps README instructions, shared challenge links, and every CTA on
// the exact routes judges will use in production.
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { URL } = require("node:url");

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 8080);
const TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
};

function fileFor(pathname) {
  let clean;
  try { clean = decodeURIComponent(pathname); } catch { return null; }
  if (clean === "/") clean = "/index.html";
  else if (!path.extname(clean)) clean += ".html";
  const candidate = path.resolve(ROOT, "." + clean);
  return candidate.startsWith(ROOT + path.sep) ? candidate : null;
}

const server = http.createServer((req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8", Allow: "GET, HEAD" });
    res.end("Method not allowed");
    return;
  }
  const url = new URL(req.url || "/", "http://localhost");
  const file = fileFor(url.pathname);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }
  res.writeHead(200, {
    "Content-Type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream",
    "Cache-Control": "no-store",
  });
  if (req.method === "HEAD") { res.end(); return; }
  fs.createReadStream(file).pipe(res);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Hi-Lo Royale running at http://127.0.0.1:${PORT}`);
});
