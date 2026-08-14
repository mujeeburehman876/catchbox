import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { widgetsService } from '../services/widgets.service.js';
import { createWidgetSchema, updateWidgetSchema } from '../validation/schemas.js';

export const widgetsRouter = Router();
widgetsRouter.use(requireAuth);

widgetsRouter.post('/', (req, res, next) => {
  try {
    const input = createWidgetSchema.parse(req.body);
    const widget = widgetsService.create(req.tenantId, input);
    res.status(201).json(widget);
  } catch (err) {
    next(err);
  }
});

widgetsRouter.get('/', (req, res) => {
  res.json(widgetsService.list(req.tenantId));
});

widgetsRouter.get('/:id', (req, res, next) => {
  try {
    res.json(widgetsService.getOwned(req.tenantId, req.params.id));
  } catch (err) {
    next(err);
  }
});

widgetsRouter.patch('/:id', (req, res, next) => {
  try {
    const input = updateWidgetSchema.parse(req.body);
    const widget = widgetsService.update(req.tenantId, req.params.id, input);
    res.json(widget);
  } catch (err) {
    next(err);
  }
});

widgetsRouter.delete('/:id', (req, res, next) => {
  try {
    widgetsService.remove(req.tenantId, req.params.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

widgetsRouter.get('/:id/embed-snippet', (req, res, next) => {
  try {
    const widget = widgetsService.getOwned(req.tenantId, req.params.id);
    const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
    res.json({ snippet: widgetsService.embedSnippet(baseUrl, widget) });
  } catch (err) {
    next(err);
  }
});
