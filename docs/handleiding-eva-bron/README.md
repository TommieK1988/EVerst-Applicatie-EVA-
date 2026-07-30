# Bronbestanden — Handleiding EVA

Hiermee worden de twee deliverables in `docs/` gegenereerd:

- `docs/Handleiding-EVA.docx` — de handleiding (Word, opgemaakt in huisstijl)
- `docs/Handleiding-EVA-presentatie.pptx` — presentatie om mee te presenteren

## Twee manieren om bij te werken

**1. Snel iets aanpassen → bewerk het Word-bestand direct.**
Open `docs/Handleiding-EVA.docx` in Word, pas de tekst aan en sla op. De
inhoudsopgave werk je bij met: klik erin → rechtermuis → *Veld bijwerken*
(of selecteer alles en druk **F9**).

**2. Structureel bijwerken → pas het bronscript aan en genereer opnieuw.**
De teksten staan als data-arrays in `build-docx.js` / `build-pptx.js`, dus een
nieuwe module toevoegen betekent: een regel/blok toevoegen en opnieuw bouwen.
De inhoudelijke bron is `docs/handleiding-eva.md`.

## Opnieuw genereren

Eenmalig (in deze map) de libraries installeren:

```bash
npm install docx pptxgenjs
```

Daarna:

```bash
node build-docx.js   # → Handleiding-EVA.docx
node build-pptx.js   # → Handleiding-EVA-presentatie.pptx
```

Kopieer de output daarna naar `docs/`.

## Huisstijl (in de scripts vastgelegd)

- Primair groen `#009439`, diep `#007530`, donkergroen `#0A5E28` / `#054F2E`
- Lime-accent `#61AC2B`, tekst-inkt `#1F2933`, tint `#ECFAF0`
- Koppen: Cambria · body: Calibri · logo: `logo.png` (Everts-beeldmerk)

> De `.docx` gebruikt `updateFields: true`, zodat de inhoudsopgave zich vult
> zodra je het bestand in Word opent.
