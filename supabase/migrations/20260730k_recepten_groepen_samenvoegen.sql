-- De "Soort"-keuze in de houtrotregistratie is plat: hij toont élke `groep` uit paint_items,
-- ongeacht de categorie. Na de VAC-import stonden er 24 groepen in die lijst. Hieronder
-- teruggebracht tot 9, zonder dat er een recept verdwijnt — de variantnaam onder de groep
-- zegt al om welk soort werk het gaat.

update public.paint_items set groep = case

  -- Alles wat met kunsthars/epoxy hersteld wordt en het hout laat zitten
  when item_code in (
    'HR-P2','HR-P3','HR-P10',                                        -- verbindingen afdichten
    'HR-P4-025','HR-P4-050','HR-P4-100','HR-P4-200','HR-P4-300',     -- scheuren
    'HR-P5',                                                         -- noesten en kwasten
    'HR-C1-05','HR-C1-10','HR-C1-15'                                 -- houtaantasting
  ) then 'Epoxyherstel'

  -- Aangetast hout wegnemen en aanhelen of vervangen
  when item_code in (
    'HR-C2-025','HR-C2-050','HR-C2-100','HR-C2-200','HR-C2-300',     -- lamineren
    'HR-C4-025','HR-C4-050','HR-C4-100','HR-C4-200','HR-C4-300','HR-C4-ZWAAR'
  ) then 'Hout aanhelen en vervangen'

  -- Hele kozijnonderdelen vervangen
  when item_code in (
    'VAC-HH051','VAC-HH054-a','VAC-HH054-b','VAC-HH061-a','VAC-HH061-b',
    'VAC-HH062-a','VAC-HH062-b','VAC-HH062-c','VAC-HH062-d','VAC-HH062-e','VAC-HH063',
    'VAC-HH111','VAC-HH112'                                          -- weldorpel
  ) then 'Dorpels, stijlen en kozijndelen'

  -- Draaiende delen: vervangen, gangbaar maken, de- en hermonteren
  when item_code in (
    'HR-DEUR-STAP','HR-DEUR-VLAK','HR-RAAM-DRAAI','HR-RAAM-KLEP',
    'HR-OS-RN','HR-OS-RU','HR-OS-RS','HR-OS-DN','HR-OS-DU','HR-OS-DS',
    'HR-DEMO','VAC-HH082'
  ) then 'Deuren en ramen'

  -- Rondom het glas: latten, profielen, kit en stopverf
  when item_code in (
    'HR-BK','HR-NL','HR-GL','HR-SV',
    'VAC-GH001','VAC-GH071-a','VAC-GH071-b',
    'VAC-GH022','VAC-VH010','VAC-VH011','VAC-VH031','VAC-VH032',
    'VAC-GHMP'
  ) then 'Beglazing, latten en kit'

  -- Het glas zelf
  when item_code in (
    'VAC-GH081-a','VAC-GH081-b','VAC-GH081-c',
    'VAC-GH101-a','VAC-GH101-b','VAC-GH101-c',
    'VAC-GH111-a','VAC-GH111-b','VAC-GH111-c',
    'VAC-GH112-a','VAC-GH112-b','VAC-GH112-c'
  ) then 'Glas vervangen en herplaatsen'

  when item_code in (
    'VAC-HH171','VAC-HH172-a','VAC-HH172-b','VAC-HH173','VAC-HH174',
    'VAC-HH181-a','VAC-HH181-b','VAC-HHMPHD','VAC-HHMPRW',
    'VAC-HH001','VAC-HH002'                                          -- kanten afronden, afdichtmiddel
  ) then 'Gevelbekleding en overig houtwerk'

  when item_code in (
    'VAC-MN002','VAC-MN003','VAC-MR011-a','VAC-MR011-b',
    'VAC-MR001-a','VAC-MR001-b','VAC-MR002','VAC-MR003'
  ) then 'Metselwerk en voegwerk'

  when item_code like 'VAC-BH%' then 'Betonherstel'

  else groep
end
where groep is not null;
