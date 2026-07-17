-- Het item van vanochtend (20260717g) beschreef de streefdatum als een instelling
-- per sjabloon. Die keuze staat sinds 20260718 per taak, dus de tekst klopt niet meer.
--
-- Bijwerken i.p.v. een tweede item: voor de lezer is het dezelfde verbetering
-- (deadlines werken nu ook bij automatisch geactiveerde checklists), alleen de manier
-- waarop je het instelt is veranderd. Een los item erbij zou onze eigen koerswijziging
-- aankondigen — dat is ruis. aangemaakt_op blijft staan, zodat wie het al gezien heeft
-- geen nieuwe melding krijgt.

update public.changelog
   set titel = 'Deadlines koppelen aan de projectdatums',
       omschrijving =
         'Taken met een deadline "vóór de streefdatum" bleven zonder deadline wanneer een '
         'checklist automatisch werd geactiveerd — er was dan immers niemand die een '
         'streefdatum invulde. Je kiest nu per taak waar de deadline aan hangt: bijvoorbeeld '
         'drie dagen vóór de verwachte startdatum, of een week vóór de verwachte einddatum '
         'van het dossier. Binnen één checklist kan elke taak dus zijn eigen datum volgen. '
         'Schuift het project op, dan schuiven de deadlines mee.'
 where datum = '2026-07-17'
   and module = 'Taken'
   and titel = 'Streefdatum werkt nu ook bij automatische checklists';
