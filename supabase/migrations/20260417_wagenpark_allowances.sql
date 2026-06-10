-- =====================================================================
-- Wagenpark — compliance_allowances (persistente uitzonderingen per bestuurder)
-- =====================================================================
-- Een allowance zegt: "regel X met categorie Y is altijd toegestaan voor
-- bestuurder Z". Toekomstige bevindingen die matchen worden automatisch als
-- 'geaccepteerd_uitzondering' gemarkeerd — kern van het zelflerende systeem.
--
-- Voorbeelden:
--   - Chris Glas: R1 categorie 'weekend' → weekendwerk toegestaan
--   - Chris Glas: R7 → ULU-markering weekend mag
--   - Alle bestuurders (ulu_user_id = NULL): R3 categorie 'bekende_klant' →
--     niet van toepassing, maar laat zien hoe global allowances werken.
--
-- Koppeling aan compliance_feedback blijft voor losstaande markeringen.
-- =====================================================================

create table if not exists public.compliance_allowances (
  id               uuid primary key default gen_random_uuid(),
  ulu_user_id      bigint,                -- NULL = voor iedereen
  regel_code       text not null,         -- bv. 'R1', 'R7', 'R2a', ...
  categorie        text,                  -- optioneel sub-filter (bv. 'weekend', 'avond')
  reden            text,                  -- toelichting van de gebruiker
  actief           boolean not null default true,
  aangemaakt_door  uuid references auth.users(id),
  aangemaakt_op    timestamptz not null default now(),
  ingetrokken_op   timestamptz,
  unique (ulu_user_id, regel_code, categorie)
);

create index if not exists compliance_allowances_user_idx
  on public.compliance_allowances (ulu_user_id, regel_code)
  where actief = true;
