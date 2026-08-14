import { describe, it, expect, afterEach } from 'vitest';
import { submissionsService } from '../src/services/submissions.service.js';
import { widgetsService } from '../src/services/widgets.service.js';
import { authService } from '../src/services/auth.service.js';

async function makeWidget() {
  const auth = await authService.register({
    email: `int-${Math.random().toString(36).slice(2)}@example.com`,
    password: 'password123',
  });
  return widgetsService.create(auth.tenant.id, {
    type: 'contact_form',
    title: 'Contact us',
    fields: [{ name: 'email', label: 'Email', type: 'email', required: true }],
    buttonText: 'Send',
    displayOptions: {},
  });
}

describe('submission service: enrichment integration', () => {
  it('stores a submission enriched by provider B when provider A fails', async () => {
    const widget = await makeWidget();
    const { submission } = await submissionsService.submit({
      widgetId: widget.id,
      payload: { website: '', data: { email: 'test@example.com' } },
      ip: '198.51.100.7',
      geoProviders: [
        async () => {
          throw new Error('provider A down');
        },
        async () => ({ country: 'Japan', city: 'Tokyo', provider: 'provider_b' }),
      ],
    });

    expect(submission.geo_provider).toBe('provider_b');
    expect(submission.country).toBe('Japan');
  });

  it('still stores the submission (without geo) when every provider fails', async () => {
    const widget = await makeWidget();
    const { submission } = await submissionsService.submit({
      widgetId: widget.id,
      payload: { website: '', data: { email: 'test2@example.com' } },
      ip: '198.51.100.8',
      geoProviders: [
        async () => {
          throw new Error('A down');
        },
        async () => {
          throw new Error('B down');
        },
      ],
    });

    expect(submission).toBeTruthy();
    expect(submission.geo_provider).toBeNull();
    expect(submission.country).toBeNull();
  });
});

describe('submission service: safe side effect', () => {
  afterEach(() => {
    delete process.env.FORCE_EMAIL_FAILURE;
  });

  it('still returns success and stores the row even when the email/webhook side effect throws', async () => {
    process.env.FORCE_EMAIL_FAILURE = 'true';
    const widget = await makeWidget();

    const { submission } = await submissionsService.submit({
      widgetId: widget.id,
      payload: { website: '', data: { email: 'sideeffect@example.com' } },
      ip: '198.51.100.9',
      geoProviders: [async () => ({ country: null, city: null, provider: null })],
    });

    expect(submission).toBeTruthy();
    expect(submission.email_side_effect_status).toBe('failed');
  });
});
