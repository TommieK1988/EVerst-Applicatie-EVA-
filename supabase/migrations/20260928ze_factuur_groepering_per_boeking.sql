-- Factuurregels: standaardindeling wordt 'Elke boeking apart'.
--
-- In het Factuurregels-venster wordt de prijs voortaan alleen per factuurregel gemaakt (rechts), en
-- regels samenvoegen gebeurt daar ook. Dan is één boeking per regel het logische vertrekpunt: je
-- voegt samen wat bij elkaar hoort, in plaats van een soort-indeling uit elkaar te moeten halen.
--
-- Ook bestaande posten gaan om. 'per_soort' stond er meestal niet door een bewuste keuze maar omdat
-- het de default was zodra er íets aan de post werd opgeslagen. Handmatige samenvoegingen
-- (groep_sleutel 'hand:…') blijven staan; eigen teksten of bedragen op de oude soort-regels
-- ('uur:…' / 'kost:…') worden niet meer gebruikt. Al gefactureerde boekingen worden niet
-- gegroepeerd, dus vergrendelde posten merken hier niets van.
--
-- Pas toepassen zodra de bijbehorende code op main staat.

alter table public.factuur_regelinstellingen
  alter column groepering set default 'per_boeking';

update public.factuur_regelinstellingen
   set groepering = 'per_boeking',
       updated_at = now()
 where groepering = 'per_soort';
