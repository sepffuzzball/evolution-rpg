CREATE TABLE IF NOT EXISTS app_state (
  key text PRIMARY KEY,
  state jsonb NOT NULL,
  revision integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE app_state ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 0;
