# Mailintake — wat EVA opzoekt en wat EVA doet

Dit beschrijft wat er gebeurt met een e-mail die binnenkomt op `aanvragen@everts.chat`,
`opdrachten@everts.chat` of `servicedesk@everts.chat`, en wat EVA vervolgens aanmaakt.

Geschreven uit de code zoals die op `main` staat (16 september 2026, fase 1). Wat hier niet
staat, doet EVA niet — ook niet als het in het oorspronkelijke plan stond. Aan het eind van
dit stuk staat een paragraaf met wat er bewust nog ontbreekt.

---

## In het kort

```
elke 10 min ophalen  →  triage (gratis)  →  AI leest mail + bijlagen  →  EVA zoekt op
                                                                              ↓
                          voorleggen in het Postvak   ←  besluit  →   zelf aanmaken
```

Twee dingen die de hele opzet bepalen:

- **Bij twijfel gaat het naar een mens.** Automatisch aanmaken is de uitzondering die aan
  álle voorwaarden voldoet. Er is geen enkel pad waarin onzekerheid tot een automatische
  handeling leidt.
- **Er wordt nooit iets weggegooid.** Ook een mail die EVA als "geen aanvraag" beoordeelt,
  staat in het Postvak en is met één klik alsnog te behandelen.

---

## 1. Voordat de AI eraan te pas komt

Een deel van de post is zonder lezen al geen werk. Dat wordt er gratis uitgefilterd, vóór de
AI-kosten:

| Wat | Waaraan herkend |
|---|---|
| Automatische antwoorden | De kopregels `Auto-Submitted`, `X-Auto-Response-Suppress`, `X-Autoreply`, of een onderwerp dat begint met "Automatisch antwoord", "Out of office", "Niet aanwezig", "Undeliverable", "Mail delivery failed", "Onbestelbaar" |
| Nieuwsbrieven en bulkmail | De kopregels `List-Unsubscribe`, `List-Id` of `Precedence: bulk` |
| Afzenders op de negeerlijst | Los adres of heel domein, in te stellen bij Instellingen → Mailintake |
| Lege berichten | Geen tekst én geen bijlagen |

Deze berichten krijgen meteen de stand **Geen aanvraag** en blijven ongelezen in Postvak IN
staan. Er wordt bewust *niet* uitgesloten op een onbekende afzender, op een kort bericht, of
op het ontbreken van bijlagen — een echte aanvraag kan dat allemaal ook hebben.

---

## 2. Welke velden EVA uit de mail en de bijlagen haalt

De AI leest de mailtekst én de bijlagen (PDF's en foto's) en vult daarmee een formulier in.
Hij mag niets uitvoeren; hij kan alleen dat formulier invullen.

**Wat voor bericht is dit**

| Soort | Betekenis |
|---|---|
| `offerteaanvraag` | Men vraagt ons een prijs |
| `opdracht_op_offerte` | Men gaat akkoord met een offerte die wij eerder stuurden |
| `opdrachtbon` | Directe opdracht zonder voorafgaande offerte (raamcontract, mutatiewerk) |
| `meerwerk` | Extra werk binnen een klus die al loopt |
| `servicedeskbon` | Storing, klacht, lekkage, mutatie |
| `aanvullende_informatie` | Hoort bij iets dat loopt: extra foto's, antwoord op een vraag, planningsafspraak |
| `factuur_of_administratie` | Factuur, aanmaning, betaalherinnering, btw-vraag |
| `overig_geen_werk` | Nieuwsbrief, leveranciersreclame, sollicitatie, spam, privé |

Daarbij een **zekerheidspercentage**. Dat percentage stuurt de rest: alleen boven 90 % mag
EVA zelfstandig handelen.

**De velden**

| Veld | Waar het over gaat |
|---|---|
| Omschrijving | Het werk in een paar woorden, zoals het in een projectnaam zou staan ("Schilderwerk buitenkozijnen"), zonder adres |
| Opdrachtgever | Naam van bedrijf, VvE of corporatie — als **tekst**; EVA kiest de klant zelf (zie §3) |
| Contactpersoon | Naam, e-mailadres, telefoonnummer |
| Werkadres | Straat, huisnummer, postcode, plaats — het adres waar het werk is, **niet** het factuuradres en niet het adres in de handtekening |
| Referentie opdrachtgever | Hún kenmerk: inkoopnummer, ordernummer, bonnummer, meldingsnummer |
| Ons offerte-/dossiernummer | Een nummer van óns dat in hun mail staat |
| VvE-code | Complex- of VvE-code, als die genoemd wordt |
| Categorie | Soort werk (Schilderwerk, Dagelijks onderhoud, Mutatie, Renovatie) |
| Werkmaatschappij | Alleen als de mail die expliciet noemt |
| Datums | Aanvraagdatum, deadline, gewenste start |
| Bedrag excl. btw | Als de mail of de bon dat noemt |
| Spoed | Wordt er om directe actie gevraagd |
| Opmerkingen | Bijzonderheden voor de behandelaar: bereikbaarheid, sleutels, asbest, bewoners |
| Meerdere werkadressen | Betreft dit een verzamelopdracht over meerdere panden |
| Rol per bijlage | opdrachtbon / bestek / tekening / foto / offerte / overig |

Per veld geeft de AI aan hoe zeker hij is. Dat percentage zie je in het behandelscherm naast
het veld staan.

**Grenzen aan wat er gelezen wordt.** Bij de veldextractie: PDF's tot 10 MB, maximaal 5
documenten en 3 foto's. Wat niet mee kon, wordt bij naam genoemd — en zo'n bericht gaat
altijd naar een mens, want er kan informatie ontbreken.

---

## 3. Wat EVA daarna zelf opzoekt

Alles wat de AI oplevert is een *voorstel*. Elke waarde gaat daarna langs een controle die
niet door de AI beïnvloed kan worden.

### De opdrachtgever

EVA kiest de klant; de AI kan alleen een naam noemen. De ladder stopt bij de eerste treffer:

| Route | Zekerheid |
|---|---|
| Het afzenderadres staat in de aliassenlijst (daar landt elke handmatige koppeling) | 100 % |
| Het afzenderadres is het e-mailadres van een actieve contactpersoon | 100 % |
| Het afzenderdomein hoort bij precies één relatie, en is geen vrij maildomein (gmail, hotmail, ziggo, kpn…) | 85 % |
| Het domein hoort bij méér dan één relatie | 40 %, altijd voorleggen |
| De klantnaam uit de mail is exact gelijk aan precies één actieve relatie | 80 % |
| De klantnaam lijkt sterk op precies één relatie | 60 % |
| Niets gevonden | 0 % |

**Doorgestuurde mail.** Is de afzender een eigen medewerker, dan zoekt EVA de oorspronkelijke
afzender in de doorgestuurde kop (`Van:` / `From:` in de tekst). De zekerheid wordt dan
afgetopt op 80 %, dus zo'n bericht gaat nooit volautomatisch door.

### Het werkadres

Het adres wordt voorgelegd aan de landelijke adresvoorziening (PDOK). Komt het daar niet als
bestaand adres uit, dan geldt het als **niet bevestigd** en gaat het bericht naar een mens.
Het huisnummer uit de mail wordt altijd aangehouden — PDOK levert het basisnummer, de mail
heeft vaak de toevoeging ("12 A", "12-16").

### Het vastgoedobject

EVA zoekt of we op dat adres al een object kennen, zodat het dossier meteen onder het juiste
complex of pand hangt:

| Route | Zekerheid |
|---|---|
| De VvE-code uit de mail komt overeen met een object | 100 % |
| Postcode + huisnummer komen overeen | 100 % |
| Straat + huisnummer komen overeen | 90 % |
| Het huisnummer valt binnen een straatbereik van een complex ("Delftselaan 7 t/m 79") | 70 %, of 40 % als de klant niet overeenkomt |

Bij meerdere gelijkwaardige treffers wordt er niets gekoppeld en zie je de kandidaten in het
scherm.

### Categorie en werkmaatschappij

De categorie moet voorkomen in de **categorielijst van Bouw7**; wat daar niet in staat wordt
niet overgenomen. De werkmaatschappij idem, met de standaard van de postbus als terugval.

Dit is meer dan een formaliteit: de categorie bepaalt of een bon als servicedeskwerk wordt
herkend. Zie §5.

### Staat dit al ingeschreven?

Deze controle draait **altijd**, ook als een mens het bericht behandelt. Er wordt gezocht via
vijf ingangen — dezelfde klant, hetzelfde adres, dezelfde referentie, dezelfde mailconversatie,
en dezelfde bijlage — en elke kandidaat krijgt een score:

| Signaal | Gewicht |
|---|---|
| Een eerdere mail uit dezelfde conversatie hangt al aan een dossier | 1,00 |
| Een identieke bijlage hangt al aan een dossier | 0,90 |
| Ons dossiernummer wordt letterlijk in de mail genoemd | 0,50 |
| Zelfde werkadres (postcode + huisnummer) | 0,45 |
| Zelfde referentie van de opdrachtgever | 0,40 |
| De omschrijving lijkt sterk op de titel van een dossier | tot 0,20 |
| Zelfde bedrag (binnen 1 %) | 0,10 |

Vanaf **0,55** gaat het altijd naar een mens. Bij het aanmaken verschijnt dan een dialoog die
het gevonden dossier toont met de redenen, en pas na bevestiging wordt er een nieuw dossier
gemaakt. Alle kandidaten worden bewaard, ook als er niets mee gebeurt — anders is achteraf
niet te zien of de drempel goed staat.

Er wordt gezocht in werk van de afgelopen **18 maanden**.

### Kan Bouw7 hier een net project van maken?

Vóórdat er iets wordt aangemaakt controleert EVA of Bouw7 alles heeft wat het nodig heeft:

- staat de klant in Bouw7 (heeft hij een Bouw7-nummer);
- staat de contactpersoon in Bouw7 (niet blokkerend, wel gemeld);
- heeft de werkmaatschappij een vestiging in Bouw7 — daarop bepaalt Bouw7 het projectnummer;
- bestaat de gekozen categorie in Bouw7.

Zonder deze controle maakt Bouw7 het project gewoon aan, maar zónder klant of met een
projectnummer uit de verkeerde reeks. Dat gaat niet stuk, dat gaat *stil* fout.

### De gevraagde werkzaamheden

Alleen bij een **offerteaanvraag** draait er een tweede leesronde over de mail en de bijlagen,
met een ruimer budget (PDF's tot 20 MB, tot 10 documenten). Die levert een korte opsomming van
het gevraagde werk op, in de taal van een calculator:

```
• Dak geheel vervangen als overlagen niet mogelijk is.
• Voorgevel houtwerk schilderen.
• Optioneel aanbieden: kozijnen vervangen voor kunststof.
```

Veel kleine verspreide punten worden samengevat in één regel, niet overgetikt. Wat onduidelijk
is krijgt een regel die met "Onduidelijk:" begint — dat is wat je moet navragen vóór je begint.
De tekst is aan te passen in het behandelscherm en later op het dossier; er staat een knop
**Opnieuw samenvatten** bij.

Bij een opdrachtbon, meerwerk of servicedeskbon draait dit niet vanzelf — daar is de scope
meestal één regel. De knop staat er wel.

---

## 4. Wat er gebeurt bij "Dossier aanmaken"

In deze volgorde, of een mens op de knop drukt of EVA het zelf doet:

1. **Het dossier wordt aangemaakt** met dezelfde functie als de knop *Nieuwe aanvraag*
   (`maakAanvraag`). De projectnaam wordt `{Straat huisnr}, {Plaats} - {Omschrijving}`.
   Meegegeven worden: opdrachtgever, contactpersoon, categorie, referentie, werkmaatschappij,
   VvE-code, aanvraagdatum, deadline, opmerkingen, het volledige werkadres en het gevonden
   vastgoedobject.
2. **Bouw7 krijgt het project meteen doorgestuurd.** Lukt dat niet, dan blijft het EVA-dossier
   staan met een foutmelding erbij — liever een dossier zonder Bouw7-nummer dan een verloren
   aanvraag. Je ziet de fout in beeld en kunt het vanaf de dossierpagina opnieuw proberen.
3. **De gevraagde werkzaamheden komen op het dossier**, met een herkomstregel eronder
   ("Opgesteld uit de mail en 3 bijlagen"). Heb je de tekst bijgeschaafd, dan wordt jouw versie
   opgeslagen, niet die van EVA.
4. **De bijlagen gaan naar de SharePoint-dossiermap**, met de ontvangstdatum vóór de
   bestandsnaam (`2026-09-16 opdrachtbon.pdf`). Dat voorkomt dat een tweede "opdrachtbon.pdf"
   de eerste overschrijft, en je ziet meteen bij welke mail iets hoort.
5. **Het bericht wordt gekoppeld** aan het dossier, de relatie en de contactpersoon, en gaat
   op de stand *Verwerkt*.
6. **Alles wordt vastgelegd** in een besluitenlogboek: wie of wat besloot, wanneer, en op welke
   gronden.
7. **Het adres wordt onthouden.** Kies je met de hand een klant bij een afzender, dan legt EVA
   dat adres vast als alias. De volgende mail van diezelfde persoon wordt daardoor direct
   herkend.
8. **De mail wordt in Outlook afgehandeld.** Zie §7.

Heeft EVA het **zelf** gedaan, dan komen daar twee dingen bij:

- een **taak** "Controleer automatisch aangemaakt dossier {nummer}" voor de calculator van dat
  dossier, met één dag looptijd;
- een **melding** aan de rolhouders van het nieuwe dossier. Automatisch aanmaken gebeurt nooit
  stil.

### Koppelen aan een bestaand dossier

Kies je *Koppelen* in plaats van *Aanmaken*, dan wordt het bericht aan dat dossier gehangen en
gaan **de bijlagen alsnog naar de SharePoint-map van dat dossier**. Dat is meestal juist de
reden dat iemand koppelt: de opdrachtbon hoort in het dossier, niet in de mailbox.

Bij een gevonden duplicaat staan er drie varianten van die knop, afhankelijk van waar het
dossier staat: *Koppelen aan dit dossier*, *Hoort bij deze offerte* en *Meerwerk op dit
dossier*. **Alle drie doen hetzelfde:** koppelen en de bijlagen wegzetten. Ze leggen alleen
vast wat jij vond dat het was.

---

## 5. Het verschil tussen aanvraag, opdracht en servicedeskbon

**Alle drie leveren hetzelfde op: een dossier met hoofdstatus `aanvraag` en een Bouw7-project
op "01. Offerte".** Wat verschilt is de **categorie** — en die bepaalt vervolgens waar het werk
in EVA opduikt.

| Binnengekomen | Wat EVA aanmaakt | Wat jij daarna doet |
|---|---|---|
| Offerteaanvraag | Aanvraag met de categorie uit de mail, inclusief scope-samenvatting | Het normale offertetraject |
| Opdrachtbon zonder offerte | Aanvraag met de categorie uit de bon | **Zelf doorzetten naar opdracht.** EVA doet dat niet. |
| Servicedeskbon | Aanvraag met de categorie "Dagelijks onderhoud" of "Mutatie" | Verder via de servicedesk |
| Opdracht op onze offerte | **Niets** — dit wordt altijd voorgelegd | Zelf de offerte op gewonnen zetten |
| Meerwerk | **Niets** — dit wordt altijd voorgelegd | Zelf een meerwerkregel maken |
| Aanvullende informatie | **Niets** — wordt voorgelegd om te koppelen | Koppelen aan het juiste dossier; de bijlagen gaan dan mee |

Let op de derde regel: **een servicedeskbon is geen aparte status.** Of een dossier bij de
servicedesk terechtkomt hangt volledig aan de categorie. Staat daar iets anders, dan belandt de
bon in het aanvragenscherm in plaats van bij de servicedesk. Daarom is de standaardcategorie
per postbus een instelling die je goed moet zetten.

---

## 6. Wanneer EVA het zelf mag doen

Automatisch aanmaken staat nu **overal uit**. Zet je het aan voor een postbus, dan moeten
hierna *alle* onderstaande punten kloppen. Faalt er één, dan komt het bericht in het Postvak
met de reden erbij.

1. De soort is een offerteaanvraag, een opdrachtbon of een servicedeskbon — nooit een opdracht
   op onze offerte of meerwerk, want die raken een dossier dat al loopt.
2. De AI is voor minstens 90 % zeker van die soort.
3. De afzender is voor minstens 85 % herkend, en er is precies één mogelijke opdrachtgever.
4. Het is geen antwoord in een lopend gesprek (geen `RE:` of `FW:`).
5. De mail gaat niet over meerdere werkadressen tegelijk.
6. Er zat geen bijlage bij die niet gelezen kon worden.
7. Alle verplichte velden zijn ingevuld: opdrachtgever, omschrijving, werkmaatschappij,
   categorie en een volledig werkadres.
8. Het werkadres is door PDOK bevestigd.
9. Omschrijving, straat en categorie zijn elk voor minstens 80 % zeker.
10. Bouw7 kan er een net project van maken (§3).
11. De hoogste duplicaatscore ligt onder 0,55.
12. Het dagbudget voor deze postbus is nog niet op.

---

## 7. Wat er in Outlook gebeurt

Eén vaste regel voor alle drie de postbussen, met één principe:

> **Een beslissing van een mens haalt de mail uit het zicht. Een beslissing van de machine nooit.**

| Stand | Wie besliste | Wat er gebeurt |
|---|---|---|
| Dossier aangemaakt of gekoppeld | mens óf EVA | Naar de map **Verwerkt door EVA**, categorie `EVA: {dossiernummer}`, als gelezen gemarkeerd |
| Genegeerd | mens, met reden | Naar **Verwerkt door EVA**, categorie `EVA: genegeerd` |
| Geen aanvraag | EVA | **Blijft ongelezen in Postvak IN**, alleen de categorie `EVA: geen aanvraag` |
| Wacht op een mens | — | Blijft onaangeroerd in Postvak IN |
| Mislukt | — | Blijft onaangeroerd in Postvak IN |

Dat "geen aanvraag" blijft staan is bewust: dat oordeel heeft niemand gezien, en een gemiste
aanvraag is de duurste fout die er is.

**De noodrem.** Bij Instellingen → Mailintake staat één bedrijfsbrede schakelaar met drie
standen: *Aan* (categoriseren én verplaatsen), *Alleen categorie* (niets verplaatsen) en *Uit*.
Hij staat nu op **Alleen categorie**. Verplaatsen is de enige stap in deze hele module die
zichtbaar is voor mensen die niet in EVA werken; die gaat pas aan als de rest betrouwbaar
blijkt.

Mislukt het verplaatsen, dan wordt het dossier **nooit** teruggedraaid. Het bericht blijft
gewoon in Postvak IN staan en de bewakingscron probeert het opnieuw.

---

## 8. Wat EVA nooit doet

- **Mail versturen.** De app-registratie heeft daar geen recht toe (`Mail.Send` is bewust niet
  aangevraagd). EVA kan lezen, categoriseren en verplaatsen, meer niet.
- **Mail verwijderen.**
- **Zelf een klant kiezen op basis van wat de AI zegt.** De AI levert een naam als tekst; welke
  relatie daarbij hoort, bepaalt de code volgens de ladder in §3.
- **Een offerte op gewonnen zetten.** Dat trekt in Bouw7 een reeks handelingen mee en blijft
  mensenwerk.
- **Een meerwerkregel aanmaken of op akkoord zetten.**
- **Een aanvraag doorzetten naar opdracht.** Ook niet bij een opdrachtbon; die landt als
  aanvraag en dat zet je zelf door.
- **Hoeveelheden, maten of prijzen verzinnen.** De scope-samenvatting zegt wát er gevraagd
  wordt, niet hoeveel m² of welk bedrag.
- **Iets in Bouw7 overschrijven.** De gevraagde werkzaamheden zijn een EVA-eigen veld en gaan
  niet naar Bouw7.

---

## 9. Wat er bewust nog niet in zit

Zodat je niet op iets wacht dat niet komt:

- **Geen taak bij een opdrachtbon.** Er wordt nu niets aangemaakt dat je eraan herinnert om de
  bon door te zetten naar opdracht. Dat komt erbij zodra blijkt hoe vaak dit voorkomt.
- **Geen automatische statuswijziging bij een opdracht op onze offerte.** De knop *Hoort bij
  deze offerte* koppelt en zet de bijlagen weg; de status verzet je zelf.
- **Nog geen kwaliteitsscherm.** De cijfers over hoe vaak EVA het goed had, en wat de AI per
  dag kost, worden wel vastgelegd maar zijn nog niet in een scherm te zien.
- **Nog niet getest tegen een echte mailbox.** Alles hierboven is de werking volgens de code;
  de eerste weken moeten uitwijzen hoe de triage zich houdt tegen de werkelijke post.

---

## 10. Wat je de eerste weken moet nalopen

De duurste fout is een gemiste aanvraag, en die is als enige onzichtbaar — er komt geen
melding van iets dat niet is aangemaakt. Loop daarom wekelijks tien berichten uit de bak
**Geen aanvraag** met de hand na. Zit daar iets tussen dat wél werk was, dan moet dat gezegd
worden; dat is het signaal waarop de drempels bijgesteld worden.

Verder, met aflopende urgentie:

- Hoe vaak corrigeerde iemand de **soort**? Vooral: hoe vaak stond er "geen werk" bij iets dat
  wél een aanvraag bleek.
- Hoe vaak klopte het **voorstel** precies? Boven de 95 % kan de drempel omlaag, onder de 80 %
  moet hij omhoog.
- Dossiers die uit de mail komen en binnen twee weken alweer vervallen zijn. Dat is de échte
  foutratio.
- Dubbel aangemaakte dossiers: zelfde klant, zelfde adres, binnen 30 dagen. Vangnet ónder de
  duplicaatcontrole.
- Berichten die langer dan twee werkdagen op **Wacht op mens** staan.
