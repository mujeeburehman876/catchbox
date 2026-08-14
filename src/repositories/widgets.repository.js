import { db } from '../db/index.js';

function rowToWidget(row) {
  if (!row) return null;
  return {
    ...row,
    fields: JSON.parse(row.fields_json),
    displayOptions: JSON.parse(row.display_options_json),
    isActive: !!row.is_active,
  };
}

export const widgetsRepository = {
  create(widget) {
    db.prepare(
      `INSERT INTO widgets
        (id, tenant_id, type, title, description, fields_json, button_text, display_options_json, bundle_version, config_version)
       VALUES (@id, @tenantId, @type, @title, @description, @fieldsJson, @buttonText, @displayOptionsJson, @bundleVersion, @configVersion)`
    ).run(widget);
    return this.findByIdForTenant(widget.id, widget.tenantId);
  },

  // Tenant-isolated read: a widget can only ever be fetched by its owner here.
  findByIdForTenant(id, tenantId) {
    const row = db
      .prepare(`SELECT * FROM widgets WHERE id = ? AND tenant_id = ?`)
      .get(id, tenantId);
    return rowToWidget(row);
  },

  listForTenant(tenantId) {
    const rows = db
      .prepare(`SELECT * FROM widgets WHERE tenant_id = ? ORDER BY created_at DESC`)
      .all(tenantId);
    return rows.map(rowToWidget);
  },

  // Used ONLY by public, unauthenticated routes (config delivery, submissions).
  // Deliberately does not take a tenantId -- a visitor has none -- but also
  // deliberately returns nothing else tenant-scoped beyond the widget's own row.
  findByIdPublic(id) {
    const row = db.prepare(`SELECT * FROM widgets WHERE id = ? AND is_active = 1`).get(id);
    return rowToWidget(row);
  },

  updateForTenant(id, tenantId, patch) {
    const existing = this.findByIdForTenant(id, tenantId);
    if (!existing) return null;

    const merged = {
      type: patch.type ?? existing.type,
      title: patch.title ?? existing.title,
      description: patch.description ?? existing.description,
      fieldsJson: patch.fields ? JSON.stringify(patch.fields) : existing.fields_json,
      buttonText: patch.buttonText ?? existing.button_text,
      displayOptionsJson: patch.displayOptions
        ? JSON.stringify(patch.displayOptions)
        : existing.display_options_json,
      // Config changed -> bust the short-lived config cache immediately.
      configVersion: existing.config_version + 1,
      // Only bump the bundle (long-cached JS) version if the caller asked for it explicitly.
      bundleVersion: patch.bumpBundleVersion ? existing.bundle_version + 1 : existing.bundle_version,
    };

    db.prepare(
      `UPDATE widgets SET
         type = @type,
         title = @title,
         description = @description,
         fields_json = @fieldsJson,
         button_text = @buttonText,
         display_options_json = @displayOptionsJson,
         config_version = @configVersion,
         bundle_version = @bundleVersion,
         updated_at = datetime('now')
       WHERE id = @id AND tenant_id = @tenantId`
    ).run({ ...merged, id, tenantId });

    return this.findByIdForTenant(id, tenantId);
  },

  deleteForTenant(id, tenantId) {
    const result = db
      .prepare(`DELETE FROM widgets WHERE id = ? AND tenant_id = ?`)
      .run(id, tenantId);
    return result.changes > 0;
  },
};
