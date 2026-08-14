import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { getApp, registerTenant, createWidget } from './helpers.js';

describe('dashboard API', () => {
  it('returns stats reflecting stored submissions', async () => {
    const app = getApp();
    const { token } = await registerTenant(app);
    const widget = await createWidget(app, token);

    for (const email of ['a@example.com', 'b@example.com']) {
      await request(app)
        .post('/api/public/submissions')
        .send({ widgetId: widget.id, website: '', data: { email } });
    }

    const stats = await request(app)
      .get(`/api/dashboard/widgets/${widget.id}/stats`)
      .set('Authorization', `Bearer ${token}`);

    expect(stats.status).toBe(200);
    expect(stats.body.total).toBe(2);
  });

  it('overview aggregates across all of a tenant widgets', async () => {
    const app = getApp();
    const { token } = await registerTenant(app);
    await createWidget(app, token, { title: 'Widget 1' });
    await createWidget(app, token, { title: 'Widget 2' });

    const res = await request(app).get('/api/dashboard/overview').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.totalWidgets).toBe(2);
    expect(res.body.perWidget).toHaveLength(2);
  });

  it('does not allow a tenant to see another tenant submissions via dashboard', async () => {
    const app = getApp();
    const tenantA = await registerTenant(app, 'dash-a');
    const tenantB = await registerTenant(app, 'dash-b');
    const widgetA = await createWidget(app, tenantA.token);

    await request(app)
      .post('/api/public/submissions')
      .send({ widgetId: widgetA.id, website: '', data: { email: 'x@example.com' } });

    const res = await request(app)
      .get(`/api/dashboard/widgets/${widgetA.id}/submissions`)
      .set('Authorization', `Bearer ${tenantB.token}`);

    expect(res.status).toBe(404);
  });
});
