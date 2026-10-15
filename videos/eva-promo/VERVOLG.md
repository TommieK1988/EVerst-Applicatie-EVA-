# Vervolg — EVA-promovideo

Stand: storyboard (16 scènes) goedgekeurd, alle scènes geanimeerd, muziek gecomponeerd,
conceptrender zonder stem in `renders/concept-zonder-stem.mp4` (niet in git).
Wat nog moet: **Nederlandse voice-over** (Google Cloud TTS) en de **eindrender**.

## Voorwaarde

`GOOGLE_TTS_API_KEY` staat als omgevingsvariabele (of netwerkgeheim) in de cloud-omgeving,
met de Text-to-Speech API aan. Een nieuwe sessie leest hem in.

## Stappen in de nieuwe sessie

Alles vanuit `videos/eva-promo/`:

1. Stemmen bekijken en proefjes maken, gebruiker laten kiezen:
   ```bash
   node scripts/stem.mjs --lijst
   node scripts/stem.mjs --proef nl-NL-Chirp3-HD-Charon nl-NL-Chirp3-HD-Kore nl-NL-Chirp3-HD-Orus nl-NL-Chirp3-HD-Aoede
   ```
2. Voice-over voor alle regels uit `SCRIPT.md` (past ook de scèneduur aan in `scripts/frames.json`):
   ```bash
   node scripts/stem.mjs --stem <gekozen stem>
   ```
3. Muziek opnieuw op de nieuwe totale lengte (`node scripts/index.mjs` print het totaal):
   ```bash
   python3 -I scripts/muziek.py <totaal+1> /tmp/bgm.wav
   ffmpeg -y -i /tmp/bgm.wav -af loudnorm=I=-18:TP=-2 -c:a aac -b:a 192k assets/audio/muziek.m4a
   ```
4. Opnieuw opbouwen en controleren:
   ```bash
   node scripts/wrap.mjs && node scripts/index.mjs
   npx hyperframes check
   ```
   Animaties staan in `src/NN-*.html` (bron); `compositions/frames/` wordt gegenereerd.
   Timings in de scripts zijn in seconden binnen de scène; wordt een scène langer door de stem,
   dan schuiven de latere animaties niet vanzelf mee — kijk de contact sheet na
   (`npx hyperframes snapshot --at …`) en rek waar nodig de tijden in `src/` op.
5. Muziek onder de stem uitsparen (`/hyperframes-audio` → voiceover carve), dan eindrender:
   ```bash
   npx hyperframes render --quality delivery --output renders/eva-video.mp4
   ```

## Bestanden

- `BRIEF.md` — opdracht en keuzes van de gebruiker
- `STORYBOARD.md` / `SCRIPT.md` — scènes en gesproken tekst (gegenereerd door `scripts/plan.py`)
- `boards/storyboard.html` — goedgekeurd storyboard met stills
- `src/` — bron per scène + `shared.css`; `scripts/wrap.mjs` bouwt `compositions/frames/`
- `scripts/frames.json` — volgorde en duur per scène (bron voor wrap én index)
- `scripts/muziek.py` — offline gecomponeerde muziekbedding
- `capture/assets/` — echte EVA-schermafbeeldingen (preview-pagina's en design-system-specs, verzonnen gegevens)
