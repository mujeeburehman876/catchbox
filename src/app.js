import express from 'express';
import cors from 'cors';
import 'dotenv/config';

import { authRouter } from './routes/auth.routes.js';
import { widgetsRouter } from './routes/widgets.routes.js';
import { publicRouter } from './routes/public.routes.js';
import { dashboardRouter } from './routes/dashboard.routes.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

export function createApp() {
  const app = express();

  app.set('trust proxy', true); // correct req.ip behind a proxy/load balancer

  // Public routes (config, widget.js, submissions) need CORS + parsing
  // BEFORE any admin-only restriction, and get their own small body limit.
  app.use(express.json({ limit: '20kb' }));

  app.get('/healthz', (req, res) => res.json({ status: 'ok' }));

  // Admin API: authenticated, same-origin by default (no wildcard CORS).
  const adminCors = cors({ origin: process.env.ADMIN_ALLOWED_ORIGIN || true });
  app.use('/api/auth', adminCors, authRouter);
  app.use('/api/widgets', adminCors, widgetsRouter);
  app.use('/api/dashboard', adminCors, dashboardRouter);

  // Public-facing surface: widget config/script delivery + submissions.
  // publicRouter applies its own permissive CORS internally.
  app.use('/', publicRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
