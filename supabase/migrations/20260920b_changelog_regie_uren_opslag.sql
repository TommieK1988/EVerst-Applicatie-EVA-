-- Wat is nieuw: regie-uren rekenen met opslag in plaats van tegen kostprijs.
insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-09-20','opgelost','Financieel','Regie-uren rekenen nu met opslag',
   'Een geboekt uur kwam in de nacalculatie tegen kostprijs op de factuur, zonder opslag, terwijl materiaal die opslag wel kreeg. Uren volgen nu dezelfde regel: kostprijs plus de opslag van de post, en anders de standaardopslag van het bedrijf. Is er voor die klant een uurtarief afgesproken, dan gaat dat voor. Heb je een regel zelf een prijs of tarief gegeven, dan blijft die staan. Let op: hierdoor stijgen openstaande regiebedragen. Wat al gefactureerd is verandert niet.');
