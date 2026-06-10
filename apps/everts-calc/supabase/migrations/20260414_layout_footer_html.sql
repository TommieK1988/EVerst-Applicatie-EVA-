-- Voegt footer_html kolom toe aan quote_layouts
-- Bevat ruwe HTML die als vaste voettekst op elke pagina wordt getoond

ALTER TABLE quote_layouts
  ADD COLUMN IF NOT EXISTS footer_html text;
