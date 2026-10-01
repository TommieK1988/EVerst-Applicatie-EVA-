-- Aliassen op onze eigen adressen verwijderen.
--
-- Het leergeheugen van de mailintake onthoudt bij een handmatige koppeling welk
-- afzenderadres bij welke klant hoort. Vrijwel alle post komt echter doorgestuurd
-- binnen: een collega stuurt de klantmail naar de intakepostbus. Daardoor leerde EVA
-- "bas@everts.chat = VvE De Linde" en stelde die klant daarna voor bij elke mail die
-- Bas doorstuurde -- ongeacht de inhoud.
--
-- Zo kreeg een meerwerkmail van Stichting VO Haaglanden (offerte OFT-2026-080,
-- Rijswijks Lyceum) VvE De Linde als opdrachtgever voorgesteld, terwijl het model de
-- juiste klant gewoon had gelezen.
--
-- Er stonden er drie, waaronder info@everts.chat -- de postbus zelf.
-- `onthoudAlias` maakt ze sinds deze wijziging niet meer aan en `herkenAfzender`
-- slaat ze over, maar de bestaande rijen moeten weg.
delete from public.mailintake_aliassen
 where patroon like '%@everts.chat'
    or patroon = '@everts.chat';
