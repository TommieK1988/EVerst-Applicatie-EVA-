# Meertaligheid EVA Mobiel

Alleen de app op de telefoon (`/m`) is meertalig: **Nederlands (nl)**, **Pools (pl)** en
**Tamil – Sri Lanka (ta)**. Het kantoordeel blijft Nederlands. Plan en achtergrond:
`docs/plan-meertaligheid-app.md`.

## Hoe het werkt

- De taal hangt aan de medewerker (`medewerkers.taal`), niet aan de URL.
- `app/m/layout.tsx` zet een `NextIntlClientProvider` met **alle** berichten in de taal van
  de medewerker. De root-layout zet er één in het Nederlands met alleen de
  `GEDEELDE_NAAMRUIMTES` (`i18n/gedeeld.ts`) — voor componenten die ook op kantoor draaien.
- Berichten: `i18n/berichten/<taal>/<naamruimte>.json`. Nederlands is de bron; de types komen
  daaruit, dus een sleutel die niet in `nl` staat is een typefout.
- `i18n/berichten.test.ts` controleert dat `pl` en `ta` exact dezelfde sleutels en
  variabelen hebben als `nl`.
- De lintregel `i18next/no-literal-string` meldt losse tekst in JSX onder `app/m` en
  `components/mobiel`.

## Regels voor code

### Client-componenten (`'use client'`)
```tsx
import { useTranslations } from 'next-intl'
import { useDatumLocale } from '@/i18n/client'

const t = useTranslations('planning')
const locale = useDatumLocale()          // 'nl-NL' | 'pl-PL' | 'ta-LK'
<h1>{t('titel')}</h1>
{t('aantalTaken', { aantal })}            // ICU: "{aantal, plural, one {# taak} other {# taken}}"
datum.toLocaleDateString(locale, { weekday: 'long' })
toast.success(t('opgeslagen'))
```

### Servercomponenten, pagina's, `generateMetadata`, server actions onder `/m`
```tsx
import { getAppVertaler, getAppLocale } from '@/i18n/server'

const t = await getAppVertaler('planning')   // maak de component async
const locale = await getAppLocale()
```
**Nooit `useTranslations` in een servercomponent.** Er is geen taal in de URL, dus op de
server weet next-intl de taal alleen als je hem meegeeft — `useTranslations` zou daar
stilletjes Nederlands geven. `getAppVertaler` leest de taal van de ingelogde medewerker.
Bestanden onder `app/m` en `components/mobiel` die `useTranslations` gebruiken moeten dus
`'use client'` hebben.

`export const metadata = { title: … }` mag Nederlands blijven (alleen de tabtitel); wil je hem
vertalen, gebruik dan `generateMetadata` met `getAppVertaler`.

### Gedeelde componenten (ook op kantoor)
Formulieren invullen, werkbon, toolbox, handboek, dialogen. Die gebruiken alleen naamruimtes
uit `GEDEELDE_NAAMRUIMTES`; daar krijgt het kantoor Nederlands, de app de eigen taal.

### Statusnamen en vaste lijsten
Labels zoals `opleverPuntStatusLabels[status]` uit `@everts/database` blijven voor het
kantoor. In de app: `t(`status.${status}`)` met de sleutels in de eigen naamruimte.

### Wat níet vertaald wordt
Namen van mensen, klanten, adressen, dossiernummers, artikelnamen, kentekens, bedragen,
"EVA". Tekst die uit de database komt (taakomschrijving, notities, handboekinhoud) wordt niet
in de taalbestanden gezet — daarvoor is `<VertaalbareTekst>` (tijdelijk vertalen, zie plan).

### Sleutels
- camelCase, Nederlands, beschrijvend: `geenTaken`, `knopOpslaan`, `fout.nietOpgeslagen`.
- Eén zin = één sleutel. Plak geen zinsdelen aan elkaar (`t('a') + naam + t('b')`); gebruik
  variabelen: `"welkom": "Welkom, {naam}"`. Woordvolgorde verschilt per taal.
- Meervoud altijd via ICU `plural`. Pools heeft `one`, `few`, `many`, `other` — vul ze alle
  vier in voor `pl`; Nederlands en Tamil `one` + `other`.

### Opmaak
Tamil-tekst is 30–50% langer dan Nederlands, Pools 20–30%. Geef knoppen en labels ruimte om
af te breken (`whiteSpace: 'normal'`, geen vaste breedte, geen `nowrap` + `ellipsis` op
knopteksten). Koppen mogen naar twee regels.

## Taal en toon

- **Pools:** informeel (`ty`), net als het Nederlandse "je". Korte, duidelijke zinnen.
- **Tamil:** Sri Lankaans Tamil, beleefd (`நீங்கள்`). Eenvoudige woorden; een Engels leenwoord
  dat op de bouw gangbaar is mag (bijv. "டூல்பாக்ஸ்"). Geen Indiaas-Tamil-specifieke termen.

## Woordenlijst

Gebruik deze vertalingen overal hetzelfde. Ook gebruikt in de prompt voor het tijdelijk
vertalen van teksten van kantoor (`lib/vertalen`).

| Nederlands | Pools | Tamil |
|---|---|---|
| dossier | projekt | திட்டம் |
| opdracht | zlecenie | பணி ஆணை |
| actie / taak | zadanie | பணி |
| acties (module) | zadania | பணிகள் |
| planning | grafik | பணி அட்டவணை |
| prikklok | rejestracja czasu | நேரப் பதிவு |
| inklokken / uitklokken | rozpocznij pracę / zakończ pracę | வேலையைத் தொடங்கு / வேலையை முடி |
| uren | godziny | மணிநேரம் |
| weekstaat | karta tygodniowa | வாராந்திர நேர அட்டவணை |
| verlof | urlop | விடுப்பு |
| onkosten | wydatki | செலவுகள் |
| werkbon | karta pracy | பணிச் சீட்டு |
| opname | oględziny | ஆய்வு |
| bezoek | wizyta | வருகை |
| oplevering | odbiór | ஒப்படைப்பு |
| opleverpunt | usterka do odbioru | ஒப்படைப்புக் குறை |
| kwaliteitscontrole | kontrola jakości | தரக் கட்டுப்பாடு |
| afwijking | niezgodność | குறைபாடு |
| toolbox(meeting) | toolbox (szkolenie BHP) | டூல்பாக்ஸ் (பாதுகாப்புக் கூட்டம்) |
| handboek | podręcznik pracownika | பணியாளர் கையேடு |
| materieel | sprzęt | உபகரணங்கள் |
| houtrot | zgnilizna drewna | மர அழுகல் |
| kozijn | rama (okienna/drzwiowa) | ஜன்னல்/கதவுச் சட்டம் |
| steiger | rusztowanie | சாரம் |
| schilderwerk | malowanie | வர்ணம் பூசுதல் |
| meerwerk | prace dodatkowe | கூடுதல் வேலை |
| servicedesk / storing | zgłoszenie serwisowe / awaria | சேவைக் கோரிக்கை / பழுது |
| formulier | formularz | படிவம் |
| handtekening | podpis | கையொப்பம் |
| goedkeuren / keuren | zatwierdzić | அங்கீகரி |
| melding | powiadomienie | அறிவிப்பு |
| opdrachtgever / klant | klient | வாடிக்கையாளர் |
| uitvoerder | kierownik robót | பணி மேற்பார்வையாளர் |
| monteur / medewerker | pracownik | பணியாளர் |
| locatie | lokalizacja | இடம் |
| foto | zdjęcie | புகைப்படம் |
| opslaan | zapisz | சேமி |
| VCA | VCA | VCA |
