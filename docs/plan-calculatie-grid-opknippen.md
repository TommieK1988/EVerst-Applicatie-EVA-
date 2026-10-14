# Plan — CalculatieGrid opknippen

**Status:** plan, nog niet uitgevoerd · **Datum:** 14 oktober 2026 · **Hoort bij:** fase 0 van
het plan "Calculatie opruimen"; uitvoering in fase 3.

## Waarom

`apps/dashboard/src/components/everts-calc/calculatie/CalculatieGrid.tsx` is 3.562 regels. Bijna
alle verborgen hover-acties uit het plan zitten hierin, dus fase 3 (zichtbare acties) en fase 4
(normen, werkomschrijving, behandeling) raken dit bestand. Met de norm uit
`DEVELOPMENT_STANDARDS.md` §2.1 (400 regels, verantwoorden boven 800) is wijzigen in één bestand
van deze omvang riskant: elke review moet het geheel overzien, en de schuldteller telt het als
een van de 33 bestanden boven 800 regels.

Uitgangspunt: **eerst verplaatsen, dan veranderen.** Het opknippen gebeurt in stappen die niets
aan het gedrag wijzigen, elk als eigen commit. Pas daarna komen de nieuwe knoppen.

## Huidige opbouw

| Regels | Onderdeel | Omvang |
|---|---|---|
| 44–181 | Props, kolomdefinities (`ColId`, `COL_DEFS`), layout ↔ state | ~140 |
| 182–236 | `GetalInput` | ~55 |
| 237–356 | `TabelHeader`, `KolomNaamVeld` | ~120 |
| 357–428 | `OmschrijvingVeld` | ~70 |
| 429–756 | `ComponentRegelRij` (normregel) | ~330 |
| 757–856 | `OpslaanAlsReceptModal` | ~100 |
| 857–1003 | `kiesBtwTarief`, `TekstregelRij`, `RegelRijProps` | ~150 |
| 1004–1824 | `CalculatieregelRij` (cellen, werkomschrijving, afbeeldingen, normen, behandeling) | ~820 |
| 1825–2167 | `GroepSectie` (recursief, groepskop en groepstotalen) | ~340 |
| 2168–3562 | `CalculatieGrid` zelf | ~1.390 |

Binnen de hoofdcomponent:

| Regels | Onderdeel |
|---|---|
| 2222–2420 | Kolomlayouts en kolomnamen laden en bewaren |
| 2420–2530 | Laden, undo (snapshots), in- en uitklappen, imperatieve handle |
| 2531–2686 | Selectie en sneltoetsen |
| 2686–2800 | Acties op een selectie (kopiëren, verwijderen, verplaatsen, opslag%, BTW) |
| 2800–2915 | Kolommen verslepen en breedte, regels verslepen |
| 2915–3068 | Mutaties (regel, component, groep toevoegen en wijzigen) |
| 3069–3562 | Rendering, kolomkiezer, selectiebalk, dialogen |

## Doelopbouw

Een map `calculatie/grid/` naast het huidige bestand:

| Bestand | Inhoud | Richtomvang |
|---|---|---|
| `kolommen.ts` | `ColId`, `ColDef`, `COL_DEFS`, `COL_MAP`, layout ↔ state | ~150 |
| `GetalInput.tsx`, `OmschrijvingVeld.tsx` | invoervelden | ~130 |
| `TabelHeader.tsx` | kolomkoppen en `KolomNaamVeld` | ~120 |
| `ComponentRegelRij.tsx` | één normregel | ~330 |
| `OpslaanAlsReceptModal.tsx` | venster recept (wordt in fase 7 herbouwd) | ~100 |
| `TekstregelRij.tsx` | tekstregel | ~100 |
| `CalculatieregelRij.tsx` | de regel zelf, cellen | ~400 |
| `RegelDetail.tsx` | uitklapdeel: werkomschrijving, afbeeldingen, normen, behandeling | ~420 |
| `GroepSectie.tsx` | groep, recursief | ~340 |
| `useKolomLayouts.ts` | layouts, kolomnamen, breedte, volgorde | ~250 |
| `useGridGeschiedenis.ts` | laden, snapshots, undo | ~110 |
| `useSelectie.ts` | selectie, sneltoetsen, acties op een selectie | ~300 |
| `useGridMutaties.ts` | toevoegen, wijzigen, verwijderen, verplaatsen | ~300 |
| `CalculatieGrid.tsx` | samenstelling en rendering | ~400 |

Daarmee zakt elk bestand onder de 800 regels en de schuldteller van 33 naar 32.

## Volgorde

Elke stap: alleen verplaatsen, geen gedrag wijzigen, type-check, lint en tests groen, kort
nagelopen op de Vercel-preview van de PR.

1. **Pure delen eerst**: `kolommen.ts` en `kiesBtwTarief`. Daar horen meteen tests bij
   (layout ↔ state heen en terug; BTW-keuze), want dat zijn rekenregels zonder scherm.
2. **Losse componenten**: `GetalInput`, `OmschrijvingVeld`, `TabelHeader`,
   `OpslaanAlsReceptModal`, `TekstregelRij`, `ComponentRegelRij`.
3. **`GroepSectie`** en **`CalculatieregelRij`**, waarbij het uitklapdeel naar `RegelDetail`
   gaat.
4. **Hooks** uit de hoofdcomponent, één per commit, in de volgorde van de tabel hierboven.
5. Pas dan **fase 3**: het ⋯-menu per regel, vinkjes, invoegrij, groepsmenu.

## Risico's en hoe we ze afvangen

- **Gedeelde state tussen rij en grid.** Rijen krijgen nu veel callbacks via props. Bij het
  verplaatsen blijft die vorm gelijk; pas in fase 3 eventueel een context. Niet beide tegelijk.
- **De imperatieve handle** (`undo`, `zetInklap`, `duwSnapshot`, `herlaad`, `wisRegelOpslagen`,
  `zetArbeidTarieven`) wordt door `CalculatieHoofdscherm` en `TotalsBar` gebruikt. De handle
  blijft in `CalculatieGrid.tsx`; de hooks leveren de functies aan.
- **Slepen** (regels, groepen, kolommen) reageert gevoelig op welk element de events krijgt.
  Na stap 3 en 4 handmatig nalopen: regel naar andere groep, kolom verplaatsen, groep in de boom.
- **Opgeslagen kolomindelingen** van gebruikers mogen niet veranderen. `kolommen.ts` houdt de
  bestaande `ColId`-waarden exact gelijk; de test uit stap 1 bewaakt dat.
