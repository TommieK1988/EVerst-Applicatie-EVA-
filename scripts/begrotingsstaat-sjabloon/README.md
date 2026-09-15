# Word-sjabloon interne begroting (begrotingsstaat)

`build-docx.mjs` bouwt `docs/Interne-begroting-sjabloon.docx`: het Word-sjabloon met de
volledige begrotingsstaat. Het sjabloon bevat **samenvoegvelden, geen gegevens** — EVA vult
ze bij het genereren.

```bash
npm install     # enige afhankelijkheid: docx
npm run build   # schrijft naar ../../docs/Interne-begroting-sjabloon.docx
```

## In gebruik nemen

1. Instellingen › Offertes › Opmaak → onder **Interne begroting** een lay-out aanmaken.
2. Het `.docx` daar als Word-sjabloon uploaden.
3. Die lay-out als standaard zetten (de standaard geldt per soort, dus dit raakt de
   offerte-lay-out niet).

Bij het aanmaken van een interne begroting toont EVA alleen lay-outs van deze soort.
De interne begroting is bewust **niet** vanuit EVA te mailen; downloaden en zelf versturen
kan wel.

## Papierformaat

Het sjabloon is **A3 liggend** (420 × 297 mm, 10 mm marge). De tabel is opgemaakt op 100 %
van de tekstbreedte met een vaste kolomindeling, dus de indeling schaalt mee:

- **A4 afdrukken of als PDF opslaan** — in Word bij Afdrukken → *Aanpassen aan papierformaat:
  A4*. Zelfde indeling, ~71 % zo groot.
- **Blijvend A4** — Indeling → Formaat → A4. De kolommen herverdelen zich naar de nieuwe
  breedte; verklein dan wel de tekengrootte in de tabel, want 21 kolommen op A4 wordt krap.

## Kolommen

Dezelfde kolommen als het rekenblad (`COL_DEFS` in `CalculatieGrid.tsx`), in dezelfde
volgorde. De schermkolommen ⚑ (markeren) en de actieknoppen zitten er niet in: dat zijn
bedieningselementen, geen gegevens.

| Rekenblad | Samenvoegveld |
|---|---|
| Kostengroep | `{kostengroep_naam}` |
| Omschrijving | `{omschrijving}` |
| Aant. / Eenh. | `{hoeveelheid}` · `{eenheid}` |
| STP / VRR | `{#is_stelpost}` · `{#is_verrekenbaar}` |
| Uur/e. · Min/e. | `{uren_per_eenheid}` · `{minuten_per_eenheid}` |
| Tarief AB · Bedrag AB | `{arbeid_tarief_bedrag}` · `{arbeid_bedrag_getal}` |
| Prijs MA · Bedrag MA | `{materiaal_prijs_per_eenheid_bedrag}` · `{materiaal_bedrag_getal}` |
| Prijs OA · Bedrag OA | `{oa_prijs_per_eenheid_bedrag}` · `{oa_bedrag_getal}` |
| Tot. uren | `{uren_totaal}` |
| KP/e. · Tot. KP | `{kostprijs_per_eenheid_bedrag}` · `{kostprijs_totaal_bedrag}` |
| Opsl. % | `{opslag_pct}` |
| VP/e. · Tot. VP | `{eenheidsprijs_bedrag}` · `{totaal_bedrag}` |
| BTW | `{btw_pct}` |

Per (sub)groep een totaalregel met `{incl.*}` (eigen regels + alle subgroepen) en, als een
groep zowel eigen regels als subgroepen heeft, een regel "waarvan eigen regels" met
`{eigen.*}`. Onderaan `{totalen.*}`.

De volledige lijst staat in EVA zelf: Instellingen › Offertes › Opmaak → een lay-out openen →
het variabelenpaneel, onder "Begrotingsstaat".

## Twee dingen om te weten bij het aanpassen

**Leeg is niet nul.** Een regel die niet uit een calculatie komt heeft geen kostensoorten;
die kolommen blijven dan leeg. "0,00" betekent een echte nul. Vervang lege waarden dus niet
door nullen — dan leest een staat met ontbrekende gegevens als een kloppende staat.

**Drie groepsniveaus, uitgeschreven.** Een Word-sjabloon kan niet recursief zijn, dus de
nesting `{#boom}` → `{#kinderen}` → `{#kinderen}` staat drie lagen diep in de tabel. EVA
kent niet meer dan drie niveaus; komt er ooit een vierde, dan moet hier een laag bij.
