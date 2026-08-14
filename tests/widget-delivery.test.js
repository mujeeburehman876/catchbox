import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { getApp, registerTenant, createWidget } from './helpers.js';

describe('public widget delivery', () => {
  it('serves widget config publicly with short-lived cache headers', async () => {
    const app = getApp();
    const { token } = await registerTenant(app);
    const widget = await createWidget(app, token);

    const res = await request(app).get(`/widgets/${widget.id}/config`);
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toMatch(/max-age=60/);
    expect(res.body.title).toBe('Newsletter Signup');
    expect(res.body.fields).toHaveLength(1);
  });

  it('404s config for an unknown widget id', async () => {
    const app = getApp();
    const res = await request(app).get('/widgets/nonexistent/config');
    expect(res.status).toBe(404);
  });

  it('serves the versioned widget.js bundle with a long, immutable cache header', async () => {
    const app = getApp();
    const { token } = await registerTenant(app);
    const widget = await createWidget(app, token);

    const res = await request(app).get(`/widget.js?id=${widget.id}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/javascript/);
    expect(res.headers['cache-control']).toMatch(/immutable/);
    expect(res.headers['cache-control']).toMatch(/max-age=31536000/);
    expect(res.text).toContain('/api/public/submissions');
  });

  it('renders correctly for a cross-origin request (CORS headers present)', async () => {
    const app = getApp();
    const { token } = await registerTenant(app);
    const widget = await createWidget(app, token);

    const res = await request(app)
      .get(`/widgets/${widget.id}/config`)
      .set('Origin', 'http://a-totally-different-origin.example:5500');
    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('http://a-totally-different-origin.example:5500');
  });
});
