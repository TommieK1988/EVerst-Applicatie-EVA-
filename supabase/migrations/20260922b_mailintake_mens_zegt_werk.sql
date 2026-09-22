-- Een mens heeft dit bericht uit het archief gehaald en gezegd dat het wél werk is.
--
-- Overige post (correspondentie, facturen, ruis) komt niet meer in het postvak: die
-- blijft ongelezen in Postvak IN en belandt in het archief. Dat is de goedkoopste
-- fout om te maken -- behalve als EVA het mis had, want dan is een echte aanvraag
-- onzichtbaar. Het archief is daarom het vangnet, en deze vlag is de weg terug.
--
-- Zonder de vlag zou het bericht na het opnieuw lezen gewoon weer als ruis worden
-- weggezet: het model komt tot hetzelfde oordeel. De vlag zegt dat dat oordeel al
-- is overruled door iemand die meer weet, en dwingt EVA om verder te zoeken.
alter table public.mailintake_berichten
  add column if not exists mens_zegt_werk boolean not null default false;

comment on column public.mailintake_berichten.mens_zegt_werk is
  'Een medewerker heeft dit bericht uit de bak "geen aanvraag" naar Te behandelen gehaald. EVA mag het daarna niet opnieuw als ruis wegzetten.';
