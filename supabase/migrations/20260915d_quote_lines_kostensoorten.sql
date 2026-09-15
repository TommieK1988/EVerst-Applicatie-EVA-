-- Begrotingsstaat: de kostensoort-uitsplitsing van de calculatie bevriezen op de
-- offerteregel.
--
-- De calculatie zelf leeft server-side alleen als JSONB-snapshot en blijft na het
-- maken van de offerte gewoon doorlopen. `kostprijs_pe` en `uren_pe` werden daarom
-- al bij de import bevroren; dit zijn dezelfde soort velden, zodat een
-- begrotingsstaat het beeld toont van het moment waarop de offerte ontstond.
--
-- `materieel_pe` volgt de naamgeving van de calculatie (componenttype `materieel`);
-- in de Word-samenvoeging heet die kolom `materiaal_*`.

alter table public.quote_lines
  add column if not exists kostengroep      text,
  add column if not exists is_verrekenbaar  boolean not null default false,
  add column if not exists arbeid_pe        numeric,
  add column if not exists materieel_pe     numeric,
  add column if not exists oa_pe            numeric;

comment on column public.quote_lines.kostengroep     is 'Kostengroep van de calculatieregel (bv. Bouwplaats) — groepeerlabel op de begrotingsstaat.';
comment on column public.quote_lines.is_verrekenbaar is 'VRR: verrekenbare post. Alleen dan heeft de verrekenprijs betekenis.';
comment on column public.quote_lines.arbeid_pe       is 'Arbeidskosten per eenheid, bevroren uit de calculatie.';
comment on column public.quote_lines.materieel_pe    is 'Materiaal-/materieelkosten per eenheid, bevroren uit de calculatie.';
comment on column public.quote_lines.oa_pe           is 'Onderaannemerskosten per eenheid, bevroren uit de calculatie.';
