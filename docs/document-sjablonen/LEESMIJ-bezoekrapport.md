# Bezoekrapport — één rapportage voor elke controle

`Bezoekrapport.docx` is het startsjabloon voor **één** rapportage over een
projectbezoek, ongeacht wat er gecontroleerd is: een kwaliteitsronde, een
oplevering, een veiligheidsronde (VCA) of een ingevuld inspectieformulier.

Er is bewust geen apart opleverrapport, kwaliteitsrapport en formulierrapport.
Elk hoofdstuk staat achter een `{#bezoek.heeft_…}`-conditie, dus een bron die
iets niet kent, laat dat hoofdstuk vanzelf verdwijnen. De klant ziet daardoor
altijd hetzelfde document, met andere hoofdstukken erin.

| Hoofdstuk | Kwaliteitsronde | Oplevering | Veiligheidsronde | Inspectieformulier |
|---|:--:|:--:|:--:|:--:|
| Voorblad, inleiding, samenvatting | ✓ | ✓ | ✓ | ✓ |
| Bevindingen | ✓ | ✓ | ✓ | ✓ |
| Metingen | ✓ | – | – | – |
| Wat er is beoordeeld | ✓ | – | ✓ | ✓ |
| Wat er goed ging | ✓ | – | ✓ | – |
| Opvolging van eerdere bezoeken | ✓ | – | ✓ | – |
| Ondertekening | – | ✓ | ✓ | ✓ |

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

Op de Oplevering-tab, in het kwaliteitsblok, op het inspectiedetail en bij een
formulierinzending staat de knop **Rapport opstellen**. Het bezoek waar je op dat
moment naar kijkt, staat voorgevuld. Daarna: preview → PDF → archiveren in de
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
| `{bezoek.soort_label}` | "Kwaliteitsronde", "Oplevering", "Veiligheidsronde" of "Inspectie" — de titel op het voorblad |
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
