-- =====================================================================
-- Wagenpark — RDW uitbreiding (trekgewicht, terugroepactie, catalogusprijs)
-- =====================================================================
alter table public.rdw_data
  add column if not exists trekgewicht_geremd     int,
  add column if not exists trekgewicht_ongeremd   int,
  add column if not exists catalogusprijs         numeric(10,2),
  add column if not exists terugroepactie_status  text,
  add column if not exists terugroepactie_open    boolean;

-- milieuclassificatie bestaat al; komt overeen met 'Emissieklasse' in UI
-- brandstof_omschrijving bestaat al
