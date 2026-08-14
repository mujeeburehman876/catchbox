import { db } from '../db/index.js';

function rowToSubmission(row) {
  if (!row) return null;
  return { ...row, data: JSON.parse(row.data_json), spamFlagged: !!row.spam_flagged };
}

export const submissionsRepository = {
  // Idempotent insert: if (widgetId, idempotencyKey) already exists, return the
  // existing row instead of inserting a duplicate. This is how a retried
  // network request from a flaky mobile visitor never double-submits.
  findByIdempotencyKey(widgetId, idempotencyKey) {
    if (!idempotencyKey) return null;
    const row = db
      .prepare(`SELECT * FROM submissions WHERE widget_id = ? AND idempotency_key = ?`)
      .get(widgetId, idempotencyKey);
    return rowToSubmission(row);
  },

  create(submission) {
    db.prepare(
      `INSERT INTO submissions
        (id, widget_id, tenant_id, idempotency_key, data_json, ip, country, city, geo_provider, spam_flagged, email_side_effect_status)
       VALUES (@id, @widgetId, @tenantId, @idempotencyKey, @dataJson, @ip, @country, @city, @geoProvider, @spamFlagged, @emailSideEffectStatus)`
    ).run(submission);
    return this.findById(submission.id);
  },

  findById(id) {
    return rowToSubmission(db.prepare(`SELECT * FROM submissions WHERE id = ?`).get(id));
  },

  updateEmailStatus(id, status) {
    db.prepare(`UPDATE submissions SET email_side_effect_status = ? WHERE id = ?`).run(status, id);
  },

  listForWidget(widgetId, tenantId, { limit = 50, offset = 0 } = {}) {
    const rows = db
      .prepare(
        `SELECT * FROM submissions
         WHERE widget_id = ? AND tenant_id = ?
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?`
      )
      .all(widgetId, tenantId, limit, offset);
    return rows.map(rowToSubmission);
  },

  statsForWidget(widgetId, tenantId) {
    const total = db
      .prepare(`SELECT COUNT(*) AS n FROM submissions WHERE widget_id = ? AND tenant_id = ?`)
      .get(widgetId, tenantId).n;

    const byDay = db
      .prepare(
        `SELECT date(created_at) AS day, COUNT(*) AS n
         FROM submissions WHERE widget_id = ? AND tenant_id = ?
         GROUP BY date(created_at) ORDER BY day DESC LIMIT 30`
      )
      .all(widgetId, tenantId);

    const byCountry = db
      .prepare(
        `SELECT COALESCE(country, 'unknown') AS country, COUNT(*) AS n
         FROM submissions WHERE widget_id = ? AND tenant_id = ?
         GROUP BY country ORDER BY n DESC`
      )
      .all(widgetId, tenantId);

    const spam = db
      .prepare(
        `SELECT COUNT(*) AS n FROM submissions
         WHERE widget_id = ? AND tenant_id = ? AND spam_flagged = 1`
      )
      .get(widgetId, tenantId).n;

    return { total, byDay, byCountry, spamBlocked: spam };
  },

  overviewForTenant(tenantId) {
    const totalSubmissions = db
      .prepare(`SELECT COUNT(*) AS n FROM submissions WHERE tenant_id = ?`)
      .get(tenantId).n;
    const totalWidgets = db
      .prepare(`SELECT COUNT(*) AS n FROM widgets WHERE tenant_id = ?`)
      .get(tenantId).n;
    const perWidget = db
      .prepare(
        `SELECT w.id AS widgetId, w.title, COUNT(s.id) AS submissions
         FROM widgets w LEFT JOIN submissions s ON s.widget_id = w.id
         WHERE w.tenant_id = ?
         GROUP BY w.id ORDER BY submissions DESC`
      )
      .all(tenantId);
    return { totalSubmissions, totalWidgets, perWidget };
  },
};
