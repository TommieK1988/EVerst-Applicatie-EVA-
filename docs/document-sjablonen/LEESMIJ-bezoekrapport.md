# Bezoekrapport — één rapportage voor elke controle

`Bezoekrapport.docx` is het startsjabloon voor **één** rapportage over wat er op
locatie is vastgelegd: een **projectbezoek**, een **kwaliteitsronde** of een
**oplevering**.

> **VCA-formulieren en gewone formulieren horen hier niet bij.** Die houden hun
> eigen formulier en hun eigen rapportage; VCA-actiepunten komen nooit terug in
> het bezoekrapport. De bronnen "Veiligheidsronde" en "Inspectieformulier" zijn in
> september 2026 uit de bronkiezer verwijderd.

Er is bewust geen apart opleverrapport, kwaliteitsrapport en formulierrapport.
Elk hoofdstuk staat achter een `{#bezoek.heeft_…}`-conditie, dus een bron die
iets niet kent, laat dat hoofdstuk vanzelf verdwijnen. De klant ziet daardoor
altijd hetzelfde document, met andere hoofdstukken erin.

| Hoofdstuk | Projectbezoek | Kwaliteitsronde | Oplevering |
|---|:--:|:--:|:--:|
| Voorblad, inleiding, samenvatting | ✓ | ✓ | ✓ |
| **Voortgang** | ✓ | – | – |
| Bevindingen | ✓ | ✓ | ✓ |
| **Per onderdeel** | ✓ | – | – |
| Wat er goed ging | ✓ | ✓ | – |
| Opvolging van eerdere bezoeken | – | ✓ | – |
| Ondertekening | – | – | ✓ |

> **Metingen en "Wat er is beoordeeld" staan sinds 16 september 2026 niet meer in dit
> sjabloon.** Beide hoorden bij de kwaliteitsronde — laagdiktemetingen en de afgevinkte
> controlepunten uit de bibliotheek — en die module is geparkeerd.
>
> De tags bestaan nog wel. Wie de controlepunten in een eigen sjabloonvariant terug wil:
> `{#bezoek.heeft_punten}` … `{#bezoek.punten}{groep}{onderdeel}{resultaat}{opmerking}{/…}`
> en `{#bezoek.heeft_metingen}` … Ze staan nog in de variabelenlijst, dus
> **Template controleren** blijft ze herkennen.

Bij een **projectbezoek** zijn er twee hoofdstukken die op elkaar lijken maar iets
anders doen. **Bevindingen** bevat alleen de punten die de projectleider als
aandachtspunt heeft aangemerkt: die staan op het dossier, hebben een nummer en
krijgen opvolging — dat is het actielijstje. **Per onderdeel** bevat álle punten,
gegroepeerd per discipline en met het voortgangspercentage erbij — dat is het
verslag van wat er is gezien.

---

## Eenmalig instellen

1. Ga naar **Instellingen → Document-sjablonen → Nieuw**.
2. Documentsoort: **Bezoekrapport**. Naam: bijvoorbeeld "Bezoekrapport".
3. Upload `Bezoekrapport.docx` als Word-sjabloon.
4. Upload het **briefpapier** (PDF) — hetzelfde als bij de andere documenten;
   daar komt het logo en de bedrijfsvoet vandaan.
5. Voeg één invoerveld toe:
   - Type **Bezoekrapport (bezoek kiezen)**, sleutel **`bezoek`**.
   Zonder dat veld rendert het rapport wél, maar valt hij terug op het meest
   recente bezoek van het dossier.
6. Optioneel een tweede veld voor een eigen inleidingstekst.
7. Klik **Template controleren**: elke tag moet bekend zijn.

Meerdere sjablonen van dezelfde soort naast elkaar zijn toegestaan — dat zijn de
varianten waar de opsteller uit kiest (bijvoorbeeld één mét en één zónder
opvolgingshoofdstuk). Gebruik de knop **Kopiëren**; die maakt een eigen .docx en
eigen briefpapier aan.

## Gebruiken

Op de Oplevering-tab, in het kwaliteitsblok en op het inspectiedetail staat de knop
**Rapport opstellen**. Het bezoek waar je op dat moment naar kijkt, staat voorgevuld.

> Een **projectbezoek** verschijnt pas in de bronkiezer als het is **afgerond**;
> zolang het concept is, staat het er niet tussen en valt het rapport terug op de
> meest recente andere bron. Mis je de voortgang of zie je onverwacht
> kwaliteitsgegevens, kijk dan eerst welke bron er gekozen is. Daarna: preview → PDF → archiveren in de
dossiermap → eventueel vrijgeven in het klantportaal.

> Een bezoekrapport opstellen vereist dat EVA met Microsoft verbonden is: de
> omzetting naar PDF loopt via Word Online. Lukt dat niet, dan wordt er niets
> gearchiveerd en niets vrijgegeven — je krijgt een melding en probeert het
> opnieuw.

---

## Variabelen

### Kop en samenvatting

| Tag | Betekenis |
|---|---|
| `{bezoek.soort_label}` | "Projectbezoek", "Kwaliteitsronde", "Oplevering", "Veiligheidsronde" of "Inspectie" — de titel op het voorblad |
| `{bezoek.disciplines_regel}` | De uitgevoerde disciplines als één regel (alleen de namen; de percentages staan in het hoofdstuk Voortgang). Alleen bij een projectbezoek |
| `{bezoek.kenmerk}` | Inspectienummer, naam van het oplevermoment of van het formulier |
| `{bezoek.datum}` `{bezoek.tijd}` | Wanneer het bezoek plaatsvond |
| `{bezoek.uitvoerder}` | Wie het bezoek deed |
| `{bezoek.locatie}` | Het bekeken gebied |
| `{bezoek.omstandigheden}` | Weer |
| `{bezoek.werkzaamheden}` | Wat er op dat moment in uitvoering was |
| `{bezoek.inleiding}` | Vrije tekst op het voorblad |
| `{bezoek.samenvatting_regel}` | Eén zin met de uitkomst |
| `{bezoek.opmerkingen}` | Algemene opmerkingen |
| `{bezoek.disclaimer}` | Vaste toelichting — **komt uit de code**, zodat hij op elk rapport identiek is |

Daarnaast gelden alle gewone documentvariabelen: `{dossier.*}`, `{klant.*}`,
`{bedrijf.*}`, `{document.*}`, `{%logo}` en de zes projectrollen.

### Kengetallen

```
{#bezoek.heeft_kengetallen}
  {#bezoek.kengetallen}{label}  {waarde}{/bezoek.kengetallen}
{/bezoek.heeft_kengetallen}
```
Een rij-loop en geen vaste kolommenstrook: elke bron levert andere getallen, en
een vaste strook zou bij een oplevering half leeg staan.

**Bewust altijd absolute aantallen, nooit een percentage.** Een steekproef
rechtvaardigt geen "96 % kwaliteit".

### Bevindingen

```
{#bezoek.heeft_bevindingen}
  {#bezoek.paginas}
    {#bevindingen}  …één blok per bevinding…  {/bevindingen}
    {#niet_laatste}⏎(paginabreuk){/niet_laatste}
  {/bezoek.paginas}
{/bezoek.heeft_bevindingen}
```

Binnen `{#bevindingen}`: `{nummer}`, `{titel}`, `{omschrijving_kort}`,
`{locatie}`, `{groep}`, `{ernst_label}`, `{status_label}`, `{eis_kort}`,
`{meting}`, `{actie_kort}`, `{datum}`, `{hersteldatum}`, plus de foto's
`{%bevinding_foto}` en — achter `{#heeft_foto_na}` — `{%bevinding_foto_na}`.

### Voortgang (alleen een projectbezoek)

```
{#bezoek.heeft_disciplines}
  Voortgang
  DISCIPLINE            GEREED
  {#bezoek.disciplines}{discipline_naam}   {voortgang_label}{/bezoek.disciplines}
{/bezoek.heeft_disciplines}
```

Een tabel vlak na de samenvatting, vóór de bevindingen: dit is wat een opdrachtgever als
eerste wil weten. `{voortgang_label}` is `"60 %"`, of een streepje wanneer er niets is
opgegeven — *niet beoordeeld* is iets anders dan *0 % gereed*.

### Per onderdeel (alleen een projectbezoek)

```
{#bezoek.heeft_disciplines}
  {#bezoek.disciplines}
     {discipline_naam}
     {#heeft_voortgang}Voortgang: {voortgang_label}{/heeft_voortgang}
     {#heeft_disciplinepunten}
       {#disciplinepunten}
         {nummer}  {tekst_kort}   {%disciplinefoto}
         {#is_aandachtspunt}Aandachtspunt {aandachtspunt_nummer} - {status_label}{/is_aandachtspunt}
       {/disciplinepunten}
     {/heeft_disciplinepunten}
     {^heeft_disciplinepunten}Geen bijzonderheden.{/heeft_disciplinepunten}
  {/bezoek.disciplines}
{/bezoek.heeft_disciplines}
```

> **Let op de namen.** De loop binnen een discipline heet `{#disciplinepunten}` en
> niet `{#punten}`, en de naam van de discipline is `{discipline_naam}` en niet
> `{naam}`. Het blok heeft die twee namen namelijk al op een hoger niveau (de
> checklist van een kwaliteitsronde, en de ondertekenaars), en de sjabloonmotor
> lost een tag op in de *binnenste* passende scope. Hergebruik je die namen, dan
> krijg je geen foutmelding maar wél een rapport dat het verkeerde blok herhaalt.

### Overige loops

| Loop | Tags binnenin |
|---|---|
| `{#bezoek.metingen}` | `{code}` `{onderdeel}` `{locatie}` `{meting}` `{eis}` `{meetmiddel}` `{resultaat}` |
| `{#bezoek.punten}` | `{code}` `{groep}` `{onderdeel}` `{resultaat}` `{opmerking}` |
| `{#bezoek.waarnemingen}` | `{omschrijving}` `{locatie}` `{groep}` `{%waarneming_foto}` |
| `{#bezoek.opvolging}` | `{nummer}` `{omschrijving}` `{locatie}` `{status_label}` `{hercontrole}` |
| `{#bezoek.handtekeningen}` | `{rol_label}` `{naam}` `{datum}`, `{%beeld}` achter `{#heeft_beeld}`, en `{^heeft_beeld}` voor "digitaal akkoord" |

---

## Valkuilen bij het bewerken

Deze .docx is **gegenereerd** door `apps/dashboard/scripts/maak-bezoeksjabloon.mjs`
en niet met de hand in Word gemaakt. Dat is geen toeval: Word knipt bij het
bewerken een tag als `{bezoek.kenmerk}` graag op in losse stukken, en daar loopt
de sjabloonmotor op stuk. Door de XML zelf te schrijven staat elke tag
gegarandeerd in één stuk.

Bewerk je het sjabloon in Word, houd dan dit aan:

1. **Draai na elke bewerking "Template controleren".** Dat vangt opgeknipte tags
   (foutmelding "onbekende variabele" of "tag niet gesloten").
2. **Een `{%…}`-tag moet alleen in zijn eigen alinea staan.** Zet er geen tekst
   naast; in een tabelcel krijgt hij een eigen regel. Anders weigert Word het
   beeld met "raw_xml_tag_should_be_only_text_in_paragraph".
3. **Zet geen sectie-einde in het document.** Het briefpapier wordt onder élke
   pagina gelegd; een tweede sectie met eigen paginaopmaak loopt daarmee uit de
   pas.
4. **Gebruik `{@paginabreuk}` niet.** Die tag staat nog in de variabelenlijst,
   maar er is geen module voor geregistreerd — de XML komt dan zichtbaar in het
   document te staan. Gebruik `{#niet_laatste}` met een echte paginabreuk
   (Ctrl+Enter) ertussen.
5. **Laat de bevindingenrij op een vaste rijhoogte staan** (3,8 cm) met
   *Rijen niet over pagina's splitsen* aan. Samen met het opknippen aan de
   serverkant is dát wat garandeert dat een bevinding nooit over twee pagina's
   valt. Verhoog je het aantal bevindingen per pagina, verlaag dan de rijhoogte
   mee.
6. **Een loop-tag die alleen in zijn alinea staat, verdwijnt bij het renderen.**
   Zet er dus geen tekst naast die je wél wilt zien.

## Opnieuw genereren

```bash
node apps/dashboard/scripts/maak-bezoeksjabloon.mjs
```
Overschrijft `docs/document-sjablonen/Bezoekrapport.docx`. De gedeelde
opmaak-bouwstenen (koppen, tabellen, grijstinten) staan in
`apps/dashboard/scripts/lib/docx-bouwstenen.mjs` en worden gedeeld met de andere
sjabloon-generatoren — daar komt de gemeenschappelijke uitstraling vandaan.
