// gradeloop-relay: forwards GradeLoop model-gateway calls to the vendor
// from a clean egress IP.
//
// Why: the vendor (Agnes) rate-limits Cloudflare Workers' shared egress
// IPs (429 + dropped connections), while the same keys work fine from
// other IPs. The Worker calls this relay; the relay calls the vendor, so
// the vendor sees this host's IP instead of Cloudflare's.
//
// Env:
//   PORT            - Render provides it.
//   VENDOR_BASE_URL - vendor base URL, e.g. https://apihub.agnes-ai.com/v1
//   RELAY_TOKEN     - shared secret; the Worker sends it as X-Relay-Token.
//                     The relay never stores API keys: the Worker passes
//                     its own Authorization header through untouched.
//
// The relay only forwards to VENDOR_BASE_URL (never an open proxy), and
// never logs the Authorization header.
const http = require("node:http");

const PORT = Number(process.env.PORT || 3000);
const VENDOR_BASE_URL = (process.env.VENDOR_BASE_URL || "https://apihub.agnes-ai.com/v1").replace(/\/$/, "");
const RELAY_TOKEN = process.env.RELAY_TOKEN || "";

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");

  // Health check for the keep-alive ping.
  if (req.method === "GET" && url.pathname === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (!RELAY_TOKEN || req.headers["x-relay-token"] !== RELAY_TOKEN) {
    res.writeHead(401, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "unauthorized" }));
    return;
  }

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks);
  const target = VENDOR_BASE_URL + url.pathname + url.search;
  try {
    const headers = { ...req.headers };
    delete headers.host;
    delete headers["x-relay-token"];
    delete headers["content-length"];
    const upstream = await fetch(target, {
      method: req.method,
      headers,
      body: body.length ? body : undefined,
    });
    const respBody = Buffer.from(await upstream.arrayBuffer());
    res.writeHead(upstream.status, {
      "content-type": upstream.headers.get("content-type") || "application/json",
    });
    res.end(respBody);
  } catch (e) {
    res.writeHead(502, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "upstream_error", message: String((e && e.message) || e) }));
  }
});

server.listen(PORT, () => console.log(`gradeloop-relay listening on ${PORT}`));
