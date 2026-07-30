-- Definitieve indeling van de "Soort"-keuze. Voor de categorie Houtrot de zeven soorten
-- die Everts zelf hanteert; de overige categorieën houden hun eigen groep, zodat de vlakke
-- lijst in de registratie op elf regels uitkomt (was 24).

-- ── Houtrot: 7 soorten ───────────────────────────────────────────────────────
update public.paint_items set groep = case

  -- Herstel met kunsthars waarbij het hout blijft zitten
  when item_code in (
    'HR-P2','HR-P3','HR-P10',                                        -- verbindingen afdichten
    'HR-P4-025','HR-P4-050','HR-P4-100','HR-P4-200','HR-P4-300',     -- scheuren
    'HR-P5',                                                         -- noesten en kwasten
    'HR-C1-05','HR-C1-10','HR-C1-15'                                 -- houtaantasting met pasta
  ) then 'Epoxy reparaties'

  when item_code like 'HR-C2-%' then 'Laminaat'
  when item_code like 'HR-C4-%' then 'Deelvervanging'
  when item_code like 'HR-OS-%' then 'Omtrekspeling'

  -- Hele onderdelen eruit en nieuw erin
  when item_code in (
    'HR-DEUR-STAP','HR-DEUR-VLAK','HR-RAAM-DRAAI','HR-RAAM-KLEP',
    'VAC-HH051','VAC-HH054-a','VAC-HH054-b','VAC-HH061-a','VAC-HH061-b',
    'VAC-HH062-a','VAC-HH062-b','VAC-HH062-c','VAC-HH062-d','VAC-HH062-e','VAC-HH063',
    'VAC-HH111','VAC-HH112',                                         -- weldorpel
    'VAC-HH171','VAC-HH172-a','VAC-HH172-b','VAC-HH173','VAC-HH174',
    'VAC-HH181-a','VAC-HH181-b'                                      -- gevelbekleding
  ) then 'Onderdelen vervangen'

  when item_code in ('HR-BK','HR-NL','HR-GL','HR-SV') then 'Latten en kitten'

  -- De- en hermonteren, meerprijzen en klein voorbereidend werk
  when item_code in (
    'HR-DEMO','VAC-HH082','VAC-HH001','VAC-HH002','VAC-HHMPHD','VAC-HHMPRW'
  ) then 'Overige'

  else groep
end
where onderdeel = 'Houtrot' and groep is not null;

-- ── Beglazing: 2 groepen, duidelijk te onderscheiden van "Latten en kitten" ───
update public.paint_items
   set groep = 'Kit, profielen en afdekkers'
 where onderdeel = 'Beglazing'
   and item_code in ('VAC-GH001','VAC-GH071-a','VAC-GH071-b','VAC-GH022',
                     'VAC-VH010','VAC-VH011','VAC-VH031','VAC-VH032','VAC-GHMP');
