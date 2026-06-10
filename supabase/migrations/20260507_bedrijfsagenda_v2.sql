-- V2: Maandelijks herhaling weekdag + doelgroep koppeltabellen

ALTER TABLE public.bedrijfsagenda_items
  ADD COLUMN IF NOT EXISTS herhaling_maand_type text NOT NULL DEFAULT 'dag'
    CHECK (herhaling_maand_type IN ('dag', 'weekdag')),
  ADD COLUMN IF NOT EXISTS herhaling_maand_weekordinal smallint;

-- Doelgroep: afdelingen
CREATE TABLE IF NOT EXISTS public.bedrijfsagenda_doelgroep_afdelingen (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agenda_item_id uuid NOT NULL REFERENCES public.bedrijfsagenda_items(id) ON DELETE CASCADE,
  afdeling_naam  text NOT NULL,
  UNIQUE (agenda_item_id, afdeling_naam)
);
CREATE INDEX IF NOT EXISTS ba_doelgroep_afd_item_idx
  ON public.bedrijfsagenda_doelgroep_afdelingen(agenda_item_id);

-- Doelgroep: individuele medewerkers
CREATE TABLE IF NOT EXISTS public.bedrijfsagenda_doelgroep_medewerkers (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agenda_item_id uuid NOT NULL REFERENCES public.bedrijfsagenda_items(id) ON DELETE CASCADE,
  medewerker_id  uuid NOT NULL REFERENCES public.medewerkers(id) ON DELETE CASCADE,
  UNIQUE (agenda_item_id, medewerker_id)
);
CREATE INDEX IF NOT EXISTS ba_doelgroep_med_item_idx
  ON public.bedrijfsagenda_doelgroep_medewerkers(agenda_item_id);

-- RLS
ALTER TABLE public.bedrijfsagenda_doelgroep_afdelingen ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bedrijfsagenda_doelgroep_medewerkers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ba_doelgroep_afd_lezen"
  ON public.bedrijfsagenda_doelgroep_afdelingen FOR SELECT TO authenticated USING (true);
CREATE POLICY "ba_doelgroep_afd_schrijven"
  ON public.bedrijfsagenda_doelgroep_afdelingen FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "ba_doelgroep_med_lezen"
  ON public.bedrijfsagenda_doelgroep_medewerkers FOR SELECT TO authenticated USING (true);
CREATE POLICY "ba_doelgroep_med_schrijven"
  ON public.bedrijfsagenda_doelgroep_medewerkers FOR ALL TO authenticated USING (true) WITH CHECK (true);
