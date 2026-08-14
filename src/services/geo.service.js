import fetch from 'node-fetch';

const TIMEOUT_MS = Number(process.env.GEO_TIMEOUT_MS || 2500);

async function withTimeout(promise, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await promise(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

// Provider A: ip-api.com - free, no key, 45 req/min.
async function providerA(ip) {
  if (process.env.FORCE_GEO_PROVIDER_A_DOWN === 'true') {
    throw new Error('provider_a forced down');
  }
  const url = `${process.env.GEO_PROVIDER_A_URL || 'http://ip-api.com/json'}/${ip}?fields=status,country,city`;
  const res = await withTimeout((signal) => fetch(url, { signal }), TIMEOUT_MS);
  if (!res.ok) throw new Error(`provider_a http ${res.status}`);
  const json = await res.json();
  if (json.status !== 'success') throw new Error('provider_a lookup failed');
  return { country: json.country, city: json.city, provider: 'provider_a' };
}

// Provider B: ipapi.co - free tier, no key, fallback if A fails.
async function providerB(ip) {
  if (process.env.FORCE_GEO_PROVIDER_B_DOWN === 'true') {
    throw new Error('provider_b forced down');
  }
  const url = `${process.env.GEO_PROVIDER_B_URL || 'https://ipapi.co'}/${ip}/json/`;
  const res = await withTimeout((signal) => fetch(url, { signal }), TIMEOUT_MS);
  if (!res.ok) throw new Error(`provider_b http ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error('provider_b lookup failed');
  return { country: json.country_name, city: json.city, provider: 'provider_b' };
}

export const defaultProviders = [providerA, providerB];

/**
 * Try each provider in order. The FIRST one that resolves wins.
 * If every provider throws, we degrade gracefully: return nulls rather
 * than propagate an error, because a missing geo tag must never block
 * a submission from being stored.
 *
 * `providers` is injectable so tests can supply deterministic mocks
 * instead of hitting the real free APIs.
 */
export async function enrichIp(ip, providers = defaultProviders) {
  // Skip lookups for local/loopback addresses (dev + tests) -- they'd fail anyway.
  if (!ip || ip === '127.0.0.1' || ip === '::1' || ip.startsWith('::ffff:127.')) {
    // Still respect provider overrides so tests can exercise the chain
    // even with a loopback IP.
    if (providers !== defaultProviders) {
      // fall through to real chain logic below using the loopback IP
    } else {
      return { country: null, city: null, provider: null };
    }
  }

  for (const provider of providers) {
    try {
      const result = await provider(ip);
      return result;
    } catch {
      continue; // try the next provider in the chain
    }
  }

  // All providers failed (or are forced down) -- degrade, don't fail.
  return { country: null, city: null, provider: null };
}
