import request from 'supertest';
import { createApp } from '../src/app.js';

export function getApp() {
  return createApp();
}

export async function registerTenant(app, emailPrefix = 'tenant') {
  const email = `${emailPrefix}-${Math.random().toString(36).slice(2)}@example.com`;
  const res = await request(app)
    .post('/api/auth/register')
    .send({ email, password: 'super-secret-123' });
  return { token: res.body.token, tenant: res.body.tenant, email };
}

export async function createWidget(app, token, overrides = {}) {
  const res = await request(app)
    .post('/api/widgets')
    .set('Authorization', `Bearer ${token}`)
    .send({
      type: 'signup_form',
      title: 'Newsletter Signup',
      fields: [{ name: 'email', label: 'Email', type: 'email', required: true }],
      buttonText: 'Join',
      ...overrides,
    });
  return res.body;
}
