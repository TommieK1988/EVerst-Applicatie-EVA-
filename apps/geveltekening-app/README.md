# Geveltekening App

Genereert schaalnauwkeurige 2D geveltekeningen uit open Nederlandse overheidsdata
(PDOK / BAG / 3D BAG), met annotaties voor houtrot, schilderwerk en gevelreparaties.

## Status

**Fase 1 — fundament (klaar)**
- Adres-invoer met autocomplete (PDOK Locatieserver)
- Ophalen pand-geometrie (BAG WFS)
- Ophalen gebouwhoogte (3D BAG van TU Delft)
- Automatische extractie van gevelvlakken uit footprint
- Gevelselectie UI (top-down preview + lijst met breedte/oriëntatie)

**Fase 2 — tekening genereren (volgt)**
- Claude Vision voor element-detectie (ramen, deuren, kozijnen, betonbanden)
- Referentiematen invoeren → schaalberekening
- SVG live-preview + eenvoudige editor

**Fase 3 — annotaties & export (volgt)**
- Lagen voor houtrot / schilderwerk / gevelreparaties
- DXF export
- PDF export

## Lokaal draaien (binnen monorepo)

```bash
# vanuit de root:
npm install
npm run dev:geveltekening
# open http://localhost:3006
```

## Environment variabelen

Kopieer `.env.local.example` naar `.env.local` en vul in:

- `MAPILLARY_ACCESS_TOKEN` — gratis, maak app aan op
  https://www.mapillary.com/dashboard/developers
  (alleen nodig voor street-level foto's — fase 2)
- `ANTHROPIC_API_KEY` — voor Claude Vision elementherkenning
  (alleen nodig in fase 2)

PDOK BAG en 3D BAG vereisen **geen** API key.

## Portabiliteit — los deployen naar andere server

Deze app is bewust **zelfstandig** gehouden zonder dependencies op `@everts/*`
workspace packages, zodat je de map in één keer kunt overzetten naar een andere
omgeving (bv. een cloud platform).

Om te kopiëren naar een nieuwe serveromgeving:

1. Kopieer de gehele map `apps/geveltekening-app/` naar de nieuwe locatie
2. Verwijder `node_modules/` en `.next/` (worden bij install/build opnieuw gegenereerd)
3. In de nieuwe omgeving:
   ```bash
   npm install
   npm run build
   npm start
   ```
4. Zet environment variabelen (zie `.env.local.example`)

**Geen externe afhankelijkheden** buiten de eigen `package.json`:
- Eigen `tailwind.config.js` (geen `@everts/config` preset)
- Eigen shadcn/ui componenten in `src/components/ui/`
- Eigen `cn()` util in `src/lib/utils.ts`
- Geen Supabase / database laag in fase 1 (wordt later optioneel toegevoegd)

## Databronnen

| Bron | Gebruikt voor | Kosten | Key nodig |
|------|---------------|--------|-----------|
| [PDOK Locatieserver](https://github.com/PDOK/locatieserver/wiki) | Adres autocomplete + lookup | Gratis | Nee |
| [PDOK BAG WFS](https://www.pdok.nl/introductie/-/article/basisregistratie-adressen-en-gebouwen-ba-1) | Pand-footprint (polygon) | Gratis | Nee |
| [3D BAG (TU Delft)](https://docs.3dbag.nl/) | Gebouwhoogtes (goot/nok) | Gratis | Nee |
| [Mapillary Graph API](https://www.mapillary.com/developer/api-documentation) | Street-level foto's | Gratis | Ja (OAuth token) |
| [Anthropic Claude](https://console.anthropic.com/) | Vision element-detectie | Betaald | Ja |
