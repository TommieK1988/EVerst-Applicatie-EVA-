# Startsjabloon — Bewonersbrief met feedback-link, QR-code en knop

Het bestand **`Bewonersbrief-feedback-QR.docx`** is een kant-en-klaar Word-sjabloon dat
je alleen nog hoeft te uploaden. Het bevat een QR-code, een klik-knop en de linktekst
naar de bewoners-feedbackronde.

## Eenmalig instellen (Instellingen → Document-sjablonen)

1. Klik op **Nieuw sjabloon**.
2. Vul in:
   - **Naam**: bv. "Bewonersbrief feedback"
   - **Documentsoort**: **Bewonersbrief**
3. Koppel bij **Word-template** het bestand `Bewonersbrief-feedback-QR.docx`.
4. (Optioneel) koppel je **briefpapier** (achtergrond-PDF) voor het logo/de huisstijl.
5. Voeg onderaan bij **Invoervelden** één veld toe:
   - **Type**: **Feedback-link (bewoners)**
   - **Sleutel**: `feedback`
   - Zet het eventueel op **Verplicht**.
6. Opslaan. Klaar.

## Gebruiken (in een dossier)

Bestanden-tab → **Document opstellen** → kies dit sjabloon → bij het veld **Feedback-link**
kies je een bestaande link of maak je er één (kies dan het feedbackformulier) → **PDF** of
**Mailen**. De QR-code, de knop en de linktekst wijzen dan naar die feedback-link.

## De tags in het Word-bestand (voor als je zelf aanpast)

- `{%feedback_qr}` — de QR-code (moet **alleen** in zijn eigen alinea staan).
- `{feedback.url}` — de link als tekst (automatisch opgeschoond).
- `{#feedback.heeft}` … `{/feedback.heeft}` — dit blok verschijnt alleen als er een link is gekozen.
- **De knop** is een gewone Word-hyperlink met als adres exact `https://feedback-link.eva/`.
  Bij het opstellen wordt dat adres vervangen door de echte feedback-link. Wil je de knop
  verplaatsen of de tekst wijzigen: houd het hyperlink-adres exact op `https://feedback-link.eva/`.
