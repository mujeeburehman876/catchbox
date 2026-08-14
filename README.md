# Embeddable Widget & Lead-Capture Platform

FlyRank Internship · Backend Track · Capstone

A platform that lets a customer define a widget (signup form / CTA popover / contact form),
hand them a one-line `<script>` tag, and safely catch submissions from any website on the
public internet — validated, spam-filtered, rate-limited, geo-enriched, and dashboarded.

## Why it's built this way

The defining constraint of this capstone: **requests arrive from browsers you don't control.**
Every design decision below traces back to that one fact.

- Public routes (`/widgets/:id/config`, `/widget.js`, `/api/public/submissions`) allow **any**
  origin, because we can't know a customer's domain in advance — that's the whole point of an
  embeddable widget.
- Every public write is treated as hostile until proven otherwise: shape-validated (Zod),
  size-capped (20kb), rate-limited (per-IP *and* per-widget), spam-checked (honeypot), and
  boundary-validated against the widget's *own* field schema before it ever touches storage.
- Nothing non-critical is allowed to break the critical path. If geo lookup fails, the
  submission is still stored (without geo data). If the confirmation email/webhook throws, the
  submission is still stored and the visitor still gets a success response.
- Every admin-facing table query is scoped by `tenant_id`. There is no code path where a
  tenant's data is fetched without their id attached to the query — that's what "multi-tenant
  isolation" means in practice, not just a UI check.

## Architecture

```
Widget Owner (authenticated, JWT bearer)
  └─► Widget Management API ─► Widgets table (tenant-isolated) ─► embed snippet

Customer Website (any origin — this is the point)
  └─ <script src="https://api/widget.js?id=123" async>
       └─► GET /widgets/:id/config      (public · cached 60s · CORS: any origin)
       └─► renders a minimal form client-side

Website Visitor (anywhere on the internet)
  └─► POST /api/public/submissions      (public · CORS: any origin)
        ├─► idempotency check ──── retried request? → return the original row, no duplicate
        ├─► honeypot check ─────── bot filled the hidden field? → 202, nothing stored
        ├─► Zod shape validation ─ malformed/oversized? → clean 4xx, never a 500
        ├─► per-widget field validation ─ wrong type/missing required? → 400
        ├─► rate limit (per-IP, per-widget) ─ burst? → 429, service stays up
        ├─► geo enrichment: Provider A ─(fails)─► Provider B ─(fails)─► store anyway, no geo
        ├─► store submission (tenant_id + widget_id attached)
        └─► confirmation email/webhook ─ fails? → logged, submission still succeeds

Widget Owner (authenticated)
  └─► Dashboard API ◄── submissions + per-widget stats + tenant overview
```

### Layers

```
routes/       → HTTP only: parse params, call a service, map the result to a status code
services/     → business rules: tenant checks, the submission pipeline, the fallback chain
repositories/ → the only files that touch SQL; every widget/submission query takes a tenantId
db/           → schema.sql + connection singleton (swap better-sqlite3 for `pg` here for Postgres)
```

Swapping the database engine, or swapping `ip-api.com`/`ipapi.co` for different geo providers,
touches `db/` and `services/geo.service.js` only — routes and repositories for widgets/
submissions are unaware of either choice.

## Quick start

```bash
npm install
npm run migrate     # creates data/dev.sqlite3 and applies schema.sql
npm run seed         # creates a demo tenant, one widget, and 3 demo submissions
npm start             # http://localhost:3000
```

Demo login printed by the seed script:

```
email:    demo@flyrank.dev
password: demo-password-123
```

### Try the cross-origin embed for real

```bash
# terminal 1 (already running from `npm start`, port 3000)
# terminal 2, a SECOND origin:
npx serve test-site -l 5500
# or: python3 -m http.server 5500 --directory test-site
```

Open `test-site/index.html`, edit the `?id=` in its `<script>` tag to the widget id the seed
script printed, then load `http://localhost:5500` — the widget renders on a page that has
never heard of your backend, and submitting it lands a row in the dashboard.

### Run the tests

```bash
npm test
```

30 automated tests cover CORS preflight, invalid/oversized payloads, rate limiting, the
honeypot spam control, the geo provider fallback chain (both the unit-level chain and an
end-to-end submission that gets enriched by provider B when provider A is down), the "email
failure never blocks storage" guarantee, idempotent retries, and tenant isolation.

## API surface

All request/response bodies are JSON. See `capstone.yaml` for the full endpoint list the
evaluator probes.

### Auth (public)
| Method | Path | Body |
|---|---|---|
| POST | `/api/auth/register` | `{ email, password }` → `{ token, tenant }` |
| POST | `/api/auth/login` | `{ email, password }` → `{ token, tenant }` |

### Widget management (Bearer token required)
| Method | Path | Notes |
|---|---|---|
| POST | `/api/widgets` | `{ type, title, description?, fields[], buttonText?, displayOptions? }` |
| GET | `/api/widgets` | list, scoped to your tenant |
| GET | `/api/widgets/:id` | 404 if it isn't yours |
| PATCH | `/api/widgets/:id` | partial update; bumps `configVersion` automatically |
| DELETE | `/api/widgets/:id` | 204 |
| GET | `/api/widgets/:id/embed-snippet` | `{ snippet: "<script ...>" }` |

### Public widget delivery (no auth, any origin)
| Method | Path | Cache |
|---|---|---|
| GET | `/widgets/:id/config` | `max-age=60, stale-while-revalidate=30` |
| GET | `/widget.js?id=...` | `max-age=31536000, immutable` |

### Public submission (no auth, any origin, rate-limited)
| Method | Path | Body |
|---|---|---|
| OPTIONS | `/api/public/submissions` | CORS preflight |
| POST | `/api/public/submissions` | `{ widgetId, website: "", data: {...}, idempotencyKey? }` |

`website` is the honeypot field — always send it empty from real forms.

### Dashboard (Bearer token required)
| Method | Path |
|---|---|
| GET | `/api/dashboard/overview` |
| GET | `/api/dashboard/widgets/:id/submissions?limit=&offset=` |
| GET | `/api/dashboard/widgets/:id/stats` |

## Demo chaos flags

Set these env vars (see `.env.example`) and restart to demonstrate graceful degradation live,
exactly as described in the brief's demo script:

- `FORCE_GEO_PROVIDER_A_DOWN=true` — provider B takes over mid-demo
- `FORCE_GEO_PROVIDER_B_DOWN=true` — combine with the above to show "stored anyway, no geo"
- `FORCE_EMAIL_FAILURE=true` — the confirmation side effect throws; submission still succeeds

## Honest limitations

- No real CDN/hosting — per the brief's constraints, this runs locally on two ports/origins.
- The widget's rendered HTML/CSS is intentionally minimal; the grade here is backend
  correctness, not frontend polish.
- Per-widget rate limiting uses an in-memory bucket (documented in
  `src/middleware/rateLimiter.js`); a multi-instance deployment would move this to Redis —
  noted as a stretch goal, not implemented here.
- Geo providers are called over the open internet in `dev`/`prod`; tests never hit them (see
  `EVIDENCE.md` and `tests/geo.test.js` for how determinism is achieved via dependency
  injection instead).
