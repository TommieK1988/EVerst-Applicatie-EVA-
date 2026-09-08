-- Materieel — vervangingswaarde per object
--
-- `aanschafwaarde` is wat het destijds kostte en `boekwaarde` wat de boekhouding
-- er nog aan toekent. Voor de praktijk mist er één getal: wat kost het om dit
-- vandaag te vervangen? Dat is het bedrag dat je wil zien bij verlies, diefstal
-- of schade, en het is los van de historische inkoop te onderhouden.
--
-- Bewust een eigen kolom en geen veld in `details`: er wordt op gesorteerd,
-- gefilterd en (in het dashboard) mee gerekend.

alter table public.materieel_objecten
  add column if not exists vervangingswaarde numeric(12,2);

comment on column public.materieel_objecten.vervangingswaarde is
  'Wat kost het om dit object vandaag te vervangen (excl. btw). Los van aanschaf- en boekwaarde; bij een importschatting staat de herkomst in details.vervangingswaarde_bron.';
