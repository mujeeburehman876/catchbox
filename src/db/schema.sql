-- Tenants are widget-owner accounts (the "customer" using the platform)
CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Widgets belong to exactly one tenant. Every query touching this table
-- MUST filter by tenant_id at the repository layer -- that is what proves
-- tenant isolation, not a UI check.
CREATE TABLE IF NOT EXISTS widgets (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('signup_form', 'cta_popover', 'contact_form')),
  title TEXT NOT NULL,
  description TEXT,
  fields_json TEXT NOT NULL,           -- JSON array of {name, label, type, required}
  button_text TEXT NOT NULL DEFAULT 'Submit',
  display_options_json TEXT NOT NULL DEFAULT '{}',
  bundle_version INTEGER NOT NULL DEFAULT 1,  -- bump on breaking script change -> cache bust
  config_version INTEGER NOT NULL DEFAULT 1,  -- bump whenever config changes
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_widgets_tenant ON widgets(tenant_id);

-- Submissions are the public-facing writes. Denormalized tenant_id lets us
-- enforce isolation without a join on every dashboard query.
CREATE TABLE IF NOT EXISTS submissions (
  id TEXT PRIMARY KEY,
  widget_id TEXT NOT NULL REFERENCES widgets(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  idempotency_key TEXT,
  data_json TEXT NOT NULL,
  ip TEXT,
  country TEXT,
  city TEXT,
  geo_provider TEXT,               -- 'provider_a' | 'provider_b' | NULL (all failed)
  spam_flagged INTEGER NOT NULL DEFAULT 0,
  email_side_effect_status TEXT NOT NULL DEFAULT 'pending', -- pending|sent|failed
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_submissions_widget ON submissions(widget_id);
CREATE INDEX IF NOT EXISTS idx_submissions_tenant ON submissions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_submissions_created ON submissions(created_at);
-- Idempotent submissions: the same (widget, key) can only ever create one row.
CREATE UNIQUE INDEX IF NOT EXISTS idx_submissions_idempotency
  ON submissions(widget_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
