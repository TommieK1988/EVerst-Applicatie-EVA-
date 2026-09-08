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
