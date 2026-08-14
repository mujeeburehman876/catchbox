import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { getApp, registerTenant, createWidget } from './helpers.js';

describe('public submission endpoint', () => {
  it('handles CORS preflight (OPTIONS) correctly', async () => {
    const app = getApp();
    const res = await request(app)
      .options('/api/public/submissions')
      .set('Origin', 'http://customer-site.example')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'Content-Type');

    expect([200, 204]).toContain(res.status);
    expect(res.headers['access-control-allow-origin']).toBe('http://customer-site.example');
    expect(res.headers['access-control-allow-methods']).toMatch(/POST/);
  });

  it('accepts a valid cross-origin submission and stores it (2xx)', async () => {
    const app = getApp();
    const { token } = await registerTenant(app);
    const widget = await createWidget(app, token);

    const res = await request(app)
      .post('/api/public/submissions')
      .set('Origin', 'http://customer-site.example')
      .send({ widgetId: widget.id, website: '', data: { email: 'visitor@example.com' } });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('stored');
    expect(res.headers['access-control-allow-origin']).toBe('http://customer-site.example');

    // Visible via the dashboard API afterwards.
    const dash = await request(app)
      .get(`/api/dashboard/widgets/${widget.id}/submissions`)
      .set('Authorization', `Bearer ${token}`);
    expect(dash.body.submissions).toHaveLength(1);
    expect(dash.body.submissions[0].data.email).toBe('visitor@example.com');
  });

  it('rejects a malformed payload with a clean 4xx, never a 500', async () => {
    const app = getApp();
    const { token } = await registerTenant(app);
    const widget = await createWidget(app, token);

    const res = await request(app)
      .post('/api/public/submissions')
      .send({ widgetId: widget.id, data: { email: 123, unexpectedNesting: { a: 1 } } });

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect(res.body.error).toBeTruthy();
  });

  it('rejects a missing required field with 400', async () => {
    const app = getApp();
    const { token } = await registerTenant(app);
    const widget = await createWidget(app, token); // requires "email"

    const res = await request(app)
      .post('/api/public/submissions')
      .send({ widgetId: widget.id, website: '', data: {} });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('missing_field');
  });

  it('rejects an oversized payload with 413', async () => {
    const app = getApp();
    const { token } = await registerTenant(app);
    const widget = await createWidget(app, token);

    const hugeString = 'x'.repeat(30_000); // body limit is 20kb
    const res = await request(app)
      .post('/api/public/submissions')
      .send({ widgetId: widget.id, website: '', data: { email: hugeString } });

    expect(res.status).toBe(413);
  });

  it('silently drops a submission when the honeypot field is filled (spam)', async () => {
    const app = getApp();
    const { token } = await registerTenant(app);
    const widget = await createWidget(app, token);

    const res = await request(app)
      .post('/api/public/submissions')
      .send({ widgetId: widget.id, website: 'http://spammy-bot.example', data: { email: 'bot@spam.example' } });

    expect(res.status).toBe(202); // accepted-looking response, but...

    const dash = await request(app)
      .get(`/api/dashboard/widgets/${widget.id}/submissions`)
      .set('Authorization', `Bearer ${token}`);
    expect(dash.body.submissions).toHaveLength(0); // ...nothing was actually stored
  });

  it('deduplicates a retried submission with the same idempotency key', async () => {
    const app = getApp();
    const { token } = await registerTenant(app);
    const widget = await createWidget(app, token);
    const key = 'retry-key-123';

    const first = await request(app)
      .post('/api/public/submissions')
      .send({ widgetId: widget.id, website: '', data: { email: 'once@example.com' }, idempotencyKey: key });
    expect(first.status).toBe(201);

    const retry = await request(app)
      .post('/api/public/submissions')
      .send({ widgetId: widget.id, website: '', data: { email: 'once@example.com' }, idempotencyKey: key });
    expect(retry.status).toBe(200);
    expect(retry.body.deduplicated).toBe(true);
    expect(retry.body.id).toBe(first.body.id);

    const dash = await request(app)
      .get(`/api/dashboard/widgets/${widget.id}/submissions`)
      .set('Authorization', `Bearer ${token}`);
    expect(dash.body.submissions).toHaveLength(1); // only one row, despite two requests
  });

  it('rejects submissions for unknown widget ids with 404', async () => {
    const app = getApp();
    const res = await request(app)
      .post('/api/public/submissions')
      .send({ widgetId: 'does-not-exist', website: '', data: {} });
    expect(res.status).toBe(404);
  });
});
