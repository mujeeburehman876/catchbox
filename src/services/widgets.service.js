import { nanoid } from 'nanoid';
import { widgetsRepository } from '../repositories/widgets.repository.js';
import { HttpError } from '../middleware/errorHandler.js';

export const widgetsService = {
  create(tenantId, input) {
    return widgetsRepository.create({
      id: `wgt_${nanoid(12)}`,
      tenantId,
      type: input.type,
      title: input.title,
      description: input.description || null,
      fieldsJson: JSON.stringify(input.fields),
      buttonText: input.buttonText,
      displayOptionsJson: JSON.stringify(input.displayOptions || {}),
      bundleVersion: 1,
      configVersion: 1,
    });
  },

  list(tenantId) {
    return widgetsRepository.listForTenant(tenantId);
  },

  getOwned(tenantId, id) {
    const widget = widgetsRepository.findByIdForTenant(id, tenantId);
    if (!widget) throw new HttpError(404, 'not_found', 'Widget not found');
    return widget;
  },

  update(tenantId, id, patch) {
    const updated = widgetsRepository.updateForTenant(id, tenantId, patch);
    if (!updated) throw new HttpError(404, 'not_found', 'Widget not found');
    return updated;
  },

  remove(tenantId, id) {
    const deleted = widgetsRepository.deleteForTenant(id, tenantId);
    if (!deleted) throw new HttpError(404, 'not_found', 'Widget not found');
  },

  embedSnippet(baseUrl, widget) {
    return `<script src="${baseUrl}/widget.js?id=${widget.id}" async></script>`;
  },

  // Used by public routes only -- no tenant check, because a visitor has no tenant.
  getPublic(id) {
    const widget = widgetsRepository.findByIdPublic(id);
    if (!widget) throw new HttpError(404, 'not_found', 'Widget not found or inactive');
    return widget;
  },
};
