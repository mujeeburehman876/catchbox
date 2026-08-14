import rateLimit from 'express-rate-limit';

const windowMs = Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000);
const maxPerIp = Number(process.env.RATE_LIMIT_MAX_PER_IP || 20);
const maxPerWidget = Number(process.env.RATE_LIMIT_MAX_PER_WIDGET || 60);

// Layer 1: per-IP. Stops a single flooding client cold.
export const perIpLimiter = rateLimit({
  windowMs,
  max: maxPerIp,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip,
  handler: (req, res) => {
    res.status(429).json({
      error: 'rate_limited',
      message: 'Too many requests from this address. Try again shortly.',
    });
  },
});

// Layer 2: per-widget. Stops a distributed flood (many IPs, one widget)
// from drowning a single customer's dashboard, while OTHER widgets on the
// same server keep serving normally -- this is what "the API keeps serving
// legitimate traffic" means in practice.
const widgetBuckets = new Map(); // widgetId -> { count, windowStart }

export function perWidgetLimiter(req, res, next) {
  const widgetId = req.body?.widgetId || req.params?.id || req.query?.id;
  if (!widgetId) return next();

  const now = Date.now();
  const bucket = widgetBuckets.get(widgetId);

  if (!bucket || now - bucket.windowStart > windowMs) {
    widgetBuckets.set(widgetId, { count: 1, windowStart: now });
    return next();
  }

  if (bucket.count >= maxPerWidget) {
    return res.status(429).json({
      error: 'rate_limited',
      message: 'This widget is receiving too many submissions right now. Try again shortly.',
    });
  }

  bucket.count += 1;
  next();
}

// Test/demo helper to reset in-memory state between test files.
export function _resetWidgetBuckets() {
  widgetBuckets.clear();
}
