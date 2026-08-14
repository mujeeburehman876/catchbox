import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { widgetsService } from '../services/widgets.service.js';
import { submissionsRepository } from '../repositories/submissions.repository.js';

export const dashboardRouter = Router();
dashboardRouter.use(requireAuth);

dashboardRouter.get('/overview', (req, res) => {
  res.json(submissionsRepository.overviewForTenant(req.tenantId));
});

dashboardRouter.get('/widgets/:id/submissions', (req, res, next) => {
  try {
    widgetsService.getOwned(req.tenantId, req.params.id); // 404s + enforces ownership
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Number(req.query.offset) || 0;
    const submissions = submissionsRepository.listForWidget(req.params.id, req.tenantId, { limit, offset });
    res.json({ submissions });
  } catch (err) {
    next(err);
  }
});

dashboardRouter.get('/widgets/:id/stats', (req, res, next) => {
  try {
    widgetsService.getOwned(req.tenantId, req.params.id);
    res.json(submissionsRepository.statsForWidget(req.params.id, req.tenantId));
  } catch (err) {
    next(err);
  }
});
