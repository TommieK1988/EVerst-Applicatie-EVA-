# Mailintake — wat EVA opzoekt en wat EVA doet

Dit beschrijft wat er gebeurt met een e-mail die binnenkomt op `aanvragen@everts.chat`,
`opdrachten@everts.chat` of `servicedesk@everts.chat`, en wat EVA vervolgens aanmaakt of
wijzigt.

Geschreven uit de code zoals die op `main` staat (16 september 2026). Wat hier niet staat,
doet EVA niet. Aan het eind staat een paragraaf met wat er bewust nog ontbreekt.

> Een Word-versie maak je met:
> `node scripts/md-naar-docx.mjs docs/mailintake-wat-doet-eva.md Mailintake.docx "Mailintake"`

---

## In het kort

```
elke 10 min ophalen  →  triage (gratis)  →  AI leest mail + bijlagen  →  EVA zoekt op
                                                                              ↓
                          voorleggen met een actie   ←  besluit  →   zelf uitvoeren
```

Drie dingen die de hele opzet bepalen:

- **Niet elke mail wordt een nieuw dossier.** Een aanvraag wordt er een; een opdracht zet
  juist een offerte die al loopt op gewonnen; een servicedeskbon kan allebei zijn.
- **Bij twijfel gaat het naar een mens**, en dan ook echt naar iemand: er komt een actie op
  naam van de behandelaar van die postbus.
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

## 1b. Mails over dezelfde klus worden één intake

Een opdracht komt lang niet altijd in één mail binnen. Het komt voor dat de bon in de ene mail
zit — met het bonnummer en het factuuradres — en de afspraak erover in een andere, doorgestuurd
door een collega, met een eigen gesprek. Wie die twee los leest, vult twee halve formulieren.

EVA knoopt ze daarom aan elkaar. Dat gebeurt op twee momenten:

**Vóór het lezen**, op signalen die meteen te zien zijn:

| Signaal | Toelichting |
|---|---|
| Zelfde e-mailgesprek | Antwoorden en doorsturen binnen één thread |
| Dezelfde bijlage | Op de inhoud van het bestand, niet op de naam — dezelfde bon die twee keer wordt doorgestuurd |
| Hetzelfde onderwerp | Zonder "Re:", "FW:" of "Antw:" ervoor, en alleen als het onderwerp lang genoeg is om iets te betekenen |

**Ná het lezen**, op wat er uit de mail kwam:

| Signaal | Toelichting |
|---|---|
| Dezelfde opdrachtgever op hetzelfde werkadres | Straat én huisnummer moeten overeenkomen |
| Hetzelfde bon- of ordernummer | Letterlijk dezelfde referentie |

Blijkt een mail er pas achteraf bij te horen, dan leest EVA één keer opnieuw — nu over het
geheel. Daarna niet meer; die tweede ronde kijkt zelf niet naar groepen.

Er wordt **nooit** samengevoegd op alleen de klantnaam. Een vastgoedbeheerder heeft tientallen
klussen tegelijk lopen; het adres of een letterlijk nummer moet er altijd bij. Twee klussen ten
onrechte samenvoegen is erger dan ze uit elkaar laten, want dan belandt een bon op het
verkeerde dossier.

Wat je ervan ziet: in het Postvak staat één regel met **"2 mails"** erachter, en in het
behandelscherm staan de andere mails uitklapbaar onder de hoofdmail, met hun bijlagen erbij.
Alles wat EVA als geheel heeft gelezen, staat dus ook als geheel in beeld.

---

## 2. Welke velden EVA uit de mail en de bijlagen haalt

De AI leest de mailtekst én de bijlagen (PDF's en foto's) van alle mails over deze klus, en
vult daarmee één formulier in. Hij mag niets uitvoeren; hij kan alleen dat formulier invullen.

De grenzen staan ruim: PDF's tot 20 MB per stuk, tot tien documenten en zes foto's, met een
totaal van 20 MB over alles samen (daarboven past het verzoek niet meer). Wat er niet bij kon,
wordt bij naam genoemd onder het voorstel. Dat is belangrijker dan het lijkt: het bestek is
altijd het dikste bestand, dus een krappe grens laat juist het document weg dat de scope draagt.

Komt het antwoord niet uit met de ruimte die ervoor staat, dan geldt de leesronde als
**mislukt** en gaat het bericht naar een mens. Een half ingevuld formulier dat er compleet
uitziet is gevaarlijker dan geen formulier.

**Wat voor bericht is dit**

| Soort | Betekenis |
|---|---|
| `offerteaanvraag` | Men vraagt ons een prijs |
| `opdracht_op_offerte` | Men gaat akkoord met een offerte die wij eerder stuurden |
| `opdrachtbon` | Directe opdracht zonder voorafgaande offerte (raamcontract, mutatiewerk) |
| `meerwerk` | Extra werk binnen een klus die al loopt |
| `servicedeskbon` | Storing, klacht, lekkage, mutatie |
| `aanvullende_informatie` | Hoort bij iets dat loopt: extra foto's, antwoord op een vraag |
| `factuur_of_administratie` | Factuur, aanmaning, betaalherinnering, btw-vraag |
| `overig_geen_werk` | Nieuwsbrief, leveranciersreclame, sollicitatie, spam, privé |

Daarbij een **zekerheidspercentage**. Dat percentage stuurt de rest: onder 90 % handelt EVA
nooit zelfstandig.

**De velden**

| Veld | Waar het over gaat |
|---|---|
| Omschrijving | Het werk in een paar woorden, zoals het in een projectnaam zou staan |
| Opdrachtgever | Naam van bedrijf, VvE of corporatie — als **tekst**; EVA kiest de klant zelf (§3) |
| Contactpersoon | Naam, e-mailadres, telefoonnummer |
| Werkadres | Straat, huisnummer, postcode, plaats — waar het werk is, **niet** het factuuradres |
| Referentie opdrachtgever | Hún kenmerk: inkoopnummer, ordernummer, meldingsnummer |
| Ons offerte-/dossiernummer | Een nummer van óns dat in hun mail staat |
| **Opdrachtreferentie** | Het nummer dat zij aan déze opdracht geven (bon-, order-, contractnummer) |
| **Opdrachtdatum** | De datum van de opdracht zelf, als die op de bon staat |
| VvE-code | Complex- of VvE-code |
| Categorie | Soort werk (Schilderwerk, Dagelijks onderhoud, Mutatie, Renovatie, …) |
| Werkmaatschappij | Alleen als de mail die expliciet noemt — zie §3 voor de regel |
| Datums | Aanvraagdatum, deadline, gewenste start |
| Bedrag excl. btw | Als de mail of de bon dat noemt |
| **Mandaat** | Het bedrag waarbinnen we zonder nadere goedkeuring mogen werken |
| Spoed | Wordt er om directe actie gevraagd |
| Opmerkingen | Bijzonderheden voor de behandelaar: bereikbaarheid, sleutels, asbest, bewoners |
| **Opmerkingen van de klant** | Wat de klant zelf bij de opdracht schrijft; wordt een notitie op het dossier |
| Meerdere werkadressen | Betreft dit een verzamelopdracht over meerdere panden |
| Rol per bijlage | opdrachtbon / bestek / tekening / foto / offerte / overig |

Per veld geeft de AI aan hoe zeker hij is. Dat percentage staat in het behandelscherm naast
het veld.

**Grenzen aan wat er gelezen wordt.** Bij de veldextractie: PDF's tot 10 MB, maximaal 5
documenten en 3 foto's. Wat niet mee kon, wordt bij naam genoemd — en zo'n bericht gaat
altijd naar een mens, want er kan informatie ontbreken.

---

## 3. Wat EVA daarna zelf opzoekt en invult

Alles wat de AI oplevert is een *voorstel*. Elke waarde gaat daarna langs een controle die
niet door de AI beïnvloed kan worden.

### De opdrachtgever

EVA kiest de klant; de AI kan alleen een naam noemen. De ladder stopt bij de eerste treffer:

| Route | Zekerheid |
|---|---|
| Het afzenderadres staat in de aliassenlijst (daar landt elke handmatige koppeling) | 100 % |
| Het afzenderadres is het e-mailadres van een actieve contactpersoon | 100 % |
| Het afzenderdomein hoort bij precies één relatie, en is geen vrij maildomein | 85 % |
| Het domein hoort bij méér dan één relatie | 40 %, altijd voorleggen |
| De klantnaam uit de mail is exact gelijk aan precies één actieve relatie | 80 % |
| De klantnaam lijkt sterk op precies één relatie | 60 % |
| Niets gevonden | 0 % |

**Doorgestuurde mail.** Is de afzender een eigen medewerker, dan zoekt EVA de oorspronkelijke
afzender in de doorgestuurde kop. De zekerheid wordt dan afgetopt op 80 %, dus zo'n bericht
gaat nooit volautomatisch door.

**Een onbekende opdrachtgever wordt nooit zelf aangemaakt.** Dan gaat het bericht naar een
mens, met alles voorgevuld. Een dossier zonder klant levert in Bouw7 een project zonder klant
op, en dat is een fout die pas weken later opvalt.

### Het werkadres

Het adres wordt voorgelegd aan de landelijke adresvoorziening (PDOK). Komt het daar niet als
bestaand adres uit, dan geldt het als **niet bevestigd** en gaat het bericht naar een mens.
Het huisnummer uit de mail wordt altijd aangehouden — PDOK levert het basisnummer, de mail
heeft vaak de toevoeging ("12 A", "12-16").

### Het vastgoedobject

| Route | Zekerheid |
|---|---|
| De VvE-code uit de mail komt overeen met een object | 100 % |
| Postcode + huisnummer komen overeen | 100 % |
| Straat + huisnummer komen overeen | 90 % |
| Het huisnummer valt binnen een straatbereik van een complex ("Delftselaan 7 t/m 79") | 70 %, of 40 % als de klant niet overeenkomt |

### Categorie en werkmaatschappij

De categorie moet voorkomen in de **categorielijst van Bouw7**. Op de servicedesk-postbus is
het bovendien geen vrije keuze: daar wordt hij geklemd op **Dagelijks onderhoud** of
**Mutatie**, want alleen die twee namen maken een dossier tot servicedeskwerk.

De werkmaatschappij volgt een vaste rangorde:

1. **De mail noemt er zelf een** die wij kennen → die wint.
2. **Anders de categorie**: `Schilderwerk` → Everts Onderhoudsschilders B.V.; elke andere
   categorie → Bouwbedrijf Morgenstond B.V.
3. **Anders** de standaard van de postbus.

Stap 1 staat bewust bovenaan. Zonder die stap zou Dakdekkersbedrijf Dakplan nooit meer
gekozen kunnen worden, ook niet als de opdrachtgever hem letterlijk aanschrijft.

### De datums

- **Aanvraagdatum** = de datum waarop de mail binnenkwam, tenzij er in de stukken een andere
  staat.
- **Deadline** = wat de mail noemt; staat er niets, dan **aanvraagdatum + 4 weken**.

Die afgeleide deadline is geen onschuldig invulveld: hij gaat naar Bouw7 als **opleverdatum**
en loopt daar mee in de bewaking. Daarom staat er in het scherm bij dat hij is afgeleid, en
wordt dat ook in het besluitenlogboek vastgelegd.

### Het mandaat

Alleen overgenomen als de stukken er ook een mandaatwoord bij zetten — *mandaat*, *budget*,
*tot maximaal*, *kostenlimiet*, *plafond*. Een los bedrag in een servicedeskbon is veel vaker
de geschatte prijs dan het mandaat.

### Staat dit al ingeschreven?

Deze controle draait **altijd**, ook als een mens het bericht behandelt. Er wordt gezocht via
vijf ingangen — dezelfde klant, hetzelfde adres, dezelfde referentie, dezelfde mailconversatie
en dezelfde bijlage:

| Signaal | Gewicht |
|---|---|
| Een eerdere mail uit dezelfde conversatie hangt al aan een dossier | 1,00 |
| Een identieke bijlage hangt al aan een dossier | 0,90 |
| Ons dossiernummer wordt in de mail genoemd | 0,50 |
| Zelfde werkadres (postcode + huisnummer) | 0,45 |
| Zelfde referentie van de opdrachtgever | 0,40 |
| De omschrijving lijkt sterk op de titel van een dossier | tot 0,20 |
| Zelfde bedrag (binnen 1 %) | 0,10 |

Vanaf **0,55** gaat een nieuwe aanvraag altijd naar een mens, met een bevestigingsvraag die
het gevonden dossier en de redenen toont. Er wordt gezocht in werk van de afgelopen
**18 maanden**. Ons nummer wordt ook op alleen de cijfers vergeleken, zodat "2026-1234",
"20261234" en "offerte 1234" hetzelfde dossier vinden.

### Kan Bouw7 er een net project van maken?

Vóórdat er iets wordt aangemaakt controleert EVA of de klant in Bouw7 staat, of de
contactpersoon er staat, of de werkmaatschappij een vestiging heeft (daarop bepaalt Bouw7 het
projectnummer) en of de categorie bestaat. Zonder die controle maakt Bouw7 het project gewoon
aan, maar zónder klant of met een nummer uit de verkeerde reeks.

### De gevraagde werkzaamheden

Bij elke mail die over werk gaat — een aanvraag, een opdracht of een servicedeskbon — draait
een tweede leesronde over de mail en álle bijlagen. Die levert een korte opsomming van het
gevraagde werk op, in de taal van een calculator. Veel kleine verspreide punten worden
samengevat in één regel, niet overgetikt. Wat onduidelijk is krijgt een regel die met
"Onduidelijk:" begint.

Deze ronde draaide eerst alleen bij een offerteaanvraag, omdat een opdrachtbon "toch maar één
regel" zou zijn. Dat bleek niet te kloppen: een bon verwijst naar een bestek, stelt eisen aan
de uitvoering en noemt voorwaarden. Bij een opdracht zag EVA daardoor alleen de krappe
veldextractie — en ging op die halve lezing beslissen.

---

## 4. Route A — een aanvraag wordt een nieuw dossier

Dit gebeurt er, in deze volgorde, of een mens op de knop drukt of EVA het zelf doet:

1. **Het dossier wordt aangemaakt** met dezelfde functie als de knop *Nieuwe aanvraag*, in
   **fase Aanvraag met substatus Nieuw**. De projectnaam wordt
   `{Straat huisnr}, {Plaats} - {Omschrijving}`. Meegegeven worden: opdrachtgever,
   contactpersoon, categorie, referentie, werkmaatschappij, VvE-code, aanvraagdatum, deadline,
   opmerkingen, het volledige werkadres en het gevonden vastgoedobject.
2. **Bouw7 krijgt het project meteen doorgestuurd.** Lukt dat niet, dan blijft het EVA-dossier
   staan met een foutmelding erbij — liever een dossier zonder Bouw7-nummer dan een verloren
   aanvraag.
3. **Het mandaat** wordt weggeschreven, als de bon er een noemde.
4. **De gevraagde werkzaamheden** komen op het dossier, met een herkomstregel eronder. Heb je
   de tekst bijgeschaafd, dan wordt jouw versie opgeslagen.
5. **De bijlagen gaan naar de SharePoint-dossiermap**, met de ontvangstdatum vóór de
   bestandsnaam (`2026-09-16 opdrachtbon.pdf`). Dat voorkomt dat een tweede "opdrachtbon.pdf"
   de eerste overschrijft.
6. **Het bericht wordt gekoppeld** aan het dossier, de relatie en de contactpersoon, en gaat
   op de stand *Verwerkt*.
7. **Het adres wordt onthouden** als alias, zodat de volgende mail van diezelfde persoon
   direct herkend wordt.
8. **De mail wordt in Outlook afgehandeld** (§7).

Heeft EVA het **zelf** gedaan, dan komt daar een **actie** bij — "Controleer automatisch
aangemaakt dossier {nummer}" — op naam van de behandelaar van die postbus, plus een melding
aan de rolhouders van het nieuwe dossier. Automatisch aanmaken gebeurt nooit stil.

---

## 5. Route B — een opdracht wint een bestaande offerte

Een opdracht maakt **geen** nieuw dossier. Hij zet de offerte die wij hebben uitgebracht op
gewonnen, waarna het dossier vanzelf naar **fase Opdracht, substatus Nieuwe opdracht** gaat.

### Welke offerte?

EVA zet de kandidaten op volgorde met de redenen erbij. Bovenaan staat wat op dit werkadres
slaat of een eigen aanwijzing heeft; alle andere lopende offertes van deze opdrachtgever staan
achter een uitklapper. Bij een vastgoedbeheerder met tientallen lopende offertes is een lange
lijst namelijk geen hulp.

Voorselecteren gebeurt alleen als er niets te kiezen valt: precies één treffer boven de 0,80.
Zijn er meerdere, dan staat er niets aangevinkt en verschijnt de waarschuwing dat er meerdere
offertes passen. Is er geen enkele, dan staat er een zoekveld om zelf het dossier aan te
wijzen. **EVA maakt voor een opdracht nooit zelf een dossier aan.**

Boven de keuze staat wat EVA uit de mail heeft herkend — opdrachtgever, contactpersoon en
werkadres — met daaronder wat er op het gekozen dossier staat. Zo zie je in één oogopslag of
de opdracht bij een ander aanspreekpunt of een ander factuuradres hoort dan de offerte.

Het gekozen dossier moet in de **offertefase** staan. Staat het nog op aanvraag of al op
opdracht, dan weigert de knop met die reden erbij.

### Wat er dan gebeurt

1. **De offerte gaat op gewonnen.** In Bouw7 schuift het project naar "02. Nieuwe opdracht",
   de werkbegroting wordt overgenomen als planningsbudget en de aanneemsom wordt
   weggeschreven. Staat Bouw7 inmiddels anders (iemand heeft het daar gewijzigd), dan stopt
   EVA en vraagt of je dat wilt volgen of tóch wilt doorzetten.
2. **De opdrachtdatum** wordt op de datum van de bon gezet.
3. **De opdrachtreferentie** wordt ingevuld.
4. **Het factuuradres** wordt gecontroleerd. Stond er een factuuradres op de opdracht, dan is
   dát de beginstand — de klant heeft het er niet voor niets bij gezet. Verder kun je kiezen
   voor het adres van de offerte, een ander adres dat al bij deze klant staat, of een nieuw
   adres dat ter plekke wordt vastgelegd. De opdrachtgever zelf verandert niet; dit gaat
   alleen over waar de factuur heen gaat.
4b. **De contactpersoon** van de offerte blijft staan, tenzij je aanvinkt dat de persoon uit
   de opdracht die moet vervangen. Wie de bon stuurt is lang niet altijd het aanspreekpunt —
   soms is het de administratie — dus dit gebeurt nooit vanzelf.
5. **De opmerking van de klant** wordt een notitie op het dossier.
6. **De bijlagen gaan naar de SharePoint-dossiermap.**
7. **De verkooptermijnen worden aangemaakt** volgens de betalingsconditie van de offerte, in
   Bouw7. Staat daar al een termijnstaat, dan blijft die met rust. Is er geen betalingsconditie
   af te leiden — bijvoorbeeld bij een offerte die buiten EVA is gemaakt — dan wordt er
   **niets** geschreven en komt er een actie om het met de hand te doen. Terugvallen op een
   standaardschema zou betekenen dat je factureert volgens een indeling die niemand heeft
   afgesproken.
8. **De mail wordt afgehandeld** in Outlook.

Er is **geen weg terug** na stap 1. Wat daarna misgaat wordt gemeld en krijgt een actie, maar
draait het gewonnen dossier niet terug — dat kan ook niet, de Bouw7-wijziging is dan al gedaan.

---

## 6. Route C — een servicedeskbon

Eerst kijkt EVA of er een offerte bij hoort:

- **Wél een offerte** → route B, met de categorie geklemd op Dagelijks onderhoud of Mutatie.
- **Geen offerte** → route A: een nieuw dossier, met diezelfde twee categorieën als enige
  keuze, en het mandaat ingevuld als de bon er een noemt.

Die categorieklem is geen detail. Of een dossier bij de servicedesk opduikt hangt volledig aan
de categorie; staat daar iets anders, dan belandt de bon in het aanvragenscherm.

---

## 6b. Mail in de verkeerde postbus

Een servicedeskbon naar `opdrachten@`, een offerteaanvraag naar `servicedesk@` — dat gebeurt,
en het adres waar iets binnenkwam mag niet bepalen wat ermee gebeurt.

**Alles wat telt volgt de inhoud, niet de bus:**

- de **soort** komt uit de mailtekst en de bijlagen; de postbus is in de prompt niet meer dan
  een aanwijzing;
- de **route** volgt uit die soort;
- de **categorieklem** op Dagelijks onderhoud / Mutatie geldt voor een servicedeskbon, waar hij
  ook vandaan komt — en geldt niet voor een offerteaanvraag die per ongeluk op de
  servicedeskbus belandde;
- de **actie** gaat naar de behandelaar van de postbus die bij de inhoud hoort. Een storing in
  `opdrachten@` komt dus bij Marga terecht, niet bij Tom.

**De melding blijft wél bij de ontvangende postbus.** Dat is hun mailbox, en zij horen te weten
wat erin binnenkwam — ook als iemand anders het afhandelt.

---

## 7. Wanneer EVA het zelf mag doen

Automatisch handelen staat nu **overal uit**. Zet je het aan voor een postbus, dan gelden deze
voorwaarden — en faalt er één, dan komt het bericht in het Postvak met de reden erbij.

**Voor beide routes:**

1. De AI is voor minstens 90 % zeker van de soort.
2. De afzender is voor minstens 85 % herkend, en er is precies één mogelijke opdrachtgever.
3. De mail gaat niet over meerdere werkadressen tegelijk.
4. Er zat geen bijlage bij die niet gelezen kon worden.
5. Het dagbudget voor deze postbus is nog niet op.

**Extra voor een nieuw dossier (route A):**

6. Het is geen antwoord in een lopend gesprek (geen `RE:` of `FW:`).
7. Alle verplichte velden zijn ingevuld en het werkadres is door PDOK bevestigd.
8. Omschrijving, straat en categorie zijn elk voor minstens 80 % zeker.
9. Bouw7 kan er een net project van maken.
10. De hoogste duplicaatscore ligt onder 0,55.

**Extra voor het winnen van een offerte (route B):**

6. Er is **precies één** offertetreffer boven de 0,80 — ons nummer letterlijk in de mail,
   dezelfde mailconversatie of dezelfde bijlage.

Dat een opdracht een antwoord is op onze eigen offertemail blokkeert route B *niet*: zo komt
een akkoord vrijwel altijd binnen. Voor een nieuwe aanvraag is een antwoord juist wél een
reden om te stoppen.

---

## 8. Wie krijgt het als EVA twijfelt

De calculator en de projectleider zijn op dat moment nog niet aan een dossier gekoppeld — bij
een vers bericht zijn die rollen leeg. Daarom heeft elke postbus een **standaard behandelaar**:

| Postbus | Behandelaar |
|---|---|
| Offerteaanvragen | Bas Hania |
| Opdrachten | Tom Kamminga |
| Servicedesk | Marga Rijnsburger |

In te stellen bij Instellingen → Mailintake. Wordt een bericht voorgelegd, dan verschijnt er
een **actie** op naam van die persoon, met de reden erbij en een looptijd van twee dagen. Het
bericht zelf blijft zonder eigenaar in het Postvak staan.

> **Let op:** een medewerker zonder EVA-login kan geen acties ontvangen. Het instellingenscherm
> zegt dat erbij, en de actie wordt wél aangemaakt zodat hij terug te vinden is zodra het
> account er is. Marga heeft op dit moment nog geen login.

Daarnaast blijven de gewone meldingen bestaan naar de mensen die per postbus als ontvanger
staan ingesteld: nieuw te behandelen, onbekende afzender, EVA weet niet wat dit is.

---

## 9. Wat er in Outlook gebeurt

Eén vaste regel voor alle drie de postbussen, met één principe:

> **Een beslissing van een mens haalt de mail uit het zicht. Een beslissing van de machine nooit.**

| Stand | Wie besliste | Wat er gebeurt |
|---|---|---|
| Dossier aangemaakt, gekoppeld of offerte gewonnen | mens óf EVA | Naar de map **Verwerkt door EVA**, categorie `EVA: {dossiernummer}`, als gelezen gemarkeerd |
| Genegeerd | mens, met reden | Naar **Verwerkt door EVA**, categorie `EVA: genegeerd` |
| Geen aanvraag | EVA | **Blijft ongelezen in Postvak IN**, alleen de categorie `EVA: geen aanvraag` |
| Wacht op een mens | — | Blijft onaangeroerd in Postvak IN |
| Mislukt | — | Blijft onaangeroerd in Postvak IN |

**De noodrem.** Bij Instellingen → Mailintake staat één bedrijfsbrede schakelaar met drie
standen: *Aan*, *Alleen categorie* en *Uit*. Hij staat nu op **Alleen categorie**. Verplaatsen
is de enige stap in deze hele module die zichtbaar is voor mensen die niet in EVA werken.

Mislukt het verplaatsen, dan wordt er **niets** teruggedraaid; de bewakingscron probeert het
opnieuw.

---

## 10. Wat EVA nooit doet

- **Mail versturen of verwijderen.** De app-registratie heeft daar geen recht toe.
- **Zelf een klant of contactpersoon aanmaken.** De AI levert een naam als tekst; welke relatie
  daarbij hoort bepaalt de code, en een nieuwe relatie maakt altijd een mens.
- **Een opdracht als losse aanvraag inschrijven.** Vindt EVA geen offerte, dan gaat het naar
  een mens.
- **Een bestaande termijnstaat overschrijven.**
- **Een meerwerkregel aanmaken of op akkoord zetten.**
- **Hoeveelheden, maten of prijzen verzinnen.**
- **Iets in Bouw7 overschrijven** buiten de projectstatus en de aanneemsom die bij het winnen
  van een offerte horen.

---

## 11. Wat er bewust nog niet in zit

- **Meerwerk.** Een meerwerkmail wordt herkend en voorgelegd, maar de meerwerkregel maak je
  zelf. Dat raakt de termijnenboekhouding en is een eigen traject.
- **Een afwijkende factuurpartij.** De controle gaat over het postadres. Moet een ándere
  relatie de factuur krijgen, dan regel je dat op de dossierpagina.
- **Nog geen kwaliteitsscherm.** De cijfers over hoe vaak EVA het goed had, en wat de AI per
  dag kost, worden wel vastgelegd maar zijn nog niet in een scherm te zien.
- **Nog niet getest tegen een echte mailbox.** Alles hierboven is de werking volgens de code;
  de eerste weken moeten uitwijzen hoe de triage zich houdt tegen de werkelijke post.

---

## 12. Wat je de eerste weken moet nalopen

De duurste fout is een gemiste aanvraag, en die is als enige onzichtbaar — er komt geen
melding van iets dat niet is aangemaakt. Loop daarom wekelijks tien berichten uit de bak
**Geen aanvraag** met de hand na.

Verder, met aflopende urgentie:

- Hoe vaak corrigeerde iemand de **soort**? Vooral: hoe vaak stond er "geen werk" bij iets dat
  wél een aanvraag bleek.
- Hoe vaak wees EVA de **juiste offerte** aan bij een opdracht? Een verkeerde treffer zet de
  verkeerde offerte op gewonnen.
- Hoe vaak klopte het **voorstel** precies? Boven de 95 % kan de drempel omlaag, onder de 80 %
  moet hij omhoog.
- Dossiers die uit de mail komen en binnen twee weken alweer vervallen zijn.
- Dubbel aangemaakte dossiers: zelfde klant, zelfde adres, binnen 30 dagen.
- Opdrachten waarbij de **verkooptermijnen** niet konden worden aangemaakt; daar staat een
  actie voor klaar, maar het is ook een signaal dat de offerte geen betalingsconditie had.
