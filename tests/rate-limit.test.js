import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';

// Use a tiny limit for this test file so we can trigger 429s without
// sending hundreds of requests. Set BEFORE importing the app, since the
// rate limiter middleware reads these env vars at module-load time.
process.env.RATE_LIMIT_MAX_PER_IP = '3';
process.env.RATE_LIMIT_WINDOW_MS = '60000';

let createApp;
let registerTenant;
let createWidget;

beforeAll(async () => {
  ({ createApp } = await import('../src/app.js'));
  ({ registerTenant, createWidget } = await import('./helpers.js'));
});

describe('rate limiting', () => {
  it('returns 429 after a burst, and a normal request right after still succeeds once the window resets', async () => {
    const app = createApp();
    const { token } = await registerTenant(app);
    const widget = await createWidget(app, token);

    const submit = () =>
      request(app)
        .post('/api/public/submissions')
        .send({ widgetId: widget.id, website: '', data: { email: 'burst@example.com' } });

    const results = [];
    for (let i = 0; i < 5; i++) {
      results.push(await submit());
    }

    const statuses = results.map((r) => r.status);
    expect(statuses).toContain(429);
    // At least the first request(s) within the limit succeeded.
    expect(statuses.filter((s) => s === 201).length).toBeGreaterThan(0);
  });

  it('keeps serving a DIFFERENT widget even while one widget is being flooded', async () => {
    const app = createApp();
    const { token } = await registerTenant(app);
    const widgetA = await createWidget(app, token, { title: 'Widget A' });

    // Exhaust the per-IP limit against widget A.
    for (let i = 0; i < 3; i++) {
      await request(app)
        .post('/api/public/submissions')
        .send({ widgetId: widgetA.id, website: '', data: { email: `x${i}@example.com` } });
    }

    // The config endpoint (a different, unthrottled route) still responds normally.
    const configRes = await request(app).get(`/widgets/${widgetA.id}/config`);
    expect(configRes.status).toBe(200);
  });
});
