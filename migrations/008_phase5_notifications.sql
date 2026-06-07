-- Phase 5: LINE Bot + PWA notification infrastructure

BEGIN;

-- ============================================================
-- Notification channel ENUM and tables
-- ============================================================

CREATE TYPE notification_channel AS ENUM ('line', 'web_push', 'in_app');
CREATE TYPE notification_status  AS ENUM ('pending', 'sent', 'failed', 'skipped');
CREATE TYPE notification_event   AS ENUM (
  'low_stock',
  'backorder_created',
  'backorder_settled',
  'so_confirmed',
  'delivery_completed',
  'gr_completed',
  'ar_overdue',
  'ap_due_soon',
  'monthly_snapshot_ready'
);

-- User notification preferences
CREATE TABLE user_notification_prefs (
  id              BIGSERIAL PRIMARY KEY,
  user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel         notification_channel NOT NULL,
  event_type      notification_event   NOT NULL,
  is_enabled      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, channel, event_type)
);

CREATE TRIGGER trg_unp_updated_at
  BEFORE UPDATE ON user_notification_prefs
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

-- LINE subscription (one per user)
CREATE TABLE line_subscriptions (
  id              BIGSERIAL PRIMARY KEY,
  user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  line_user_id    VARCHAR(100) NOT NULL UNIQUE,
  display_name    VARCHAR(200),
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  linked_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_lsub_updated_at
  BEFORE UPDATE ON line_subscriptions
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

-- Web push subscriptions (multiple per user, one per device)
CREATE TABLE web_push_subscriptions (
  id              BIGSERIAL PRIMARY KEY,
  user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint        TEXT NOT NULL UNIQUE,
  p256dh_key      TEXT NOT NULL,
  auth_key        TEXT NOT NULL,
  user_agent      TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at    TIMESTAMPTZ
);

CREATE INDEX idx_wps_user ON web_push_subscriptions(user_id);

-- Notification log (all outgoing messages)
CREATE TABLE notification_logs (
  id              BIGSERIAL PRIMARY KEY,
  user_id         BIGINT REFERENCES users(id),
  channel         notification_channel NOT NULL,
  event_type      notification_event   NOT NULL,
  status          notification_status  NOT NULL DEFAULT 'pending',
  title           TEXT,
  body            TEXT NOT NULL,
  payload         JSONB,
  error_message   TEXT,
  sent_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_nl_user    ON notification_logs(user_id);
CREATE INDEX idx_nl_event   ON notification_logs(event_type);
CREATE INDEX idx_nl_status  ON notification_logs(status);
CREATE INDEX idx_nl_created ON notification_logs(created_at);

-- ============================================================
-- Default notification preferences for existing users
-- ============================================================

INSERT INTO user_notification_prefs (user_id, channel, event_type)
SELECT u.id, 'in_app'::notification_channel, e.event_type::notification_event
FROM users u
CROSS JOIN (VALUES
  ('low_stock'), ('backorder_created'), ('backorder_settled'),
  ('so_confirmed'), ('delivery_completed'), ('gr_completed'),
  ('ar_overdue'), ('ap_due_soon'), ('monthly_snapshot_ready')
) AS e(event_type)
WHERE u.is_active = TRUE
ON CONFLICT DO NOTHING;

COMMIT;
