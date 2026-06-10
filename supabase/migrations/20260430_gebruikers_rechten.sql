-- Gebruikersbeheer uitbreiding
-- Voegt gebruiker_type toe aan medewerkers, standaard_rechten aan afdelingen,
-- per-user rechten override, en Office 365 koppeling.

-- 1. Gebruiker type op medewerker
ALTER TABLE public.medewerkers
  ADD COLUMN IF NOT EXISTS gebruiker_type text NOT NULL DEFAULT 'geen'
    CHECK (gebruiker_type IN ('geen', 'app_gebruiker', 'platform_gebruiker'));

-- 2. Standaard rechten per afdeling (JSONB)
-- Structuur: { "medewerkers": "lezen"|"schrijven"|"beheren"|null, "planning": ..., ... }
ALTER TABLE public.medewerker_afdelingen
  ADD COLUMN IF NOT EXISTS standaard_rechten jsonb NOT NULL DEFAULT '{}';

-- 3. Per-user rechten override (JSONB) — wint altijd van afdeling-defaults
ALTER TABLE public.medewerkers
  ADD COLUMN IF NOT EXISTS rechten_override jsonb NOT NULL DEFAULT '{}';

-- 4. Office 365 koppeling (identificatie)
ALTER TABLE public.medewerkers
  ADD COLUMN IF NOT EXISTS o365_user_id   text,
  ADD COLUMN IF NOT EXISTS o365_email     text,
  ADD COLUMN IF NOT EXISTS o365_tenant_id text;

-- 5. OAuth tokens apart (gevoelig, eigen tabel)
CREATE TABLE IF NOT EXISTS public.medewerker_o365_tokens (
  medewerker_id    uuid PRIMARY KEY REFERENCES public.medewerkers(id) ON DELETE CASCADE,
  access_token     text NOT NULL,
  refresh_token    text,
  token_expires_at timestamptz,
  scopes           text[],
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
