# Startsjabloon — Bewonersbrief met feedback-link, QR-code en knop

Het bestand **`Bewonersbrief-feedback-QR.docx`** is een kant-en-klaar Word-sjabloon dat
je alleen nog hoeft te uploaden. Het bevat een QR-code, een klik-knop en de linktekst
naar de bewoners-feedbackronde.

## Eenmalig instellen (Instellingen → Document-sjablonen)

1. Klik op **Nieuw sjabloon**.
2. Vul in:
   - **Naam**: bv. "Bewonersbrief feedback"
   - **Documentsoort**: **Bewonersbrief** ← dit is belangrijk (zie hieronder).
3. Koppel bij **Word-template** het bestand `Bewonersbrief-feedback-QR.docx`.
4. (Optioneel) koppel je **briefpapier** (achtergrond-PDF) voor het logo/de huisstijl.
5. Opslaan. Klaar — je hoeft **geen** invoerveld toe te voegen.

**Automatisch:** bij documentsoort **Bewonersbrief** haalt EVA de feedback-link van het
dossier op en vult die zelf in. Bestaat er nog geen link, dan maakt EVA er meteen één aan
(op het gepubliceerde formulier "Bewoners feedback"). Er is dus één gepubliceerd
feedbackformulier (categorie *oplevering*) nodig.

## Gebruiken (in een dossier)

Bestanden-tab → **Document opstellen** → kies dit sjabloon → **PDF** of **Mailen**.
De QR-code, de knop en de linktekst worden automatisch gevuld met de feedback-link van
dat dossier. Geen extra stappen.

## De tags in het Word-bestand (voor als je zelf aanpast)

- `{%feedback_qr}` — de QR-code (moet **alleen** in zijn eigen alinea staan).
- `{feedback.url}` — de link als tekst (automatisch opgeschoond).
- `{#feedback.heeft}` … `{/feedback.heeft}` — dit blok verschijnt alleen als er een link is.
- **De knop** is een gewone Word-hyperlink. Zet als **adres** van die hyperlink:
  `{feedback.url}` (Insert → Link → Address). Bij het opstellen wordt dat adres vervangen
  door de echte feedback-link. Word slaat de accolades soms op als `%7Bfeedback.url%7D`;
  dat werkt ook. (Het oude sentinel-adres `https://feedback-link.eva/` blijft óók werken.)
