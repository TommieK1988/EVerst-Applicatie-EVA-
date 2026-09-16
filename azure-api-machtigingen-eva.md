# Azure / Entra ID — API-machtigingen voor EVA

Voor: cloudbeheerder
Betreft: Microsoft Graph API-machtigingen die de app-registratie van EVA nodig heeft

EVA praat met Microsoft 365 via één app-registratie (Entra ID). Er lopen twee
flows naast elkaar. Beide gebruiken **Microsoft Graph** als API; de machtigingen
staan onder *App-registraties → (de EVA-registratie) → API-machtigingen*.

---

## 1. Gedelegeerde machtigingen (namens de ingelogde medewerker)

Type: **Delegated**. Dit wordt gebruikt als een medewerker zijn/haar
Office 365-account koppelt en mails verstuurt vanuit EVA.

| Machtiging      | Aanwezig? | Waarvoor                                                              |
|-----------------|-----------|----------------------------------------------------------------------|
| `offline_access`| al goed   | Verversen van de koppeling (refresh-token), zodat die niet elk uur verloopt |
| `User.Read`     | al goed   | Naam + mailadres van de medewerker ophalen bij het koppelen          |
| `Mail.Send`     | al goed   | Offertes en dossiermails versturen namens de medewerker              |
| **`Mail.Read`** | **TOEVOEGEN** | Verzonden mail teruglezen om als .eml in het dossier te archiveren |

→ **Toe te voegen: `Mail.Read` (Delegated).**

---

## 2. Toepassingsmachtigingen (app-only, zonder gebruiker)

Type: **Application**. Dit wordt gebruikt voor achtergrondtaken die los van een
ingelogde gebruiker draaien: PDF-conversie van Word-documenten en de
SharePoint-dossierbestanden (zoeken, tonen, dossiermap aanmaken, uploaden).

| Machtiging                | Aanwezig? | Waarvoor                                                                 |
|---------------------------|-----------|-------------------------------------------------------------------------|
| **`Sites.Selected`** | **TOEVOEGEN** | Word→PDF-conversie, dossierbestanden zoeken/tonen, dossiermappen aanmaken en bestanden uploaden — per site expliciet **write** verlenen (zie hieronder) |
| **`Mail.Send`** (Application) | **TOEVOEGEN** | Klantportaal: inloglinks en uitnodigingen versturen vanuit een gedeelde postbus (niet namens een ingelogde medewerker) |

→ **Toe te voegen: `Sites.Selected` (Application) en `Mail.Send` (Application).**

### `Sites.Selected` — per site een write-grant

`Sites.Selected` geeft de app op zichzelf **nog geen** toegang tot enige site. Je
verleent daarna per SharePoint-site expliciet lees/schrijfrecht. Dat is de
strak-afgeschermde variant: de app kan uitsluitend bij de sites die je aanwijst,
niet bij alle bestanden in de tenant.

Verleen **`write`** (niet alleen `read` — EVA maakt dossiermappen aan en uploadt)
op de sites achter deze twee omgevingsvariabelen:

- de site van **`O365_DOSSIER_DRIVE_ID`** (dossierbestanden + offerte-archief)
- de site van **`O365_PDF_DRIVE_ID`** (tijdelijke Word→PDF-conversie)

De grant gaat via Graph, bijv.:

```
POST https://graph.microsoft.com/v1.0/sites/{site-id}/permissions
{
  "roles": ["write"],
  "grantedToIdentities": [
    { "application": { "id": "<app-registratie-client-id>", "displayName": "EVA" } }
  ]
}
```

> **Voorwaarde:** beide drives moeten SharePoint-bibliotheken zijn. Is
> `O365_PDF_DRIVE_ID` een persoonlijke OneDrive, dan werkt `Sites.Selected` daar
> niet — verplaats de conversie in dat geval naar een SharePoint-bibliotheek, of
> gebruik voor die ene drive `Files.ReadWrite.All`. Graag even afstemmen wat het is.

*Bredere variant (alleen als het bovenstaande niet uitkomt):* `Files.ReadWrite.All`
geeft de app in één keer toegang tot **álle** bestanden in de tenant, zonder
per-site grants. Simpeler in te stellen, maar veel ruimer — `Sites.Selected` heeft
de voorkeur.

### Let op: `Mail.Send` (Application) móet worden ingeperkt

`Mail.Send` als toepassingsmachtiging geeft de app standaard het recht om namens
**iedere** postbus in de tenant te mailen. Dat is te ruim. Beperk de app na het
verlenen van de machtiging tot precies de portaalpostbus met een Exchange
**ApplicationAccessPolicy** (via Exchange Online PowerShell:
`New-ApplicationAccessPolicy`), gekoppeld aan het app-registratie-ID en een
mail-enabled beveiligingsgroep die alleen de portaalpostbus bevat.

De portaalpostbus zelf (het afzendadres) moet als omgevingsvariabele
`O365_PORTAAL_AFZENDER` worden gezet; optioneel een apart antwoordadres in
`O365_PORTAAL_ANTWOORD_ADRES` (het adres waar reacties van klanten binnenkomen).

> Deze `Mail.Send`-machtiging is alleen nodig zodra het **klantportaal** live gaat.
> Staat het portaal nog niet in productie, dan kan dit punt wachten tot dat zover
> is — de rest van de lijst is wél nu al nodig.

---

## 3. Na het toevoegen

- Klik op **"Beheerderstoestemming verlenen voor \<tenant\>"**. Zonder deze stap
  doen de nieuwe machtigingen niets (de app-only machtiging werkt sowieso
  uitsluitend met admin consent).

## 4. Overige controlepunten in de app-registratie / omgeving

- **Omleidings-URI** (type *Web*) staat op: `https://<productie-domein>/api/auth/o365/callback`
- **Clientgeheim** (client secret) is niet verlopen.
- Omgevingsvariabele **`O365_TENANT_ID`** bevat de echte tenant-GUID — **niet** de
  waarde `common`. De app-only flow (PDF + SharePoint + portaalmail) faalt met een
  tokenfout zolang hier `common` staat.
- (Alleen bij portaal-livegang) **`O365_PORTAAL_AFZENDER`** = de gedeelde
  portaalpostbus; optioneel **`O365_PORTAAL_ANTWOORD_ADRES`** = het antwoordadres.

---

## Samengevat — dit is wat er moet gebeuren

1. Machtiging toevoegen: **`Mail.Read`** — type *Delegated*
2. Machtiging toevoegen: **`Sites.Selected`** — type *Application* — **én** per site
   een **write**-grant voor de sites van `O365_DOSSIER_DRIVE_ID` en `O365_PDF_DRIVE_ID`
3. Machtiging toevoegen: **`Mail.Send`** — type *Application* — **én** inperken tot
   de portaalpostbus met een Exchange ApplicationAccessPolicy *(alleen nodig bij
   livegang van het klantportaal)*
4. **Beheerderstoestemming verlenen** voor de tenant
5. Controleren: omleidings-URI, geldig clientgeheim, en `O365_TENANT_ID` = echte
   tenant-GUID (niet `common`)

Niet nodig (de app raakt dit nergens aan): agenda/Calendars, gebruikerslijst
(`/users` wordt alleen als afzender voor `sendMail` gebruikt, niet om gebruikers
op te vragen), Teams, tenant-brede bestandstoegang (`Files.ReadWrite.All` is met
`Sites.Selected` niet nodig).


---

## Mailintake — een tweede app-registratie

De mailintake (`/mailintake`) leest drie gedeelde postbussen: offerteaanvragen,
opdrachten en servicedeskbonnen. Dat vraagt **`Mail.ReadWrite`** als
*Application*-machtiging — lezen om de post op te halen, schrijven om een
afgehandelde mail te categoriseren en naar de map "Verwerkt door EVA" te
verplaatsen. (`Mail.ReadWrite` omvat `Mail.Read`; het geeft géén recht om te
versturen, dat is `Mail.Send`.)

### Waarom niet op de bestaande registratie

Een Exchange `ApplicationAccessPolicy` werkt **per app, niet per machtiging**.
De bestaande EVA-registratie heeft al `Mail.Send` (Application), afgebakend tot
de portaalpostbus. Zouden we de drie intakepostbussen aan diezelfde groep
toevoegen, dan mag EVA vanaf dat moment ook *namens* die postbussen mailen —
een recht dat niemand heeft gevraagd en dat lastig terug te draaien is.

Daarom een aparte registratie:

| Onderdeel | Waarde |
|---|---|
| Naam | EVA Mailintake |
| Machtiging | `Mail.ReadWrite` — type **Application** — mét beheerderstoestemming |
| Afbakening | `New-ApplicationAccessPolicy` op precies de drie intakepostbussen |
| Env-variabelen | `O365_INTAKE_CLIENT_ID`, `O365_INTAKE_CLIENT_SECRET` |

`O365_TENANT_ID` wordt gedeeld met de hoofdregistratie en moet ook hier de echte
tenant-GUID zijn, niet `common`.

### Wat er in de mailbox verandert

EVA verplaatst afgehandelde en door een mens genegeerde mail naar de submap
**Verwerkt door EVA** onder Postvak IN (die maakt hij zelf aan) en zet er een
categorie op. Mail die EVA zelf als "geen aanvraag" beoordeelt blijft
**ongelezen in Postvak IN** staan — dat oordeel heeft immers niemand gezien.

Dat is zichtbaar voor iedereen die in die mailboxen kijkt, dus stem het af vóór
livegang. De schakelaar staat in EVA onder Instellingen → Mailintake en begint
op *Alleen categorie*: dan wordt er niets verplaatst.

### Controleren

Instellingen → Mailintake → **Verbinding controleren** leest één bericht per
postbus en schrijft niets. Een **403** betekent vrijwel altijd dat
`Mail.ReadWrite` ontbreekt, dat de beheerderstoestemming niet is verleend, of
dat de ApplicationAccessPolicy deze postbus juist uitsluit.

### Stappenplan

Je hebt hiervoor een **globale beheerder** (of Privileged Role Administrator)
nodig: alleen die mag beheerderstoestemming verlenen. Reken op een half uur,
plus wachttijd voor de Exchange-policy.

De drie intakepostbussen zijn `aanvragen@everts.chat`, `opdrachten@everts.chat` en
`servicedesk@everts.chat`.

#### 1. App-registratie aanmaken

Azure Portal → **Microsoft Entra ID** → **App-registraties** → *Nieuwe registratie*.

| Veld | Waarde |
|---|---|
| Naam | `EVA Mailintake` |
| Ondersteunde accounttypen | Alleen accounts in deze organisatiemap (één tenant) |
| Omleidings-URI | **leeglaten** — deze app logt nooit een gebruiker in |

Noteer na het aanmaken van het overzicht:
- **Toepassings-id (client)** → wordt `O365_INTAKE_CLIENT_ID`
- **Map-id (tenant)** → moet gelijk zijn aan `O365_TENANT_ID`

#### 2. Clientgeheim

**Certificaten en geheimen** → *Nieuw clientgeheim*. Kies de langste geldigheid
(24 maanden) en zet de vervaldatum meteen in de agenda.

Kopieer de **Waarde**, niet de Geheim-id. De waarde is na het verlaten van de
pagina niet meer op te vragen. Dit wordt `O365_INTAKE_CLIENT_SECRET`.

> Loopt het geheim af, dan stopt de intake. Stil is dat niet: de bewakingscron
> meldt "Mailintake: {postbus} kon niet worden gelezen" aan de beheerders.

#### 3. Machtiging + toestemming

**API-machtigingen** → *Een machtiging toevoegen* → **Microsoft Graph** →
**Toepassingsmachtigingen** (niet Gedelegeerd!) → zoek `Mail.ReadWrite` → toevoegen.

Verwijder daarna `User.Read` als die er standaard bij staat — deze app heeft geen
gebruikerscontext.

Klik **Beheerderstoestemming verlenen voor …**. Controleer dat de status groen is;
zonder die stap geeft elke aanroep 403.

Het eindresultaat is één machtiging:

| API | Machtiging | Type | Status |
|---|---|---|---|
| Microsoft Graph | `Mail.ReadWrite` | Toepassing | Verleend |

#### 4. De app afbakenen tot de drie postbussen

**Dit is de belangrijkste stap.** Zonder policy mag deze app op dit moment élke
postbus in de tenant lezen én wijzigen.

```powershell
Connect-ExchangeOnline

# Een mail-enabled beveiligingsgroep met precies de drie intakepostbussen.
New-DistributionGroup -Name "EVA Mailintake Postbussen" `
  -Alias "eva-mailintake-scope" `
  -Type Security `
  -Members "aanvragen@everts.chat","opdrachten@everts.chat","servicedesk@everts.chat"

# Uit het adresboek halen: hij is een afbakening, geen verzendlijst.
Set-DistributionGroup -Identity "eva-mailintake-scope" `
  -HiddenFromAddressListsEnabled $true

# De app vastzetten op die groep.
New-ApplicationAccessPolicy `
  -AppId "<toepassings-id uit stap 1>" `
  -PolicyScopeGroupId "eva-mailintake-scope@everts.chat" `
  -AccessRight RestrictAccess `
  -Description "EVA Mailintake mag alleen de drie intakepostbussen lezen"
```

Controleer daarna beide kanten — een policy die alles toestaat ziet er precies
zo uit als een policy die werkt:

```powershell
Test-ApplicationAccessPolicy -Identity aanvragen@everts.chat -AppId <toepassings-id>
#   AccessCheckResult : Granted

Test-ApplicationAccessPolicy -Identity tom@everts.chat -AppId <toepassings-id>
#   AccessCheckResult : Denied
```

> Exchange heeft tot ongeveer **30 minuten** nodig om de policy door te voeren.
> Krijg je vlak na het aanmaken nog `Granted` op een postbus die geweigerd hoort
> te worden: even wachten en opnieuw toetsen.

#### 5. In Vercel zetten

Project-instellingen → Environment Variables, voor **Production**:

| Variabele | Waarde |
|---|---|
| `O365_INTAKE_CLIENT_ID` | toepassings-id uit stap 1 |
| `O365_INTAKE_CLIENT_SECRET` | de waarde uit stap 2 |

Controleer meteen dat **`O365_TENANT_ID` de echte tenant-GUID is** en niet
`common`. App-only werkt niet met `common`; dat geldt ook voor deze registratie.

Env-wijzigingen gaan pas in bij een nieuwe deployment — even opnieuw deployen.

#### 6. Aanzetten in EVA

Instellingen → **Mailintake**:

1. Vul per postbus het echte e-mailadres in.
2. Klik **Verbinding controleren**. Die leest één bericht en schrijft niets.
   - *Verbinding werkt* → door naar 3.
   - *403* → machtiging, toestemming of policy klopt niet (zie Controleren hierboven).
   - *404* → het adres klopt niet.
3. Zet de postbus op **actief**. Vanaf dat moment leest de cron elke tien minuten.
4. Laat **Automatisch aanmaken** uit en de **Nabehandeling** op *Alleen categorie*.
   Kijk eerst een paar weken mee of de beoordeling klopt voordat EVA zelf
   dossiers gaat aanmaken of mail gaat verplaatsen.

#### Checklist

- [ ] App-registratie `EVA Mailintake` bestaat, single tenant, geen redirect-URI
- [ ] Clientgeheim aangemaakt; vervaldatum in de agenda
- [ ] `Mail.ReadWrite` als **Toepassings**machtiging, beheerderstoestemming verleend
- [ ] Beveiligingsgroep met precies de drie postbussen, verborgen uit het adresboek
- [ ] `New-ApplicationAccessPolicy` aangemaakt
- [ ] `Test-ApplicationAccessPolicy` geeft **Granted** op een intakepostbus
- [ ] `Test-ApplicationAccessPolicy` geeft **Denied** op een gewone collega
- [ ] `O365_INTAKE_CLIENT_ID` + `O365_INTAKE_CLIENT_SECRET` in Vercel (Production)
- [ ] `O365_TENANT_ID` is een GUID, niet `common`
- [ ] Opnieuw gedeployd
- [ ] "Verbinding controleren" slaagt voor alle drie de postbussen
