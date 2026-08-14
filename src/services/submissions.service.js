import { nanoid } from 'nanoid';
import { submissionsRepository } from '../repositories/submissions.repository.js';
import { widgetsService } from './widgets.service.js';
import { enrichIp } from './geo.service.js';
import { sendConfirmation } from './email.service.js';
import { HttpError } from '../middleware/errorHandler.js';

/**
 * Validate the submitted `data` against the widget's own field definitions
 * (required fields present, no unknown extra keys smuggled in).
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateFieldValue(field, value) {
  switch (field.type) {
    case 'checkbox':
      if (typeof value !== 'boolean') {
        throw new HttpError(400, 'invalid_field_type', `Field "${field.name}" must be a boolean`);
      }
      return;
    case 'email':
      if (typeof value !== 'string' || !EMAIL_RE.test(value)) {
        throw new HttpError(400, 'invalid_field_type', `Field "${field.name}" must be a valid email address`);
      }
      return;
    case 'text':
    case 'tel':
    case 'textarea':
    default:
      if (typeof value !== 'string') {
        throw new HttpError(400, 'invalid_field_type', `Field "${field.name}" must be a string`);
      }
      return;
  }
}

function validateAgainstWidgetFields(widget, data) {
  const allowedNames = new Set(widget.fields.map((f) => f.name));
  for (const key of Object.keys(data)) {
    if (!allowedNames.has(key)) {
      throw new HttpError(400, 'unknown_field', `Field "${key}" is not defined on this widget`);
    }
  }
  for (const field of widget.fields) {
    const value = data[field.name];
    const isMissing = value === undefined || value === '';

    if (field.required && isMissing) {
      throw new HttpError(400, 'missing_field', `Field "${field.name}" is required`);
    }
    if (!isMissing) {
      validateFieldValue(field, value);
    }
  }
}

export const submissionsService = {
  /**
   * @param {object} opts
   * @param {string} opts.widgetId
   * @param {object} opts.payload - already shape-validated by zod (website, data, idempotencyKey)
   * @param {string} opts.ip
   * @param {Array<Function>} [opts.geoProviders] - injectable for tests
   */
  async submit({ widgetId, payload, ip, geoProviders }) {
    const widget = widgetsService.getPublic(widgetId);

    // --- Idempotency: a retried request with the same key returns the
    // original result instead of creating a duplicate row. ---
    if (payload.idempotencyKey) {
      const existing = submissionsRepository.findByIdempotencyKey(widgetId, payload.idempotencyKey);
      if (existing) return { submission: existing, deduplicated: true };
    }

    // --- Spam control: honeypot. Real visitors never see/fill this field. ---
    const isSpam = Boolean(payload.website && payload.website.trim().length > 0);

    if (isSpam) {
      // Per the brief: "silently dropped or rejected." We accept the request
      // (so the bot gets no useful signal) but never persist real data for it.
      return {
        submission: null,
        spamBlocked: true,
      };
    }

    // --- Boundary validation against this widget's own schema. ---
    validateAgainstWidgetFields(widget, payload.data);

    // --- Enrichment with fallback chain. Never throws; degrades to nulls. ---
    const geo = await enrichIp(ip, geoProviders);

    const submission = submissionsRepository.create({
      id: `sub_${nanoid(14)}`,
      widgetId: widget.id,
      tenantId: widget.tenant_id,
      idempotencyKey: payload.idempotencyKey || null,
      dataJson: JSON.stringify(payload.data),
      ip: ip || null,
      country: geo.country,
      city: geo.city,
      geoProvider: geo.provider,
      spamFlagged: 0,
      emailSideEffectStatus: 'pending',
    });

    // --- Safe side effect: failure here must NOT affect the response. ---
    try {
      await sendConfirmation(submission, widget);
      submissionsRepository.updateEmailStatus(submission.id, 'sent');
    } catch (err) {
      console.warn(`[email] side effect failed for submission ${submission.id}:`, err.message);
      submissionsRepository.updateEmailStatus(submission.id, 'failed');
    }

    return { submission: submissionsRepository.findById(submission.id), deduplicated: false };
  },
};
