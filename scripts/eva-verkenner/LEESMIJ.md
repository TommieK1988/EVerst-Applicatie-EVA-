# EVA — "Open in Verkenner"

In het dossier, tabblad **Bestanden**, staat naast *Open map in SharePoint* de knop
**Open in Verkenner**. Die opent de dossiermap in Windows Verkenner in plaats van
in de browser.

Een webpagina mag zelf geen Verkenner starten — browsers blokkeren dat. Daarom
loopt het via een eigen protocol: EVA maakt er een `eva://map?url=…`-link van, en
een kleine handler op de pc vangt die klik op. Zonder die handler doet de knop
niets; de gewone SharePoint-link blijft er daarom altijd naast staan.

Deze map bevat drie bestanden, en die horen bij elkaar:

| Bestand | Wat het doet |
|---|---|
| `eva-verkenner.ps1` | de handler zelf: zet een `eva://`-adres om in een mappad en opent dat |
| `installeer.ps1` | zet de handler klaar en registreert het protocol (per gebruiker of machine-breed) |
| `controleer.ps1` | controleert op een pc of de hele keten werkt, en zegt waar het misgaat |

## Welke map wordt geopend

De handler zoekt zelf het beste pad. Er hoeft niets per pc of per gebruiker
ingesteld te worden.

1. **Gesynchroniseerde map** (voorkeur) — is de bibliotheek met OneDrive
   gesynchroniseerd, dan opent hij het lokale pad. Snel, en werkt offline. De
   koppeling van SharePoint-URL naar lokale map komt uit het OneDrive-register
   (`HKCU:\Software\SyncEngines\Providers\OneDrive`).
2. **WebDAV-netwerkpad** — anders `\\evertsgroep.sharepoint.com@SSL\DavWWWRoot\…`.

Bestaat de map lokaal niet (bijvoorbeeld omdat iemand maar een deel van de
bibliotheek synchroniseert), dan valt hij bewust terug op WebDAV in plaats van
een bovenliggende map te openen.

> **Let op:** op deze tenant is die tweede weg in de praktijk dood. SharePoint
> Online laat Verkenner niet meer toe op `\\…@SSL\DavWWWRoot\…`, tot en met de
> root, ook niet met een draaiende WebClient-service. Komt de controle uit op
> WebDAV, behandel dat dan als "werkt niet voor deze gebruiker": de oplossing is
> de bibliotheek laten synchroniseren. EVA vangt het zelf op door na een klik
> zonder resultaat het lokale OneDrive-pad in een dialoog te tonen.

## Installeren

### Eén pc, alleen jezelf

Geen beheerdersrechten nodig.

```powershell
powershell -ExecutionPolicy Bypass -File .\installeer.ps1
```

Dit kopieert `eva-verkenner.ps1` en `controleer.ps1` naar `%LOCALAPPDATA%\EVA` en
registreert het `eva://`-protocol onder `HKEY_CURRENT_USER`.

### Machine-breed

Voor elke gebruiker van de pc. Vereist beheerdersrechten:

```powershell
powershell -ExecutionPolicy Bypass -File .\installeer.ps1 -Machine
```

Dit zet de scripts in `%ProgramFiles%\EVA` en registreert het protocol onder
`HKEY_LOCAL_MACHINE`. Program Files is bewust gekozen: daar kan een gewone
gebruiker het script niet wijzigen. Zou het ergens staan waar dat wel kan, dan
kon iemand code laten uitvoeren bij elke andere gebruiker van die pc.

De handler zelf draait gewoon in de context van de aangemelde gebruiker, en
leest diens eigen OneDrive-koppelingen. Eén machine-brede installatie werkt dus
voor iedereen, met voor elke gebruiker het juiste lokale pad.

Het script is **idempotent**: opnieuw draaien overschrijft gewoon, en het
logboek van de gebruiker blijft staan. Bij succes is de exitcode `0`.

**Start na installatie de browser volledig opnieuw** — een venster sluiten is
niet genoeg; Chrome blijft standaard in de achtergrond draaien en kent het
nieuwe protocol dan nog niet. Afdwingen kan met `taskkill /IM chrome.exe /F`.

## Uitrollen via Intune

Als **Win32-app**, toegewezen aan een **apparaatgroep** (niet aan een
gebruikersgroep — het is een machine-installatie).

### 1. Pakket maken

Zet precies deze drie bestanden samen in een lege bronmap:

```
eva-verkenner.ps1
installeer.ps1
controleer.ps1
```

`LEESMIJ.md` hoeft niet mee. `installeer.ps1` verwacht `eva-verkenner.ps1`
naast zich en stopt met een fout als dat ontbreekt; `controleer.ps1` gaat mee
naar de doelmap zodat een collega bij een storing niets uit de repo nodig heeft.

Verpakken met de Microsoft Win32 Content Prep Tool:

```powershell
IntuneWinAppUtil.exe -c "C:\pakket\eva-verkenner" -s installeer.ps1 -o "C:\pakket\uit"
```

Resultaat: `installeer.intunewin`.

### 2. App aanmaken

**Apps → Windows → Toevoegen → App-type: Windows-app (Win32)**, en upload
`installeer.intunewin`.

| Instelling | Waarde |
|---|---|
| Naam | EVA — Open in Verkenner |
| Uitgever | Everts Groep |
| Installatieopdracht | `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\installeer.ps1 -Machine` |
| Verwijderopdracht | `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\installeer.ps1 -Machine -Verwijderen` |
| Installatiegedrag | **Systeem** |
| Apparaatherstartgedrag | Geen specifieke actie |
| Besturingssysteemarchitectuur | x64 |

### 3. Detectieregel

**Regels handmatig configureren → Regel toevoegen → Regeltype: Register.**

| Veld | Waarde |
|---|---|
| Sleutelpad | `HKEY_LOCAL_MACHINE\SOFTWARE\EVA` |
| Waardenaam | `Versie` |
| Detectiemethode | Tekenreeksvergelijking |
| Operator | Gelijk aan |
| Waarde | `1.0.0` |
| Gekoppeld aan een 32-bits app op 64-bits clients | **Nee** |

Die `Versie`-waarde schrijft `installeer.ps1` zelf weg. Detecteren op het
bestaan van `%ProgramFiles%\EVA\eva-verkenner.ps1` kan ook, maar dan ziet Intune
een gewijzigde handler nooit als een nieuwe uitgave.

### 4. Nieuwe versie uitrollen

Verandert er iets aan `eva-verkenner.ps1`, dan:

1. verhoog `$Versie` bovenin `installeer.ps1`;
2. bouw het `.intunewin`-pakket opnieuw;
3. **pas de waarde in de detectieregel mee aan.**

Vergeet je stap 3, dan blijft Intune de oude waarde herkennen, denkt hij dat de
app al geïnstalleerd is en komt de nieuwe handler nooit op de pc's.

### Waarom de installer zich in 64 bits herstart

Intune start PowerShell in veel gevallen in de **32-bits** host. Daar wijst
`$env:ProgramFiles` naar `C:\Program Files (x86)`, en schrijfacties onder
`HKLM\SOFTWARE` belanden in `…\WOW6432Node` — precies waar de 64-bits Verkenner
en browser nooit kijken. De installatie *lijkt* dan te slagen (exitcode 0),
terwijl de knop op geen enkele pc werkt.

`installeer.ps1` vangt dat zelf op: draait hij 32-bits op een 64-bits Windows,
dan start hij zichzelf opnieuw via `%SystemRoot%\Sysnative\…\powershell.exe` met
dezelfde schakelaars en geeft de exitcode door. Er hoeft in Intune dus niets
bijzonders ingesteld te worden; staat er ergens een optie *"Script uitvoeren in
64-bits PowerShell-host"*, dan mag die gerust aan.

## Uitrollen via GPO

Als **opstartscript van de computer** — dat draait als SYSTEM en heeft dus de
benodigde rechten.

1. Maak een GPO en koppel die aan de OU met de werkplekken.
2. **Computerconfiguratie → Beleidsinstellingen → Windows-instellingen →
   Scripts (opstarten/afsluiten) → Opstarten**, tabblad **PowerShell-scripts**.
3. Klik op **Bestanden weergeven** en zet daar alle drie de `.ps1`-bestanden
   neer. Ze komen dan in SYSVOL te staan, waar *Domain Computers* al leesrechten
   hebben — een eigen share werkt ook, maar dan moet je die rechten zelf regelen
   voor het **computeraccount**, niet voor de gebruiker.
4. **Toevoegen** → scriptnaam `installeer.ps1`, scriptparameters `-Machine`.

Het script draait bij elke start opnieuw. Dat is geen probleem: het overschrijft
alleen zichzelf en is verder onveranderd. Een detectieregel is hier dus niet
nodig; het versienummer in het register is wel handig om te zien welke uitgave
er staat.

## Waarom de installer zich als applicatie aanmeldt

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

## Verwijderen

```powershell
powershell -ExecutionPolicy Bypass -File .\installeer.ps1 -Verwijderen
powershell -ExecutionPolicy Bypass -File .\installeer.ps1 -Machine -Verwijderen
```

Staat er zowel een gebruikers- als een machine-installatie, dan wint die van de
gebruiker. Zowel de installer als `controleer.ps1` waarschuwt daarvoor. Bij de
eerste machine-uitrol is dat de meest waarschijnlijke verklaring als één pc zich
anders gedraagt dan de rest.

Het logboek in `%LOCALAPPDATA%\EVA` blijft bij het verwijderen bewust staan: dat
is juist het bewijsmateriaal bij een storing.

## Controleren of het op een pc werkt

```powershell
powershell -ExecutionPolicy Bypass -File "C:\Program Files\EVA\controleer.ps1"
```

Draai dit **als de aangemelde gebruiker**, niet als SYSTEM: de registratie per
gebruiker, de OneDrive-koppelingen en het logboek zijn allemaal per account.
Exitcode `0` = geen fouten, `1` = er is iets mis.

Het script loopt de hele keten langs en zegt per stap wat er goed of mis is:

1. **Registratie** — staat `eva://` machine-breed en/of per gebruiker in het
   register, en welke van de twee wint?
2. **Aanmelding** — staat EVA in `RegisteredApplications` met de juiste
   `URLAssociations`? Dit is wat de browser leest; ontbreekt het, dan werkt
   Win+R wél en een klik in EVA niet.
3. **Het script** — bestaat het bestand waar de registratie naar wijst, wordt het
   met `-File` aangeroepen, en staat het als UTF-8 mét BOM op schijf?
4. **Padbepaling** — welk pad zou de handler kiezen: OneDrive of WebDAV?
5. **Logboek** — is de handler op dit account ooit gestart, en wat was het
   laatste dat hij deed?

Met `-Proef` vuurt het script zelf een `eva://`-adres af en kijkt of het logboek
meegroeit. Dat bewijst de Windows-kant los van de browser; er kan een mapvenster
opengaan.

```powershell
powershell -ExecutionPolicy Bypass -File .\controleer.ps1 -Proef
```

Een andere map testen kan met `-Url`:

```powershell
powershell -ExecutionPolicy Bypass -File .\controleer.ps1 -Url "https://evertsgroep.sharepoint.com/sites/DeRekenkamer/Shared%20Documents/Calculaties/Begrotingen"
```

### Checklist bij "er gebeurt niets"

Het logboek op `%LOCALAPPDATA%\EVA\eva-verkenner.log` is hier het beslispunt. De
handler draait onzichtbaar, dus alleen daar is te zien of de klik de pc
überhaupt bereikt heeft.

1. **Draai `controleer.ps1`.** Staat er een `[X]`, los dat eerst op — meestal
   ontbreekt de registratie of staat er nog een oude gebruikers-installatie
   overheen.
2. **Draai `controleer.ps1 -Proef`.** Groeit het logboek mee, dan is Windows in
   orde en zit het probleem tussen browser en Windows. Groeit het niet, dan is
   de registratie niet compleet — installeer opnieuw.
3. **Klik in EVA op "Open in Verkenner" en draai `controleer.ps1` nog eens.**
   - *Geen nieuwe regel in het logboek* → de aanroep strandt vóór de pc. Werkte
     `-Proef` in stap 2 wél, dan ligt het aan de browser: sluit hem volledig af
     en probeer opnieuw, en lees anders de paragraaf hieronder over de
     endpointbeveiliging.
   - *Wel een nieuwe regel, maar geen venster* → de aanroep kwam aan, maar het
     pad werkt niet. Stap 4 laat zien welk pad gekozen wordt; staat daar WebDAV,
     dan is dat de verklaring en moet de gebruiker gaan synchroniseren.

### De endpointbeveiliging kan de aanroep tegenhouden

Werkt `controleer.ps1 -Proef` wel en een klik in de browser niet, dan is de
registratie in orde en houdt iets de sprong van browser naar handler tegen. De
verdenking ligt bij de endpointbeveiliging: de handler start `powershell.exe`,
en "een browser start PowerShell" is precies het patroon dat zulke software
stilhoudt. Op deze werkplekken draait **Bitdefender endpoint**
(`EPSecurityService`; Windows Defender staat uit).

Dat is niet hard bewezen — de EDR logt in zijn eigen console, niet in het
Windows-logboek — maar het verklaart alle waarnemingen: hetzelfde `eva://`-adres
werkt via Win+R en `Start-Process`, en niet vanuit de browser. Het verschil
tussen die twee is de ouder van het proces.

Oplossing ligt bij beheer: een uitzondering in de EDR voor deze handler. Neem
dit mee als eerste vraag zodra de machine-brede uitrol staat en het bij collega's
alsnog niet werkt — dan is het níét de uitrol.

### Wat de meldingen in het logboek betekenen

`controleer.ps1` vertaalt deze zelf, maar voor de volledigheid:

| Regel | Betekenis |
|---|---|
| `aangeroepen <- eva://…` | de klik is aangekomen; hierna hoort er een `openen`-regel te staan |
| `openen [OneDrive (lokaal)] …` | de gesynchroniseerde map wordt geopend |
| `openen [WebDAV (netwerk)] …` | geen sync gevonden; op deze tenant loopt dat pad dood — laten synchroniseren |
| `naar voren halen mislukt: … .dll is geweigerd` | de map staat wél open, maar achter de browser — zie hieronder |
| `venster niet gevonden om naar voren te halen` | het openen duurde te lang, meestal bij WebDAV; de map komt alsnog |
| `FOUT: …` | de handler is gestart maar liep vast; de tekst zegt waarop |

Die regel over *naar voren halen* is onschuldig voor de werking maar niet voor
de beleving: de map opent achter het browservenster, en dat melden gebruikers
als "er gebeurt niets". Het komt doordat de handler voor die ene Windows-aanroep
een tijdelijke DLL moet laten bouwen in `%TEMP%`, wat op pc's met streng
beveiligingsbeleid geblokkeerd is. De map staat dan gewoon op de taakbalk.

### Optioneel: het bevestigingsvenster van de browser onderdrukken

Standaard vraagt Chrome/Edge bij elke klik *"Deze site probeert EVA te openen"*.
Dat kan met beleid weg voor alleen het EVA-adres:

```json
{ "allowed_origins": ["https://eva.everts.chat"], "protocol": "eva" }
```

Beleidsinstelling `AutoLaunchProtocolsFromOrigins`, per browser in te stellen via
Intune of GPO. Bij `allowed_origins` hoort het adres waarop EVA draait — neem de
waarde van `NEXT_PUBLIC_APP_URL` over en controleer die in de Vercel-omgeving
voordat je het beleid uitrolt.

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
meldingen verminken. `controleer.ps1` controleert dit op de geïnstalleerde
handler.

Verhoog bij elke wijziging aan `eva-verkenner.ps1` het `$Versie`-nummer bovenin
`installeer.ps1`, en pas de detectieregel in Intune mee aan.
