-- Migration v3: stelposten, opties en sectie hiërarchie

-- quote_sections: hiërarchie + optioneel
ALTER TABLE quote_sections
  ADD COLUMN IF NOT EXISTS is_optioneel boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS niveau smallint NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS nummer text;

-- quote_lines: stelpost markering
ALTER TABLE quote_lines
  ADD COLUMN IF NOT EXISTS is_stelpost boolean NOT NULL DEFAULT false;

-- quotes: stelposten toggle + aparte subtotalen
ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS stelposten_in_totaal boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS stelposten_subtotaal numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS opties_subtotaal numeric(12,2) NOT NULL DEFAULT 0;
