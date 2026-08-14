import { Router } from 'express';
import cors from 'cors';
import { widgetsService } from '../services/widgets.service.js';
import { submissionsService } from '../services/submissions.service.js';
import { submissionSchema } from '../validation/schemas.js';
import { setConfigCacheHeaders, setBundleCacheHeaders } from '../utils/cache.js';
import { generateWidgetBundle } from '../utils/bundle.js';
import { perIpLimiter, perWidgetLimiter } from '../middleware/rateLimiter.js';
import { HttpError } from '../middleware/errorHandler.js';

export const publicRouter = Router();

// Public surface: ANY origin may call this. That is the entire point of an
// embeddable widget -- we don't know the customer's site in advance, so we
// can't allowlist it. `origin: true` reflects the request's Origin header
// (rather than '*') so it also works for credentialed... though we don't
// use credentials on this surface, keeping cookies out of the public API
// entirely is itself part of the security posture.
const publicCors = cors({
  origin: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
  maxAge: 600,
});

publicRouter.use(publicCors);
// Explicit preflight handling for every route on this router.
publicRouter.options('*', publicCors);

publicRouter.get('/widgets/:id/config', (req, res, next) => {
  try {
    const widget = widgetsService.getPublic(req.params.id);
    setConfigCacheHeaders(res);
    res.json({
      id: widget.id,
      type: widget.type,
      title: widget.title,
      description: widget.description,
      fields: widget.fields,
      buttonText: widget.button_text,
      displayOptions: widget.displayOptions,
      configVersion: widget.config_version,
    });
  } catch (err) {
    next(err);
  }
});

publicRouter.get('/widget.js', (req, res, next) => {
  try {
    const id = req.query.id;
    if (!id) throw new HttpError(400, 'missing_id', 'widget.js requires ?id=<widgetId>');
    // Confirms the widget exists/active before serving; the bundle itself
    // is generic (id-agnostic) so it is still safe to cache long-lived.
    widgetsService.getPublic(id);

    const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
    setBundleCacheHeaders(res);
    res.type('application/javascript').send(generateWidgetBundle(baseUrl));
  } catch (err) {
    next(err);
  }
});

publicRouter.post(
  '/api/public/submissions',
  perIpLimiter,
  perWidgetLimiter,
  async (req, res, next) => {
    try {
      const widgetId = req.body?.widgetId;
      if (!widgetId || typeof widgetId !== 'string') {
        throw new HttpError(400, 'missing_widget_id', '"widgetId" is required');
      }

      const payload = submissionSchema.parse({
        website: req.body.website,
        data: req.body.data,
        idempotencyKey: req.body.idempotencyKey,
      });

      const ip = req.ip;
      const result = await submissionsService.submit({ widgetId, payload, ip });

      if (result.spamBlocked) {
        // Respond 202 so the bot sees "success" and gains no signal to
        // adapt against, while nothing real was persisted.
        return res.status(202).json({ status: 'accepted' });
      }

      res.status(result.deduplicated ? 200 : 201).json({
        id: result.submission.id,
        status: 'stored',
        deduplicated: result.deduplicated,
        enriched: Boolean(result.submission.geo_provider),
      });
    } catch (err) {
      next(err);
    }
  }
);
