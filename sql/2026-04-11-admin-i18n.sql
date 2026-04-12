-- Persistent locale maps for admin-edited fields (RU scalar columns remain source of truth for empty derived locales).

ALTER TABLE sites
  ADD COLUMN IF NOT EXISTS name_i18n jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS address_i18n jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS notes_i18n jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS full_name_i18n jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS notes_i18n jsonb NOT NULL DEFAULT '{}'::jsonb;
