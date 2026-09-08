-- Give button themes the same global/per-app scoping the app-theme and
-- typography settings already use. Existing rows are all global by
-- definition, so the new column defaults them there and the primary key
-- widens from (slot) to (scope, slot).
ALTER TABLE "adminlog_button_theme_settings"
  ADD COLUMN "scope" TEXT NOT NULL DEFAULT 'global';

ALTER TABLE "adminlog_button_theme_settings"
  DROP CONSTRAINT "adminlog_button_theme_settings_pkey";

ALTER TABLE "adminlog_button_theme_settings"
  ADD CONSTRAINT "adminlog_button_theme_settings_pkey" PRIMARY KEY ("scope", "slot");
