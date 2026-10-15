---
workflow: product-launch-video
flow: automation
storyboard: yes
message: "EVA: één systeem van eerste mail tot laatste factuur — op kantoor én op de bouwplaats"
destination: presentation
aspect: 1920x1080
language: nl
audience: collega's, nieuwe medewerkers en (potentiële) opdrachtgevers van Everts
length: 90s
angle: van aanvraag tot oplevering — één klus volgen door EVA
---

## Intent

Een video waarin alle functionaliteiten van de desktop- én mobiele versie van EVA worden
uitgelicht, "met screenshots en vloeiende beelden". Verhaallijn: één klus volgen door EVA,
van de eerste mail tot de factuur. Toon: helder en rustig, geen harde verkooppraat.

## Customizations

- Show-it-as-is: de EVA-schermen zijn de beelden. Schermen worden nagebouwd in de EVA-huisstijl
  (design system in docs/design-system) met verzonnen gegevens, aangevuld met echte screenshots
  van de preview-pagina's die zonder login draaien. Geen echte klant- of medewerkergegevens.
- Mobiele schermen in een telefoonframe naast/over het desktopscherm.
- Nederlandse voice-over + achtergrondmuziek.

## Notes

- Offline Piper-stemmen afgekeurd ("niet goed genoeg"). Voice-over via Google Cloud TTS
  (nl-NL, Chirp 3 HD) — sleutel komt als omgevingsvariabele GOOGLE_TTS_API_KEY in een nieuwe sessie.
- HeyGen-muziekbibliotheek en HuggingFace zijn niet bereikbaar; muziek wordt lokaal gecomponeerd
  (rustige, onopvallende bedding) — als host-audio in audio_meta.json.
