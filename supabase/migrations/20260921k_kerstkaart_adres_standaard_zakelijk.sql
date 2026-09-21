-- Standaard gaat de kerstkaart naar het werkadres, tenzij we een privé-adres kennen.
--
-- De eerste opzet ging uit van privé als standaard, met het werkadres als uitwijk. In de
-- praktijk is het andersom: van 531 contactpersonen hebben er 58 een privé-adres in EVA. Het
-- werkadres is dus de regel en het privé-adres de uitzondering. Ook mensen zonder gekoppelde
-- organisatie gaan mee op 'zakelijk' — die hebben geen enkel adres, en dan is een ontbrekend
-- werkadres de juiste melding in het scherm.
--
-- Dit raakt alleen wáár de kaart heen gaat, niet wíé er een krijgt (`kerstkaart`).

alter table public.contactpersonen
  alter column kerstkaart_adres set default 'zakelijk';

update public.contactpersonen
   set kerstkaart_adres = case
         when prive_adres_straat is not null
           or prive_adres_postcode is not null
           or prive_adres_plaats is not null then 'prive'
         else 'zakelijk'
       end
 where kerstkaart_adres is distinct from case
         when prive_adres_straat is not null
           or prive_adres_postcode is not null
           or prive_adres_plaats is not null then 'prive'
         else 'zakelijk'
       end;
