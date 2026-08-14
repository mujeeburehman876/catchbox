# BUILDLOG.md

Honest log of where AI (Claude) helped build this capstone, where it got things wrong, and what
was changed as a result. Per the brief: "The AI wrote it" is not an answer at demo time, so this
log tracks the actual decisions, not just the fact that AI was involved.

## Where AI helped

- **Scaffolding the layered architecture** (`routes/ → services/ → repositories/ → db/`) in one
  pass, matching the pattern from A2 and the architecture live event, so tenant-isolation and
  swappable-provider requirements were baked in from the first commit rather than retrofitted.
- **Writing the full Zod validation schema set** and wiring it through a centralized error
  handler (`middleware/errorHandler.js`) so every rejection path (bad JSON, oversized body, zod
  failure, 404) returns a clean, consistent JSON error shape instead of Express's default HTML
  error page or an uncaught 500.
- **Designing the geo fallback chain as dependency-injectable** (`enrichIp(ip, providers)`) from
  the start, specifically so tests could supply deterministic mock providers instead of hitting
  `ip-api.com`/`ipapi.co` over the network — this was a direct response to the brief's own
  instruction in §7 ("mock the geo providers in tests... real free APIs are for manual dev only").
- **Drafting the full Vitest suite** (30 tests across 7 files) covering every Definition-of-Done
  probe: CORS preflight, invalid/oversized payload, honeypot spam, rate-limit burst, provider
  fallback (both directions), safe side-effect failure, idempotent retries, and tenant isolation.
- **Writing the embeddable widget bundle** (`utils/bundle.js`) as a single dependency-free IIFE,
  including the hidden honeypot field baked into the rendered form so the server-side spam check
  actually has something to catch in a real browser, not just in tests.

## Where AI was wrong, and what changed

- **Field-type validation gap.** The first version of `validateAgainstWidgetFields` only checked
  that required fields were *present*, not that their values matched the field's declared type
  (`email`, `text`, etc.). This meant `{"email": 123}` — an obviously malformed submission —
  was silently accepted and stored instead of rejected. This was caught by manually curl-ing the
  running server against the brief's own Probe 2 ("send a malformed... payload → clean 4xx"),
  *not* by the test suite, because the original test only asserted "status is somewhere in the
  4xx-5xx range" for a payload that happened to also fail for an unrelated reason (nested object).
  **Fix:** added `validateFieldValue()` with per-type checks (regex for email, `typeof` checks for
  the rest), added a dedicated test (`rejects a missing required field with 400`) and tightened
  the malformed-payload test's assertion. Lesson kept in mind for the rest of the build: a
  passing test suite is not proof of correctness if the tests themselves are loosely asserted —
  re-checked every 4xx test after this to make sure it asserts a *specific* error code, not just
  "some 4xx."
- **First draft of the rate limiter test tried to reconfigure the shared rate-limit env vars
  from inside a test that ran after other test files had already imported the app**, which
  doesn't work because `express-rate-limit`'s config is read once at module-load time. Rewrote
  `tests/rate-limit.test.js` to set `process.env.RATE_LIMIT_MAX_PER_IP` before a *dynamic*
  `import()` of `app.js`, isolated to that one file, instead of relying on static import order.

## What was reviewed and kept as-is

- The per-widget rate-limit bucket is a plain in-memory `Map` (`middleware/rateLimiter.js`).
  AI flagged this itself as a known limitation (won't survive a restart or scale past one
  instance) and documented it in the README's "Honest limitations" section rather than either
  hiding it or over-engineering a Redis-backed limiter for a capstone that runs on `localhost`.
- SQLite (via `better-sqlite3`) was chosen over Postgres+Docker for local development, per the
  brief's explicit allowance ("PostgreSQL via Docker, or SQLite to start"). The repository layer
  is the only place that would need to change to swap engines later.
