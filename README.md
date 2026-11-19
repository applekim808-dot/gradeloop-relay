# gradeloop-relay

Forwards GradeLoop model-gateway calls to the vendor from a clean egress
IP. The vendor rate-limits Cloudflare Workers' shared egress IPs, so the
Worker calls this relay and the relay calls the vendor.

- `GET /health` — health check (used by the keep-alive ping).
- Any other path is forwarded to `VENDOR_BASE_URL` + path, preserving
  method, headers (including `Authorization`), and body. The relay only
  forwards to the configured vendor base URL; it is not an open proxy.
- Requires `X-Relay-Token: <RELAY_TOKEN>` on every forwarded request.
- The relay never stores API keys; the Worker passes its own
  `Authorization` header through untouched.

## Env

- `VENDOR_BASE_URL` — e.g. `https://apihub.agnes-ai.com/v1`
- `RELAY_TOKEN` — shared secret between the Worker and the relay
