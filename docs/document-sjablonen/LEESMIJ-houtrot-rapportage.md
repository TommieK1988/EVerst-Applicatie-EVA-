# Startsjablonen — Houtrot-rapportage

Er zijn **twee** kant-en-klare Word-sjablonen, die alleen verschillen in wat de klant te
zien krijgt:

| Bestand | Voor wie |
|---|---|
| `Houtrot-rapportage-met-prijzen.docx` | intern en richting opdrachtgever mét prijsafspraak |
| `Houtrot-rapportage-zonder-prijzen.docx` | richting bewoners, VvE-leden of een opdrachtgever die alleen het werk wil zien |

Allebei hebben ze: een voorblad met dossiergegevens, drie registraties per pagina met de
foto's voor/tijdens/na naast elkaar, en een totaalblad. Op dat totaalblad staat **één regel
per werkzaamheid**, opgeteld over alle registraties. In de versie mét prijzen staan daar de
eenheidsprijs, het btw-percentage en het regeltotaal bij, met daaronder een **btw-opstelling
per tarief** en het bedrag **inclusief btw**.

Richt ze allebei in; bij het opstellen kies je welke je pakt (zie hieronder).

## Eenmalig instellen (Instellingen → Document-sjablonen)

1. **Nieuw sjabloon**.
2. Vul in:
   - **Naam**: bv. "Houtrot-rapportage (met prijzen)"
   - **Documentsoort**: **Houtrot-rapportage** ← dit is bepalend; alleen bij deze soort
     haalt EVA de registraties, foto's en locatie-indeling op.
3. Koppel bij **Word-template** het bestand `Houtrot-rapportage-met-prijzen.docx`.
4. Voeg onderaan bij **Invoervelden** één veld toe — dit is de **instelling van het
   sjabloon**, geen vraag aan de opsteller:
   - **Sleutel**: `houtrot`  ← moet exact zo heten
   - **Label**: bv. "Instellingen rapportage"
   - **Type**: **Houtrot-rapportage (filters)**
   - **Verplicht**: nee
   - **Standaardwaarde**: `{"per_pagina":3,"niveau":0,"toon_prijzen":true}`
     — en `"toon_prijzen":false` bij het sjabloon zonder prijzen.

   `toon_prijzen` moet passen bij het Word-bestand. Zet je hem op `false` bij een
   bestand dát prijskolommen heeft, dan krijgt de opdrachtgever een rapport met lege
   kolommen en een lege btw-opstelling. Vandaar twee sjablonen in plaats van een vinkje.
5. (Optioneel) koppel **briefpapier**. Let op: het briefpapier komt onder *élke* pagina,
   dus ook onder de fotopagina's. Wil je dat niet, laat het dan leeg.
6. Opslaan.

Herhaal dit voor de tweede versie: naam "Houtrot-rapportage (zonder prijzen)",
bestand `Houtrot-rapportage-zonder-prijzen.docx`, standaardwaarde
`{"per_pagina":3,"niveau":0,"toon_prijzen":false}`.

Het sjabloon verschijnt alleen bij dossiers waar de toggle **Houtrot registreren** aanstaat.

## Gebruiken (in een dossier)

Dossier → **Opdracht → Houtrot** → knop **Rapportage**. Je kiest één ding: **welk
sjabloon** — met of zonder prijzen. Verder valt er niets in te stellen; wat er in de
rapportage komt (aantal per pagina, groepering, statusfilter) staat vast op het sjabloon.

Daarna **PDF**, **Bewerken in Word** of **Mailen**, precies als bij de andere documenten.
Met "Opslaan in de SharePoint-dossiermap" komt de rapportage in het dossierarchief.

Is er maar één rapportagesjabloon, dan slaat de knop de keuzelijst over.

## Nooit een registratie over twee pagina's

Dat is een harde eis en het sjabloon is er op gebouwd. Drie dingen zorgen daarvoor —
laat ze staan als je het bestand aanpast:

1. **EVA knipt de registraties zelf in pagina's** van het gekozen aantal. Na elke pagina
   staat een paginabreuk, behalve na de laatste (dus geen lege slotpagina).
2. **De fotorij heeft een exacte hoogte van 3,8 cm.** De foto's worden nooit hoger dan
   3,57 cm, staand of liggend — dat is wiskundig begrensd, niet toevallig. De rij kan dus
   niet uitzetten.
3. **"Rijen niet over pagina's splitsen" staat aan** op alle tabellen. Mocht een blok
   ooit tóch te hoog worden, dan schuift Word het hele blok door in plaats van het te
   splitsen.

Maak je het blok groter (extra regels, grotere letter), verlaag dan het aantal per
pagina. Gebruik in de vaste indeling `{werkzaamheden_kort}` en `{schade_kort}` — die
worden afgekapt en houden de hoogte voorspelbaar. `{werkzaamheden_tekst}` en `{schade}`
zijn volledig en kunnen dus over meerdere regels lopen.

**De werkzaamheden-rij is 0,78 cm hoog (exact), goed voor drie regels tekst.** Dat hoort bij
de afkapping van `{werkzaamheden_kort}` op 250 tekens. Verklein je die rij, dan valt de
laatste regel weg; vergroot je hem, dan passen er bij drie registraties per pagina nog
ongeveer 0,8 cm per blok bij voordat de derde registratie van de pagina valt.

## De tags in het Word-bestand

Het volledige overzicht staat in het sjabloonscherm onder **Variabelen**. De kern:

### Voorblad
Alle gewone dossiervariabelen werken hier: `{dossier.titel}`, `{dossier.dossiernummer}`,
`{dossier.werkadres}`, `{klant.naam}`, `{projectleider.naam}`, `{%logo}`, `{document.datum}`.
Daarnaast `{houtrot.aantal}` en `{houtrot.filter_omschrijving}` (de toegepaste filters in tekst).

### Registratiepagina's
```
{#houtrot.paginas}
   pagina {pagina_nummer} van {houtrot.aantal_paginas}
   {#registraties}
        {nummer}. {locatie_pad}          ← locatie boven
        {%foto_voor} {%foto_tijdens} {%foto_na}   ← drie kolommen
        {werkzaamheden_kort}             ← werkzaamheden onder
        {schade_kort}   {bedragen.verkoop}
   {/registraties}
   {#niet_laatste}[handmatige paginabreuk]{/niet_laatste}
{/houtrot.paginas}
```

Verder per registratie: `{datum}`, `{loc1}` `{loc2}` `{loc3}` (los per niveau),
`{status_label}`, `{ernst_label}`, `{oorzaak}`, `{notitie}`, `{medewerker}`,
`{bedragen.uren}`, `{bedragen.kostprijs}`, en de regels apart met
`{#werkzaamheden}{aantal}× {code} {naam} ({eenheid}) — {totaal}{/werkzaamheden}`.

### Totaalblad — werkzaamheden opgeteld
Eén regel per soort werk, over álle registraties bij elkaar. Zet de open- en sluittag in
**dezelfde tabelrij** (eerste en laatste cel), dan herhaalt Word die rij.
```
WERKZAAMHEID          AANTAL  EENHEID  EENHEIDSPRIJS  BTW        TOTAAL
{#houtrot.werkzaamheden}{naam}  {aantal}  {eenheid}  {prijs_per_stuk}  {btw_pct}  {totaal}{/houtrot.werkzaamheden}
```
Ook beschikbaar per regel: `{code}` en `{uren}`.

Regels worden gegroepeerd op werkzaamheid **én** eenheidsprijs. Is dezelfde werkzaamheid
tussentijds duurder geworden, dan krijg je twee regels — anders zou `aantal × eenheidsprijs`
niet meer op het regeltotaal uitkomen.

### Totaalblad — btw-opstelling
```
TARIEF      BEDRAG EXCL.  BTW      BEDRAG INCL.
{#houtrot.btw}{label}  {excl}  {btw}  {incl}{/houtrot.btw}
Totaal exclusief btw   {houtrot.totaal.excl}  {houtrot.totaal.btw}  {houtrot.totaal.incl}
```
Het btw-percentage van een werkzaamheid komt uit de **eenheidsprijs** — zie hieronder.
Verlegde tarieven krijgen een eigen regel, ook als het percentage gelijk is.

### Totaalblad — gegroepeerd per locatie (alternatief)
De oude opzet werkt nog steeds, mocht je hem ergens willen gebruiken:
```
{#houtrot.groepen}
   {naam} ({niveau_label}) — {aantal} registraties — {totaal.verkoop}
   {#registraties}{nummer} | {locatie_pad} | {werkzaamheden_kort} | {bedragen.verkoop}{/registraties}
{/houtrot.groepen}
```
`{#houtrot.alle_registraties}…{/houtrot.alle_registraties}` geeft één ongegroepeerde lijst.

## Btw per werkzaamheid

Het btw-percentage komt uit de **eenheidsprijs**: Calculatie → Bibliotheek, kolom Btw
(hoog 21% of laag 9%). Wijzig je het daar, dan werkt dat door in elke rapportage. Er is
geen aparte btw-instelling per dossier of per opdrachtgever.

## Aandachtspunten

- **Fototags moeten alléén in hun eigen alinea staan** (`{%foto_voor}` in een lege
  tabelcel). Staat er tekst naast, dan mislukt het renderen.
- **Prijzen weglaten doe je met een eigen sjabloon.** Staat `toon_prijzen` op `false`,
  dan zijn álle bedragvelden leeg — ook `{bedragen.verkoop}` buiten een
  `{#toon_prijzen}`-blok, dus er kan niets lekken. Haal in dat sjabloon ook de
  prijskolommen en de btw-opstelling weg, anders staan er lege kolommen op papier.
- **Ontbrekende foto's zijn geen probleem**: die cel blijft leeg, de registratie blijft staan.
- **Grenzen**: maximaal 150 registraties per rapportage, en samen maximaal ±35 MB aan
  foto's. Daarboven krijg je een melding met het advies je filter aan te scherpen; boven
  75 registraties duurt het opstellen merkbaar langer.
- **De preview toont bewust maar een paar registraties** (twee pagina's). Zonder die rem
  zou elke verversing het hele rapport opnieuw bouwen.

## Werkt het niet?

- Zie je de knop **Rapportage** niet? Dan staat de dossier-toggle *Houtrot registreren*
  uit, of er is nog geen sjabloon met documentsoort *Houtrot-rapportage*.
- Klopt het aantal per pagina niet? Vergelijk het getal in het opstelscherm met het
  aantal blokken in je Word-bestand.
- Onbekende variabelen bij **Template controleren**? Vergelijk de tag met de lijst in
  het variabelenpaneel; loop-interne tags werken alleen tússen hun `{#…}` en `{/…}`.
