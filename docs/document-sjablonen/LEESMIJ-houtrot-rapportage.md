# Startsjabloon — Houtrot-rapportage

Het bestand **`Houtrot-rapportage.docx`** is een kant-en-klaar Word-sjabloon: voorblad met
dossiergegevens, drie registraties per pagina met de foto's voor/tijdens/na naast elkaar,
en een totaalblad gegroepeerd per niveau van de locatie-indeling.

Je maakt er zoveel **versies** van als je wilt — bijvoorbeeld één mét en één zónder
verkoopprijzen. Elke versie is gewoon een eigen sjabloonrij met een eigen Word-bestand;
daar komt geen programmeerwerk bij kijken.

## Eenmalig instellen (Instellingen → Document-sjablonen)

1. **Nieuw sjabloon**.
2. Vul in:
   - **Naam**: bv. "Houtrot-rapportage (met prijzen)"
   - **Documentsoort**: **Houtrot-rapportage** ← dit is bepalend; alleen bij deze soort
     haalt EVA de registraties, foto's en locatie-indeling op.
3. Koppel bij **Word-template** het bestand `Houtrot-rapportage.docx`.
4. Voeg onderaan bij **Invoervelden** één veld toe:
   - **Sleutel**: `houtrot`  ← moet exact zo heten
   - **Label**: bv. "Wat komt er in de rapportage"
   - **Type**: **Houtrot-rapportage (filters)**
   - **Verplicht**: nee
   - **Standaardwaarde**: `{"per_pagina":3,"niveau":0,"toon_prijzen":true}`
     (of laat leeg; dan geldt precies dezelfde standaard)
5. (Optioneel) koppel **briefpapier**. Let op: het briefpapier komt onder *élke* pagina,
   dus ook onder de fotopagina's. Wil je dat niet, laat het dan leeg.
6. Opslaan.

Voor een versie **zonder prijzen** herhaal je dit met een kopie van het Word-bestand
waarin je de bedragen weghaalt, en zet je de standaardwaarde op
`{"per_pagina":3,"niveau":0,"toon_prijzen":false}`.

Het sjabloon verschijnt alleen bij dossiers waar de toggle **Houtrot registreren** aanstaat.

## Gebruiken (in een dossier)

Dossier → **Opdracht → Houtrot** → knop **Rapportage**. Bij het opstellen kies je:

- **welke registraties** (statusfilter, en eventueel één tak van de locatie-indeling);
- **waarop het totaalblad groepeert** (bijv. per gevelzijde);
- **hoeveel registraties per pagina** — moet overeenkomen met het sjabloon;
- **of verkoopprijzen mee mogen**.

Onderin zie je live hoeveel registraties en pagina's dat oplevert. Daarna **PDF**,
**Bewerken in Word** of **Mailen**, precies als bij de andere documenten. Met
"Opslaan in de SharePoint-dossiermap" komt de rapportage in het dossierarchief.

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

### Totaalblad
```
{#houtrot.groepen}
   {naam} ({niveau_label}) — {aantal} registraties — {totaal.verkoop}
   {#registraties}{nummer} | {locatie_pad} | {werkzaamheden_kort} | {bedragen.verkoop}{/registraties}
{/houtrot.groepen}
Totaal: {houtrot.totaal.verkoop} · {houtrot.totaal.uren} uur
```

`{#houtrot.alle_registraties}…{/houtrot.alle_registraties}` geeft één ongegroepeerde lijst.

## Aandachtspunten

- **Fototags moeten alléén in hun eigen alinea staan** (`{%foto_voor}` in een lege
  tabelcel). Staat er tekst naast, dan mislukt het renderen.
- **Prijzen weglaten doe je met de vinkbox, niet door tags te vergeten.** Staat
  "Verkoopprijzen tonen" uit, dan zijn alle bedragvelden leeg — ook `{bedragen.verkoop}`
  buiten een `{#toon_prijzen}`-blok. Er kan dus niets lekken.
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
