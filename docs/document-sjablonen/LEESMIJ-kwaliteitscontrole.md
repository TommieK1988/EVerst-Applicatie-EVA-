# Startsjabloon — Kwaliteitscontrole-rapport

Het bestand **`Kwaliteitscontrole.docx`** is een kant-en-klaar Word-sjabloon voor het rapport dat
na een kwaliteitsronde naar de opdrachtgever gaat: voorblad met projectgegevens, inleiding,
samenvatting, metingentabel, positieve waarnemingen, aandachtspunten met foto, opvolging van
eerdere inspecties en de vaste disclaimer.

Je maakt er zoveel **versies** van als je wilt — bijvoorbeeld één voor corporaties en één voor
VvE's. Elke versie is gewoon een eigen sjabloonrij met een eigen Word-bestand; daar komt geen
programmeerwerk bij kijken.

Het sjabloon is gegenereerd met `apps/dashboard/scripts/maak-kwaliteitssjabloon.mjs`. Wil je de
opmaak grondig veranderen, doe dat dan gewoon in Word — het script is er alleen om een schone
startversie te kunnen maken.

## Eenmalig instellen (Instellingen → Document-sjablonen)

1. **Nieuw sjabloon**.
2. Vul in:
   - **Naam**: bv. "Kwaliteitscontrole-rapport"
   - **Documentsoort**: **Kwaliteitscontrole-rapport** ← dit is bepalend; alleen bij deze soort
     haalt EVA de inspectie, de metingen, de afwijkingen en de foto's op.
3. Koppel bij **Word-template** het bestand `Kwaliteitscontrole.docx`.
4. Voeg onderaan bij **Invoervelden** één veld toe:
   - **Sleutel**: `kwaliteit`  ← moet exact zo heten
   - **Label**: bv. "Welke inspectie"
   - **Type**: **Kwaliteitsrapport (inspectie kiezen)**
   - **Verplicht**: nee
   - **Standaardwaarde**: leeg laten (dan geldt: meest recente definitieve inspectie, met
     positieve waarnemingen en opvolging erin)
5. (Optioneel) koppel **briefpapier**. Let op: het briefpapier komt onder *élke* pagina, dus ook
   onder de fotopagina's.
6. Opslaan.

## Gebruiken

Twee ingangen, allebei dezelfde modal:

- **KAM → Kwaliteitsinspecties → open een inspectie → knop "Rapport opstellen"**. De inspectie die
  je op dat moment bekijkt staat dan al voorgeselecteerd.
- **Opdracht → tab VCA & Kwaliteit → knop "Rapport opstellen"** in het kwaliteitsblok.

Bij het opstellen kies je:

- **welke inspectie** (alleen definitieve inspecties; een concept is nog niet af);
- of de **positieve kwaliteitswaarnemingen** mee moeten (standaard aan);
- of het hoofdstuk **opvolging eerdere inspecties** mee moet (standaard aan);
- of **niet beoordeelde punten** in de puntenlijst komen (standaard aan);
- **hoeveel afwijkingen per pagina** (hoort bij de indeling van het Word-bestand — wijzig dit
  alleen als je het sjabloon erop hebt ingericht).

Daarna kun je previewen, als PDF downloaden, in Word Online bewerken, archiveren in de
dossiermap en mailen — precies zoals bij elk ander document.

## Beschikbare variabelen

Naast de gewone documentvariabelen (`{dossier.*}`, `{klant.*}`, `{projectleider.*}`,
`{bedrijf.*}`, `{document.*}`, `{%logo}`) heeft dit sjabloon een eigen blok `{kwaliteit.*}`.

### Kopgegevens

| Tag | Wat er komt te staan |
|---|---|
| `{kwaliteit.inspectienummer}` | KC-2026-001 |
| `{kwaliteit.datum}` / `{kwaliteit.tijd}` | 25 augustus 2026 / 10:15 |
| `{kwaliteit.inspecteur}` | Naam van de opzichter |
| `{kwaliteit.weer}` | Weersomstandigheden, als ingevuld |
| `{kwaliteit.werkzaamheden}` | Korte omschrijving van de aanwezige werkzaamheden |
| `{kwaliteit.gebied}` | Welk deel van het project is gelopen |
| `{kwaliteit.disciplines}` | "Algemeen, Schilderwerk hout, Kitwerk gevel" |
| `{#kwaliteit.disciplines_lijst}{naam}{/kwaliteit.disciplines_lijst}` | Zelfde, als lijst om op te sommen |

### Samenvatting

| Tag | Wat er komt te staan |
|---|---|
| `{kwaliteit.samenvatting_regel}` | Eén zin met alle aantallen |
| `{kwaliteit.totaal_beoordeeld}` | Aantal beoordeelde punten (N.v.t. telt niet mee) |
| `{kwaliteit.totaal_voldoet}` | Aantal dat voldoet |
| `{kwaliteit.totaal_voldoet_niet}` | Aantal afgekeurde punten |
| `{kwaliteit.totaal_niet_beoordeeld}` | Punten die niet betrouwbaar te beoordelen waren |
| `{kwaliteit.totaal_nvt}` / `{kwaliteit.totaal_nader_onderzoek}` | Idem |
| `{kwaliteit.aantal_kritiek}` | Kritieke afwijkingen |
| `{kwaliteit.aantal_technisch}` / `{...esthetisch}` / `{...observatie}` | Afwijkingen per ernst |
| `{kwaliteit.steekproef}` | "4 van 20 bekeken elementen wijkt af." — leeg als niet ingevuld |

> **Bewust geen kwaliteitspercentage.** Een steekproef rechtvaardigt geen "96% kwaliteit"; er
> komen daarom alleen absolute aantallen uit. Zet er zelf ook geen percentage-formule op.

### Technische metingen

Alleen **daadwerkelijk uitgevoerde** metingen komen hierin; een niet-uitgevoerde meting is geen
resultaat en hoort niet in een rapport.

```
{#kwaliteit.heeft_metingen}
  {#kwaliteit.metingen}
    {code}  {onderdeel}  {locatie}  {meting}  {eis}  {meetmiddel}  {resultaat}
  {/kwaliteit.metingen}
{/kwaliteit.heeft_metingen}
```

`{voldoet}` is een ja/nee-vlag; bruikbaar als `{#voldoet}…{/voldoet}` of
`{^voldoet}…{/voldoet}` om een regel anders op te maken.

### Positieve kwaliteitswaarnemingen

```
{#kwaliteit.heeft_waarnemingen}
  {#kwaliteit.waarnemingen}
    {%foto_klein}   {omschrijving}   {discipline}   {locatie}
  {/kwaliteit.waarnemingen}
{/kwaliteit.heeft_waarnemingen}
```

`{%foto_klein}` en `{%foto}` tonen dezelfde foto; de tagnaam bepaalt alleen hoe groot hij wordt
(klein = 120×90 px, gewoon = 180×135 px).

### Aandachtspunten (de afwijkingen)

De afwijkingen zijn server-side al in pagina's geknipt, zodat er een vast aantal per pagina komt
en een afwijking nooit over twee pagina's valt:

```
{#kwaliteit.heeft_afwijkingen}
  {#kwaliteit.paginas}
    {#regels}
      {nummer} {ernst} {omschrijving_kort} {locatie} {discipline} {code}
      {eis_kort} {meting} {status} {actie_kort} {hersteldatum} {datum} {%foto}
    {/regels}
    {#niet_laatste}<paginabreuk>{/niet_laatste}
  {/kwaliteit.paginas}
{/kwaliteit.heeft_afwijkingen}
```

- `{omschrijving}` / `{eis}` / `{actie}` zijn de volledige teksten; `*_kort` zijn afgekapt zodat
  de blokhoogte voorspelbaar blijft.
- `{kritiek}` is een ja/nee-vlag om een kritieke afwijking te laten opvallen:
  `{#kritiek}KRITIEK{/kritiek}`.
- De paginabreuk staat als **echte** Word-paginabreuk binnen `{#niet_laatste}`. Gebruik daar geen
  `{@…}`-tag voor: er is geen raw-XML-module geregistreerd, dus die zou als zichtbare tekst in het
  rapport belanden.
- Wil je een ander aantal per pagina, pas dan zowel de instelling bij het opstellen als de
  rijhoogte in het Word-bestand aan.

### Opvolging eerdere inspecties

```
{#kwaliteit.heeft_opvolging}
  {kwaliteit.opvolging_regel}
  {#kwaliteit.opvolging}
    {nummer} {discipline} {locatie} {omschrijving} {ernst} {status} {hercontrole}
  {/kwaliteit.opvolging}
{/kwaliteit.heeft_opvolging}
```

`{hersteld}` is een ja/nee-vlag.

### Afsluiting

| Tag | Wat er komt te staan |
|---|---|
| `{kwaliteit.algemene_opmerkingen}` | Vrije tekst van de inspecteur |
| `{kwaliteit.disclaimer}` | De vaste toelichting over de steekproef |

> De disclaimer komt uit de code en niet uit het sjabloon, zodat hij op elk rapport identiek is en
> niet per ongeluk uit een sjabloon verdwijnt. Laat `{kwaliteit.disclaimer}` er dus in staan.

## Waar de grenswaarden vandaan komen

Wat er bij **Eis** in het rapport staat, is de eis zoals die **op het inspectiemoment** gold —
niet de eis van vandaag. Stelt de beheerder later een grenswaarde bij in de kwaliteitsbibliotheek,
dan verandert een al verzonden rapport daar niet door.

De meeste grenswaarden staan geclassificeerd als **interne bedrijfsnorm**, ook als ze op een norm
zijn gebaseerd. Pas als iemand de norm daadwerkelijk heeft nageslagen zet je een controlepunt in
de bibliotheek op "Norm". Zo staat er nooit een niet-geverifieerde NEN- of BRL-claim in een
rapport aan een opdrachtgever.

## Grenzen

- Meer dan **120 afwijkingen** in één rapport wordt geweigerd met een leesbare melding; kies dan
  een andere inspectie.
- Foto's worden server-side verkleind (380 px, JPEG). Boven een totaal van 35 MB aan foto's vallen
  de resterende foto's weg in plaats van dat de hele conversie klapt.
- Bronbestanden groter dan 12 MB worden overgeslagen.
