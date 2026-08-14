# EVIDENCE.md

One real, pasted proof per checkbox in the capstone's Definition of Done (§6). All output below
was captured by actually running the commands against `npm run migrate && npm run seed && npm start`
on 2026-08-14. Full automated test run: `npm test` → **30/30 passing** (see bottom of this file).

> Note on geo providers: this sandbox's outbound network allowlist does not include
> `ip-api.com` / `ipapi.co`, so live manual calls to the real providers can't succeed here.
> The brief itself says real providers are "for manual dev only" and mandates mocked,
> deterministic providers for proof of the fallback chain — see the dedicated test evidence
> below (`tests/geo.test.js`, `tests/enrichment-and-side-effects.test.js`), which is the
> authoritative, repeatable proof. The live curl below still proves the *degrade-gracefully*
> half of the contract end-to-end (submission stored successfully even when enrichment fails).

---

## WIDGET MANAGEMENT

**Authenticated CRUD endpoints; requests without valid auth are rejected.**
```
$ curl -s -X POST http://localhost:3000/api/widgets -d '{"title":"x"}'
{"error":"unauthorized","message":"Missing bearer token"}   (401)
```

**Full CRUD** (`tests/widgets.test.js › widget management + tenant isolation › creates, reads, updates and deletes a widget`):
```
$ curl -s -X POST http://localhost:3000/api/widgets -H "Authorization: Bearer $TOKEN" \
  -d '{"type":"contact_form","title":"Support Contact","fields":[...]}'
{"id":"wgt_yQerx6BGEqI1","tenant_id":"tnt_XSSRDRT9dZCC","type":"contact_form","title":"Support Contact", ...}

$ curl -s http://localhost:3000/api/widgets -H "Authorization: Bearer $TOKEN"
[{"id":"wgt_yQerx6BGEqI1", ...}, {"id":"wgt_nVgFM51_u_p8", ...}]
```
Test file proof: `npm test` → `✓ tests/widgets.test.js (7 tests)`.

**Multi-tenant isolation proven** (tenant A cannot read/modify tenant B's widgets):
```
$ curl -s -X POST http://localhost:3000/api/auth/register -d '{"email":"intruder@example.com","password":"password123"}'
{"token":"eyJ...", "tenant":{"id":"tnt_7h9e27XBHKYm","email":"intruder@example.com"}}

$ curl -s -i http://localhost:3000/api/widgets/wgt_nVgFM51_u_p8 -H "Authorization: Bearer <intruder token>"
HTTP/1.1 404 Not Found
{"error":"not_found","message":"Widget not found"}
```
Same proof extended (delete attempt, list leak check) in
`tests/widgets.test.js › proves tenant A cannot read or modify tenant B widgets` — passing.

---

## WIDGET DELIVERY

**Embed snippet generated per widget:**
```
$ curl -s http://localhost:3000/api/widgets/wgt_nVgFM51_u_p8/embed-snippet -H "Authorization: Bearer $TOKEN"
{"snippet":"<script src=\"http://localhost:3000/widget.js?id=wgt_nVgFM51_u_p8\" async></script>"}
```

**Public config endpoint, correct cache headers:**
```
$ curl -s -i http://localhost:3000/widgets/wgt_nVgFM51_u_p8/config
HTTP/1.1 200 OK
Cache-Control: public, max-age=60, stale-while-revalidate=30
Content-Type: application/json; charset=utf-8
```

**Versioned bundle, long/immutable cache:**
```
$ curl -s -i "http://localhost:3000/widget.js?id=wgt_nVgFM51_u_p8"
HTTP/1.1 200 OK
Cache-Control: public, max-age=31536000, immutable
Content-Type: application/javascript; charset=utf-8
```

**Renders on a page from a different origin:** `test-site/index.html` is a static HTML file
with zero build step, served from a second port (`npx serve test-site -l 5500`), that loads
`http://localhost:3000/widget.js?id=...` — proven structurally by CORS test below (a browser
enforces CORS on exactly this scenario) and functionally by
`tests/widget-delivery.test.js › renders correctly for a cross-origin request` — passing.

---

## PUBLIC SUBMISSION API

**Cross-origin CORS + preflight handled:**
```
$ curl -s -i -X OPTIONS http://localhost:3000/api/public/submissions \
  -H "Origin: http://customer-site.example" -H "Access-Control-Request-Method: POST"
HTTP/1.1 204 No Content
Access-Control-Allow-Origin: http://customer-site.example
Access-Control-Allow-Methods: GET,POST,OPTIONS
Access-Control-Allow-Headers: Content-Type
```

**Input validated; malformed → clean 4xx JSON:**
```
$ curl -s -i -X POST http://localhost:3000/api/public/submissions \
  -d '{"widgetId":"wgt_nVgFM51_u_p8","website":"","data":{"email":"not-an-email"}}'
HTTP/1.1 400 Bad Request
{"error":"invalid_field_type","message":"Field \"email\" must be a valid email address"}
```

**Oversized payload → 413:**
```
$ curl -s -i -X POST http://localhost:3000/api/public/submissions -d @big-30kb-payload.json
HTTP/1.1 413 Payload Too Large
{"error":"payload_too_large","message":"Request body exceeds size limit"}
```

**Valid submission stored, linked to widget+tenant, visible via dashboard:**
```
$ curl -s -X POST http://localhost:3000/api/public/submissions -H "Origin: http://customer-site.example" \
  -d '{"widgetId":"wgt_nVgFM51_u_p8","website":"","data":{"email":"evidence@example.com","name":"Evidence Runner"}}'
{"id":"sub_hkwVR_5P4n4JbP","status":"stored","deduplicated":false,"enriched":false}

$ curl -s http://localhost:3000/api/dashboard/widgets/wgt_nVgFM51_u_p8/submissions -H "Authorization: Bearer $TOKEN"
{"submissions":[{"id":"sub_hkwVR_5P4n4JbP","widget_id":"wgt_nVgFM51_u_p8","tenant_id":"tnt_XSSRDRT9dZCC", ... "data":{"email":"evidence@example.com","name":"Evidence Runner"}}, ...]}
```

**Idempotency** — retried request, same key, returns the original row rather than duplicating:
Proven in `tests/submissions.test.js › deduplicates a retried submission with the same idempotency key` — passing (asserts exactly 1 row after 2 identical requests).

---

## ABUSE PROTECTION

**Rate limiting returns 429 under burst; legitimate traffic keeps being served:**
```
$ for i in $(seq 1 25); do curl -s -o /dev/null -w "%{http_code} " -X POST \
    http://localhost:3000/api/public/submissions -d "{...email$i...}"; done
201 201 201 201 201 201 201 201 201 201 201 201 201 201 201 201 429 429 429 429 429 429 429 429 429

$ curl -s http://localhost:3000/healthz     # server unaffected, still serving
{"status":"ok"}
```
Also proven with a different, unrelated widget still being served during the flood in
`tests/rate-limit.test.js › keeps serving a DIFFERENT widget even while one widget is being flooded` — passing.

**Honeypot spam control demonstrably blocks a spam submission:**
```
$ curl -s -i -X POST http://localhost:3000/api/public/submissions \
  -d '{"widgetId":"wgt_nVgFM51_u_p8","website":"http://spam-bot.example","data":{"email":"bot@spam.example"}}'
HTTP/1.1 202 Accepted
{"status":"accepted"}
```
Nothing was actually stored — confirmed in
`tests/submissions.test.js › silently drops a submission when the honeypot field is filled (spam)`,
which asserts the dashboard submissions list is empty afterward — passing.

---

## ENRICHMENT & SAFE SIDE EFFECTS

**Provider A down → Provider B answers, submission enriched** (deterministic, mocked — per the
brief's own instruction that fallback proof should not depend on live third-party APIs):
```
tests/geo.test.js › falls back to provider B when provider A is down
  expect(result.provider).toBe('provider_b')      ✓ passing
tests/enrichment-and-side-effects.test.js › stores a submission enriched by provider B when provider A fails
  expect(submission.geo_provider).toBe('provider_b')
  expect(submission.country).toBe('Japan')          ✓ passing
```

**All providers down → submission still succeeds, without geo:**
```
tests/geo.test.js › degrades gracefully (submission-safe) when ALL providers are down
  expect(result.provider).toBeNull(); expect(result.country).toBeNull()   ✓ passing
```
Live equivalent (real providers unreachable from this sandbox, which is itself an "all down" case):
```
$ curl -s -X POST http://localhost:3000/api/public/submissions \
  -d '{"widgetId":"wgt_nVgFM51_u_p8","website":"","data":{"email":"both-down@example.com"}}'
{"id":"sub_uwh6Gkub2dOVMz","status":"stored","deduplicated":false,"enriched":false}
```
→ 2xx, stored, `enriched:false` — exactly the required degrade-not-fail behavior.

**Failing email/webhook side effect never blocks the submission:**
```
$ FORCE_EMAIL_FAILURE=true npm start
$ curl -s -X POST http://localhost:3000/api/public/submissions \
  -d '{"widgetId":"wgt_nVgFM51_u_p8","website":"","data":{"email":"sideeffect@example.com"}}'
{"id":"sub__UiVwiNKOYa9u8","status":"stored","deduplicated":false,"enriched":false}

server log: [email] side effect failed for submission sub__UiVwiNKOYa9u8: email/webhook side effect forced to fail (demo flag)
```
Row is stored (`status: "stored"`, 2xx) despite the forced failure. Also unit-tested in
`tests/enrichment-and-side-effects.test.js › still returns success and stores the row even when the email/webhook side effect throws` — passing.

---

## TESTS & DOCUMENTATION

```
$ npm test

 ✓ tests/submissions.test.js (8 tests) 625ms
 ✓ tests/widgets.test.js (7 tests) 661ms
 ✓ tests/enrichment-and-side-effects.test.js (3 tests) 280ms
 ✓ tests/rate-limit.test.js (2 tests) 465ms
 ✓ tests/widget-delivery.test.js (4 tests) 313ms
 ✓ tests/dashboard.test.js (3 tests) 447ms
 ✓ tests/geo.test.js (3 tests) 3ms

 Test Files  7 passed (7)
      Tests  30 passed (30)
```

Covers: CORS preflight, invalid payload, oversized payload, rate limiting, spam control (honeypot),
provider fallback chain (both unit-level and end-to-end), successful widget config/bundle
rendering, idempotent retries, tenant isolation, and the safe-side-effect guarantee.

README.md present with architecture diagram, setup instructions, and full API documentation.
capstone.yaml, BUILDLOG.md, .env.example present (see repo root).
