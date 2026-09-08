-- Materieel — categorie 'ladder' + "geen sticker" weer betekenisvol maken
--
-- Twee kleine wijzigingen, beide nodig om een bestaande voorraad in te lezen en
-- daarna pas van QR-stickers te voorzien.
--
-- 1. CATEGORIE 'ladder'
--    Ladders, trappen en bordestrappen vielen tussen de wal en het schip: geen
--    gereedschap, geen steigeronderdeel, maar wél een eigen jaarlijks
--    keuringsregime en persoonlijk uitgegeven. Ze krijgen daarom een eigen
--    categorie.
--
-- 2. qr_code MAG WEER LEEG ZIJN
--    Bij het aanmaken vulde een trigger `qr_code` met het eigen id. Daardoor was
--    "heeft dit object al een sticker?" niet te zien: de kolom was nooit leeg.
--    Zowel de app als de scanner gebruikte al `qr_code <> id` als "geen sticker",
--    dus de trigger voegde niets toe behalve die dubbelzinnigheid.
--
--    Weglaten kan zonder verlies: een door EVA geprinte QR bevat de scan-URL
--    /materieelbeheer/<id>, en die wordt opgezocht op `id` — niet op `qr_code`.
--    `qr_code` is vanaf nu uitsluitend de code van een echte, fysieke sticker;
--    leeg betekent "nog te stickeren".

-- 1 ------------------------------------------------------------------------
alter type materieel_categorie add value if not exists 'ladder';

-- 2 ------------------------------------------------------------------------
drop trigger if exists trg_materieel_objecten_qr on public.materieel_objecten;
drop function if exists public.materieel_default_qr();

-- Bestaande rijen waar de "sticker" niets anders is dan het eigen id: leegmaken,
-- zodat ze in de lijst "nog geen sticker" opduiken.
update public.materieel_objecten
   set qr_code = null
 where qr_code = id::text;

-- Sneller zoeken naar wat nog gestickerd moet worden.
create index if not exists idx_materieel_objecten_zonder_sticker
  on public.materieel_objecten (omschrijving)
  where qr_code is null and actief;
