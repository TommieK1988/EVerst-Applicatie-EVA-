-- Migration v4: schilderbehandeling per offerteregel (voor behandelingsblad)

-- quote_lines: volledige schilderbehandeling-tekst (uit calculatieregel)
ALTER TABLE quote_lines
  ADD COLUMN IF NOT EXISTS schilderbehandeling text;
