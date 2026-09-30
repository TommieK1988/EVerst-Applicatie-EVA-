-- Correctie op 20260930h: het item suggereerde dat alle mailbestanden voortaan
-- gedownload worden. Dat geldt alleen voor .eml (die de intake neerzet); de
-- .msg-bestanden die mensen zelf in de map slepen openen in SharePoint zelf en
-- zijn ongewijzigd gebleven.
update public.changelog
   set omschrijving = 'De aanvraagmail wordt sinds kort als bestand in de dossiermap gezet, maar '
     || 'aanklikken deed niets: SharePoint kan dat type mailbestand niet in beeld brengen. Zulke '
     || 'bestanden worden nu gedownload en openen daarna gewoon in Outlook. Mails die je zelf '
     || 'vanuit Outlook in de map sleept, en alle andere bestanden, openen ongewijzigd in '
     || 'SharePoint zelf.'
 where id = '9eb1b1f5-4c22-4cfd-b092-55bb4413cd39';
