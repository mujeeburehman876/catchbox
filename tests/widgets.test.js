import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { getApp, registerTenant, createWidget } from './helpers.js';

describe('auth', () => {
  it('registers a new tenant and returns a token', async () => {
    const app = getApp();
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'a@example.com', password: 'password123' });
    expect(res.status).toBe(201);
    expect(res.body.token).toBeTruthy();
  });

  it('rejects login with wrong password', async () => {
    const app = getApp();
    await request(app).post('/api/auth/register').send({ email: 'b@example.com', password: 'password123' });
    const res = await request(app).post('/api/auth/login').send({ email: 'b@example.com', password: 'wrong' });
    expect(res.status).toBe(401);
  });

  it('rejects malformed registration payload with 400, not 500', async () => {
    const app = getApp();
    const res = await request(app).post('/api/auth/register').send({ email: 'not-an-email', password: '123' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('validation_error');
  });
});

describe('widget management + tenant isolation', () => {
  it('rejects unauthenticated widget creation', async () => {
    const app = getApp();
    const res = await request(app).post('/api/widgets').send({ title: 'x' });
    expect(res.status).toBe(401);
  });

  it('creates, reads, updates and deletes a widget (full CRUD)', async () => {
    const app = getApp();
    const { token } = await registerTenant(app);
    const widget = await createWidget(app, token);
    expect(widget.id).toMatch(/^wgt_/);

    const getRes = await request(app).get(`/api/widgets/${widget.id}`).set('Authorization', `Bearer ${token}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.title).toBe('Newsletter Signup');

    const patchRes = await request(app)
      .patch(`/api/widgets/${widget.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Updated Title' });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.title).toBe('Updated Title');

    const delRes = await request(app).delete(`/api/widgets/${widget.id}`).set('Authorization', `Bearer ${token}`);
    expect(delRes.status).toBe(204);

    const afterDelete = await request(app).get(`/api/widgets/${widget.id}`).set('Authorization', `Bearer ${token}`);
    expect(afterDelete.status).toBe(404);
  });

  it('proves tenant A cannot read or modify tenant B widgets', async () => {
    const app = getApp();
    const tenantA = await registerTenant(app, 'a-tenant');
    const tenantB = await registerTenant(app, 'b-tenant');

    const widgetA = await createWidget(app, tenantA.token, { title: "A's widget" });

    // Tenant B tries to read tenant A's widget by id.
    const readAttempt = await request(app)
      .get(`/api/widgets/${widgetA.id}`)
      .set('Authorization', `Bearer ${tenantB.token}`);
    expect(readAttempt.status).toBe(404); // not found, not "forbidden" -- no existence leak

    // Tenant B tries to delete tenant A's widget.
    const deleteAttempt = await request(app)
      .delete(`/api/widgets/${widgetA.id}`)
      .set('Authorization', `Bearer ${tenantB.token}`);
    expect(deleteAttempt.status).toBe(404);

    // Tenant A's widget is untouched.
    const stillThere = await request(app)
      .get(`/api/widgets/${widgetA.id}`)
      .set('Authorization', `Bearer ${tenantA.token}`);
    expect(stillThere.status).toBe(200);

    // Tenant B's widget list never includes tenant A's widget.
    const listB = await request(app).get('/api/widgets').set('Authorization', `Bearer ${tenantB.token}`);
    expect(listB.body.find((w) => w.id === widgetA.id)).toBeUndefined();
  });

  it('generates a working embed snippet', async () => {
    const app = getApp();
    const { token } = await registerTenant(app);
    const widget = await createWidget(app, token);
    const res = await request(app)
      .get(`/api/widgets/${widget.id}/embed-snippet`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.snippet).toContain(`widget.js?id=${widget.id}`);
    expect(res.body.snippet).toContain('<script');
  });
});
