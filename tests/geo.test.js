import { describe, it, expect } from 'vitest';
import { enrichIp } from '../src/services/geo.service.js';

const workingProviderA = async () => ({ country: 'Canada', city: 'Toronto', provider: 'provider_a' });
const workingProviderB = async () => ({ country: 'Germany', city: 'Berlin', provider: 'provider_b' });
const deadProvider = async () => {
  throw new Error('simulated provider outage');
};

describe('geo enrichment fallback chain', () => {
  it('uses provider A when it succeeds', async () => {
    const result = await enrichIp('203.0.113.5', [workingProviderA, workingProviderB]);
    expect(result.provider).toBe('provider_a');
    expect(result.country).toBe('Canada');
  });

  it('falls back to provider B when provider A is down', async () => {
    const result = await enrichIp('203.0.113.5', [deadProvider, workingProviderB]);
    expect(result.provider).toBe('provider_b');
    expect(result.country).toBe('Germany');
  });

  it('degrades gracefully (submission-safe) when ALL providers are down', async () => {
    const result = await enrichIp('203.0.113.5', [deadProvider, deadProvider]);
    expect(result.provider).toBeNull();
    expect(result.country).toBeNull();
    expect(result.city).toBeNull();
    // Crucially: it resolves, it does not throw.
  });
});
