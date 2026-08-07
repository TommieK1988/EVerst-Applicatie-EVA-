# EVA — "Open in Verkenner"

In het dossier, tabblad **Bestanden**, staat naast *Open map in SharePoint* de knop
**Open in Verkenner**. Die opent de dossiermap in Windows Verkenner in plaats van
in de browser.

Een webpagina mag zelf geen Verkenner starten — browsers blokkeren dat. Daarom
loopt het via een eigen protocol: EVA maakt er een `eva://map?url=…`-link van, en
een kleine handler op de pc vangt die klik op. Zonder die handler doet de knop
niets; de gewone SharePoint-link blijft er daarom altijd naast staan.

## Welke map wordt geopend

De handler zoekt zelf het beste pad. Er hoeft niets per pc of per gebruiker
ingesteld te worden.

1. **Gesynchroniseerde map** (voorkeur) — is de bibliotheek met OneDrive
   gesynchroniseerd, dan opent hij het lokale pad. Snel, en werkt offline. De
   koppeling van SharePoint-URL naar lokale map komt uit het OneDrive-register
   (`HKCU:\Software\SyncEngines\Providers\OneDrive`).
2. **WebDAV-netwerkpad** — anders `\\evertsgroep.sharepoint.com@SSL\DavWWWRoot\…`.
   Werkt zonder sync, maar kan om een login vragen en is trager.

Bestaat de map lokaal niet (bijvoorbeeld omdat iemand maar een deel van de
bibliotheek synchroniseert), dan valt hij bewust terug op WebDAV in plaats van
een bovenliggende map te openen.

## Installeren

### Eén pc, alleen jezelf

Geen beheerdersrechten nodig.

```powershell
powershell -ExecutionPolicy Bypass -File .\installeer.ps1
```

Dit kopieert `eva-verkenner.ps1` naar `%LOCALAPPDATA%\EVA` en registreert het
`eva://`-protocol onder `HKEY_CURRENT_USER`.

### Iedereen op kantoor

Machine-breed, dus voor elke gebruiker van de pc. Vereist beheerdersrechten:

```powershell
powershell -ExecutionPolicy Bypass -File .\installeer.ps1 -Machine
```

Dit zet het script in `%ProgramFiles%\EVA` en registreert het protocol onder
`HKEY_LOCAL_MACHINE`. Rol het uit via Intune of GPO als **machine-script**;
beide bestanden (`installeer.ps1` en `eva-verkenner.ps1`) moeten samen in één
map staan.

Program Files is bewust gekozen: daar kan een gewone gebruiker het script niet
wijzigen. Zou het ergens staan waar dat wel kan, dan kon iemand code laten
uitvoeren bij elke andere gebruiker van die pc.

De handler zelf draait gewoon in de context van de aangemelde gebruiker, en
leest diens eigen OneDrive-koppelingen. Eén machine-brede installatie werkt dus
voor iedereen, met voor elke gebruiker het juiste lokale pad.

**Start na installatie de browser volledig opnieuw** — een venster sluiten is
niet genoeg; Chrome blijft standaard in de achtergrond draaien en kent het
nieuwe protocol dan nog niet. Afdwingen kan met `taskkill /IM chrome.exe /F`.

### Waarom de installer zich als applicatie aanmeldt

De installer schrijft niet alleen de klasse-registratie (`HKCR\eva`), maar meldt
EVA ook aan onder `RegisteredApplications`, met een `Capabilities\URLAssociations`
die `eva` aan de ProgID `EVA.Verkenner` koppelt.

Dat is nodig omdat er twee verschillende wegen naar een protocol-handler zijn.
`ShellExecute` — Win+R, `Start-Process` — neemt genoegen met de kale
klasse-registratie. Browsers en het Windows-venster *"Hoe wil je dit openen?"*
kijken naar de aangemelde applicaties. Ontbreekt die aanmelding, dan doet een
klik in EVA niets, of verschijnt *"Uw pc heeft geen app die deze koppeling kan
openen"* — terwijl hetzelfde adres via Win+R wél werkt. OneDrive registreert
zijn `odopen`-protocol op precies dezelfde manier.

### Verwijderen

```powershell
powershell -ExecutionPolicy Bypass -File .\installeer.ps1 -Verwijderen
powershell -ExecutionPolicy Bypass -File .\installeer.ps1 -Machine -Verwijderen
```

Staat er zowel een gebruikers- als een machine-installatie, dan wint die van de
gebruiker. De installer waarschuwt daarvoor.

## Controleren zonder Verkenner te openen

Handig als het op een pc niet werkt: dit toont alleen welk pad gekozen zou worden.

```powershell
powershell -ExecutionPolicy Bypass -File .\eva-verkenner.ps1 -Controleer -Uri "eva://map?url=https%3A%2F%2Fevertsgroep.sharepoint.com%2Fsites%2FDeRekenkamer%2FShared%2520Documents%2FCalculaties%2FBegrotingen"
```

Let op de dubbele codering: de SharePoint-URL is zelf al percent-gecodeerd en
wordt daarna nog eens gecodeerd als queryparameter. EVA doet dat automatisch.

## Veiligheid

Een `eva://`-link kan ook van een andere website komen, dus de handler is
wantrouwig:

- alleen `eva://map`-adressen;
- de map-URL moet `https` zijn en op een host uit `$ToegestaneHosts` staan
  (bovenin `eva-verkenner.ps1`; nu de twee SharePoint-hosts van Everts);
- padsegmenten met `..` of `:` worden geweigerd;
- de URI wordt met `-File` doorgegeven en dus altijd als tekst behandeld, nooit
  als uit te voeren code. **Vervang `-File` niet door `-Command`.**

Verhuizen jullie naar een andere tenant of komt er een tweede SharePoint-omgeving
bij, dan moet `$ToegestaneHosts` mee.

## Onderhoud

De `.ps1`-bestanden moeten opgeslagen blijven als **UTF-8 mét BOM**. Windows
PowerShell 5.1 leest een script zonder BOM als ANSI, waardoor accenten in de
meldingen verminken.
