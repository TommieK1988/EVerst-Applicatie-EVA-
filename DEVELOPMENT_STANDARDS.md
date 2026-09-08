# DEVELOPMENT STANDARDS — EVA

Regels waaraan nieuwe code in dit platform moet voldoen. Opgesteld naar aanleiding van de
technische audit van 3 september 2026. Doel: voorkomen dat nieuw werk — met de hand of door
een AI-assistent geschreven — opnieuw dezelfde technische schuld introduceert.

Elke regel hieronder is er gekomen omdat het in deze codebase aantoonbaar één keer mis is
gegaan. De motivatie staat erbij; zonder motivatie wordt een regel toch genegeerd.

---

## 1. Architectuurprincipes

**1.1 — Data-toegang loopt via de serverlaag, nooit vanuit een UI-component.**
Server Components en server-actions halen data op; client-componenten krijgen die als props.
De browser-client (`@everts/database/client`) is alleen toegestaan voor Storage-uploads en
het inlogscherm. Dit is nu al bijna overal zo (10 van de ~600 client-componenten wijken af) —
houd het zo.

**1.2 — Businesslogica staat in `src/lib/<domein>/`, niet in een component en niet in een action.**
Een server-action is een *dunne* schil: autoriseren → valideren → domeinfunctie aanroepen →
resultaat teruggeven. Rekenregels horen in pure, importeerbare functies (zoals
`src/lib/everts-calc/calculations.ts` — dat is het goede voorbeeld).

**1.3 — Eén rekenregel, één implementatie.**
Voordat je een berekening schrijft: zoek of hij al bestaat. In deze codebase bestonden
`berekenScenarioKostprijs` (calculations.ts) en `berekenScenarioKostprijsNieuw`
(local-store.ts) naast elkaar met verschillende uitkomsten. Vind je een tweede implementatie:
verwijder er één, niet allebei laten staan.

**1.4 — Nieuwe API-routes komen onder `src/app/api/`.**
Niet onder `(platform)/api/` en niet onder `(platform)/<module>/api/`. Er zijn nu drie
locaties in gebruik; nieuw werk kiest er één.

**1.5 — Gedeelde code hoort in `packages/`, niet gekopieerd.**
`@everts/ui` (173 regels) en `@everts/auth` (leeg) zijn skeletten. Vul ze aan bij de eerste
keer dat je iets voor de tweede keer nodig hebt, in plaats van te kopiëren.

---

## 2. Bestandsgrootte en componentverantwoordelijkheid

**2.1 — Maximaal 400 regels per bestand.** Boven de 400: opsplitsen. Boven de 800 in een PR:
motiveren in de commitmelding waarom het niet kan.
Referentie van wat we niet meer willen: `CalculatieGrid.tsx` (3492 regels, 65 `useState`,
22 `useEffect`), `lib/dossiers/actions.ts` (3559 regels, 55 exports).

**2.2 — Eén React-component = één verantwoordelijkheid.**
Meer dan 10 `useState` in één component betekent dat er state naar een `useReducer`, een hook
of een child-component moet.

**2.3 — Een `actions.ts` met meer dan 15 exports splitst per subdomein.**
`lib/dossiers/actions.ts` bevat nu lezen, schrijven, Bouw7-inkoop, uren, verkoop en
correcties door elkaar.

---

## 3. TypeScript

**3.1 — `any` is niet toegestaan in nieuwe code.** Gebruik `unknown` + een narrowing-check,
of genereer de juiste types.

**3.2 — `createAdminClient() as any` is verboden in nieuwe code.**
De Supabase-types worden gegenereerd (`generate_typescript_types`); loopt het schema voor op
de types, regenereer de types. Er staan nu 360 van deze casts; elke nieuwe maakt het probleem
groter en verbergt echte kolomfouten tot in productie.

**3.3 — Geen blinde casts op statuswaarden.**
`nieuweSubstatus as AanvraagSubstatus` (actions.ts:967) accepteert elke string als geldige
status. Valideer tegen de toegestane waarden (zie 6.2).

**3.4 — `tsc --noEmit` moet groen zijn vóór elke push.** Dat is hij nu; houd dat zo.
Let op: `tsc` vangt géén synchrone export uit een `'use server'`-module — draai ook
`npm run build` vóór een push naar `main`.

---

## 4. Security — de belangrijkste sectie

**4.1 — Elke muterende server-action begint met een autorisatiecheck.**
Geen uitzonderingen. Regel 1 van de functie:

```ts
export async function wijzigDossier(id: string, input: Invoer) {
  await vereisRecht('dossiers', 'schrijven')   // ← verplicht, altijd eerst
  ...
}
```

Waarom: 464 van de 852 server-actions staan in bestanden zónder enige guard, terwijl ze de
service-role-client gebruiken die RLS volledig omzeilt. De middleware controleert alleen
*of* iemand is ingelogd, niet *wat* die persoon mag. Een monteur of een klantportaal-account
kan zo'n action als kale POST aanroepen.

**4.2 — `vereisSessie()` is een tijdelijke tussenstap, geen eindstation.**
Gebruik hem alleen voor een module die nog niet in `AFGEDWONGEN_MODULES` staat, en zet er een
`// TODO(rechten): vervangen door vereisRecht zodra <module> afgedwongen is` bij.

**4.3 — Autorisatie hoort óók in de database, niet alleen in de app.**
Nieuwe tabellen krijgen een policy die de werkelijke toegangsregel uitdrukt. Een policy
`using (true)` voor `authenticated` is niet toegestaan: klantportaal-gebruikers en monteurs
zijn óók `authenticated`. `is_platform_gebruiker()` is een grove ondergrens, geen
autorisatiemodel — het maakt geen onderscheid tussen een calculator en een directielid.

**4.4 — Geheimen en tokens worden nooit in leesbare vorm opgeslagen.**
`oplever_toegang_tokens.token_raw` bewaart het ruwe token náást de hash, in een tabel die
elke ingelogde gebruiker mag lezen. Dat maakt het hashen zinloos. Wil je een link opnieuw
kunnen tonen: genereer een nieuwe.

**4.5 — Views zijn geen achterdeur.**
Een `SECURITY DEFINER`-view omzeilt de RLS van de onderliggende tabellen. Controleer bij
elke nieuwe view expliciet `grant`/`revoke` voor `anon` en `authenticated`. Vijf views zijn
nu leesbaar met alleen de publieke anon-key, waaronder persoonsgegevens.

**4.6 — Uploads valideren op grootte én inhoud, niet alleen op bestandsnaam.**
`file.name.endsWith('.docx')` zegt niets over de inhoud. Controleer MIME-type en een
maximale omvang, en saneer de bestandsnaam vóór hij in een opslagpad belandt.

**4.7 — Elke route-handler die iets teruggeeft over één record, controleert of de aanvrager
dat record mag zien.** Een geldige sessie is niet hetzelfde als toegang tot dossier X.

---

## 5. Database

**5.1 — Nooit een onbegrensde `.select()`.** PostgREST kapt stil af op 1000 rijen. Zie de
uitgebreide regel in `CLAUDE.md`. Elke select is gefilterd, expliciet één rij, of gepagineerd
via `haalAlleRijen()` met een stabiele `.order()`.

**5.2 — Elke foreign key op een kolom waarop gefilterd of gejoind wordt, krijgt een index.**
Er zijn nu ~175 FK-kolommen zonder index. Bij de huidige datavolumes (grootste tabel 10.7k
rijen) merk je dat niet; bij 100k rijen wel.

**5.3 — Migraties zijn additief en voorwaarts.** Naamgeving `YYYYMMDD<letter>_<onderwerp>.sql`.
Uitvoeren via de Supabase MCP `apply_migration`, niet via psql of Docker.

**5.4 — Een businessregel die geld of status raakt, hoort (ook) in de database.**
Check-constraints en triggers overleven een tweede client, een script en een AI-assistent die
de applicatielaag niet kent.

---

## 6. Businesslogica en statusovergangen

**6.1 — Statusovergangen worden gevalideerd, niet aangenomen.**
Er is nu geen enkele plek die controleert of een overgang is toegestaan; elke substatus kan
naar elke andere. Definieer per entiteit een expliciete overgangstabel en gooi een fout bij
een ongeldige overgang. `domein-proces.md` §5 beschrijft de bedoelde machines.

**6.2 — Statussen, rollen en drempelbedragen zijn geen losse strings in componenten.**
Eén definitie, geïmporteerd. Statusdefinities staan in
`src/components/dossiers/types.ts` en `packages/database/src/platform-types.ts`.

**6.3 — Een bedrag- of BTW-regel wordt niet in een component herhaald.**
Importeer uit `lib/everts-calc/calculations.ts`.

---

## 7. Error handling

**7.1 — Een `catch` die niets doet, is niet toegestaan.**
`catch {}` en `.catch(() => {})` (nu ~100 plekken) verbergen echte storingen. Minimaal:
`logFout()` aanroepen, of expliciet in een commentaar motiveren waarom de fout er niet toe
doet.

**7.2 — `console.error` is geen logging.** Op Vercel is dat spoor er de volgende dag niet
meer. Gebruik `logFout()` uit `lib/fouten/log.ts`.

**7.3 — Een `{ ok: false, error }`-retour die een echte storing weergeeft, logt óók.**
Er zijn 1331 van deze retourpaden en 5 handmatige `logFout`-aanroepen. Onderscheid daarom:
een verwachte afwijzing ("dossier is afgesloten") logt niet; een mislukte Bouw7-write of een
databasefout logt wel. Anders is een productiestoring achteraf niet te reconstrueren.

**7.4 — Toon de gebruiker een begrijpelijke melding, geen ruwe `error.message`.**

---

## 8. Validatie

**8.1 — Elke server-action die invoer van de gebruiker verwerkt, valideert die met Zod.**
Nu doen 17 van de 137 action-bestanden dat. TypeScript-types zijn compile-time; een
server-action is een publiek HTTP-endpoint en krijgt runtime wat de aanroeper stuurt.

**8.2 — Het Zod-schema is de brontype.** `z.infer<typeof schema>` in plaats van een los
handgeschreven `type`.

---

## 9. Testing

**9.1 — Nieuwe pure domeinfuncties komen met unit-tests.** Er zijn op dit moment nul tests in
de hele monorepo. Begin bij wat geld raakt: `calculations.ts`, `berekenContractTotaal`,
`kaart-bedrag.ts`, de BTW-splitsing en de uren-saldi.

**9.2 — Elke opgeloste productiebug krijgt een test die hem reproduceert.** Dat is de
goedkoopste manier om een suite op te bouwen zonder een testproject te starten.

**9.3 — Kritieke flows krijgen een end-to-end-test** zodra er een testrunner staat:
aanvraag → offerte → opdracht → oplevering → factuur, en de mobiele urenregistratie.

---

## 10. Naamgeving

**10.1 — Nederlands in domeincode, Engels in database- en integratienamen.**
Dat is de bestaande conventie (`dossiers`/`tasks`, `vereisRecht`/`quote_lines`) en hij is
consistent genoeg om te handhaven. Wissel niet halverwege een bestand.

**10.2 — Routes, mappen en DB-namen blijven `taken`/`tasks`,** ook al heet het in de
interface "Acties". Hernoem geen bestaande sleutels om de UI te volgen.

---

## 11. Logging en observability

**11.1 — De vraag "wat is er gisteren bij die gebruiker misgegaan?" moet beantwoordbaar zijn.**
De `onRequestError`-hook in `src/instrumentation.ts` vangt onafgevangen serverfouten. Alles
wat de code zelf afvangt, moet zelf loggen (zie 7.3).

**11.2 — Log nooit persoonsgegevens, tokens of wachtwoorden** in `fout_logboek` of in de
console.

**11.3 — Elke integratie-write (Bouw7, Graph, ULU) logt succes én mislukking**, met genoeg
context om hem opnieuw te kunnen uitvoeren.

---

## 12. Dependencies

**12.1 — Geen nieuwe library voor iets wat een bestaande al kan.**
Er zitten nu drie PDF-wegen in de app (`jspdf`, `pdf-lib`, Graph-conversie) en twee
XML-parsers. Kies bij nieuw werk een bestaande weg.

**12.2 — `npm audit` draait vóór elke release.** Er staan nu 20 kwetsbaarheden open
(3 critical, 11 high), waarvan de meeste een fix hebben — inclusief een critical in `next`
zelf.

**12.3 — Een dependency zonder fix (`xlsx`, `xmldom` via
`docxtemplater-image-module-free`) krijgt een expliciet besluit:** vervangen, of vastleggen
waarom het risico aanvaardbaar is.

---

## 13. Code review en werkwijze

**13.1 — Geen commit rechtstreeks op `main` zonder dat `npm run build`, `npm run lint` en
`npm run type-check` lokaal groen zijn.** Zolang er geen CI is, is dit handwerk — en dus een
afspraak.

**13.2 — Eén feature per branch, één onderwerp per commit.** De commitgrootte is nu gezond
(~6 bestanden per commit); houd dat vast.

**13.3 — Controleer je branch-achterstand vóór je bouwt** (`git fetch && git log
origin/main..HEAD`). Er zijn eerder features dubbel gebouwd omdat een worktree ver achterliep.

**13.4 — Een changelog-item pas ná merge naar `main`.** De `changelog`-tabel staat in
productie-Supabase en is meteen voor iedereen zichtbaar.

**13.5 — Bij een wijziging aan de rechten-, RLS- of tokenlaag: laat een tweede persoon
meekijken.** Dat is de enige laag waar een fout stil is én naar buiten lekt.

---

## 14. Voor AI-assistenten in het bijzonder

- Los het probleem structureel op; stapel geen workaround op een workaround.
- Schrijf geen commentaar dat de implementatie niet dekt. Klopt het commentaar niet meer,
  pas het aan of haal het weg.
- Verwijder code die je vervangt. Laat geen tweede, ongebruikte implementatie achter.
- Als je een guard, validatie of test weglaat: zeg dat expliciet in je antwoord, verstop het
  niet.
- Vraag niet om een refactor van de halve applicatie. Verbeter wat je aanraakt, laat de rest
  met rust.
