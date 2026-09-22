'use client'

/**
 * Voorbeeldpagina van het mailintake-behandelscherm, met verzonnen gegevens.
 *
 * WAAROM DIT BESTAAT
 * Het echte scherm zit achter de Microsoft-login, en er moet een bericht door de
 * molen zijn geweest om er iets op te zien. Dat maakt een opmaakcontrole duur en
 * daarmee gebeurt hij niet — terwijl juist opmaakfouten (een label dat afkapt, een
 * kolom die buiten beeld valt, een kop die niet op het raster ligt) door geen
 * enkele type-check of build worden gevangen.
 *
 * WAAROM HET ÉCHTE SCHERM EN GEEN NAMAAK
 * Deze pagina rendert `BerichtBehandelen` zelf met gemaakte props. Een nagebouwde
 * kopie zou meteen gaan afwijken van het origineel, en dan keur je iets goed wat
 * niemand te zien krijgt.
 *
 * De knoppen doen niets zinnigs: de server-acties erachter hebben een sessie en
 * een echt bericht nodig. Dit is om naar te kíjken.
 *
 * Bereikbaar zonder in te loggen omdat `middleware.ts` alles onder `/auth/`
 * overslaat. `className="eva"` op de wortel is nodig: de DS-tokens (--bg-elev,
 * --fg, --border) staan in globals.css onder die klasse, niet op :root.
 */

import React from 'react'

import { DialoogProvider } from '@/components/ui/dialogen'
import BerichtBehandelen from '@/app/(platform)/mailintake/[id]/BerichtBehandelen'

const WERKMAATSCHAPPIJEN = [
  { id: 'wm-schilders', naam: 'Everts Onderhoudsschilders B.V.' },
  { id: 'wm-bouw', naam: 'Bouwbedrijf Morgenstond B.V.' },
  { id: 'wm-dak', naam: 'Dakdekkersbedrijf Dakplan B.V.' },
]

const CATEGORIEEN = [
  { id: 44966, name: 'Schilderwerk' },
  { id: 44967, name: 'Bouwkundig Onderhoud' },
  { id: 44968, name: 'Dagelijks onderhoud' },
  { id: 45009, name: 'Mutatie' },
  { id: 45010, name: 'Renovatie' },
]

const MEDEWERKERS = [
  { id: 'm1', naam: 'Bas Hania' },
  { id: 'm2', naam: 'Tom Kamminga' },
  { id: 'm3', naam: 'Marga Rijnsburger' },
]

/** Zoals de lezing hem oplevert: van alles zeker, behalve de werkmaatschappij. */
const VELDEN = {
  omschrijving: 'Relinen keukenstandleidingen fase 2 (modelstrang)',
  klant_naam: 'Het Vastgoedbureau B.V.',
  contactpersoon_naam: 'Frits de Zwart',
  contactpersoon_email: 'f.dezwart@hetvastgoedbureau.nl',
  werkadres_straat: 'Bachstraat',
  werkadres_huisnummer: '436',
  werkadres_postcode: '2324 GZ',
  werkadres_stad: 'Leiden',
  referentie: '184-64879-6',
  vve_code: '184-C',
  categorie_voorstel: 'Renovatie',
  werkmaatschappij_voorstel: null,
  aard_van_het_werk: 'bouwkundig',
  deadline: null,
  mandaat_bedrag: 3372.73,
  opmerkingen: 'Vriendelijk verzoek ons te laten weten wanneer dit ingepland wordt.',
  regie: false,
  regie_aanwijzing: null,
  factuuradres_naam: null,
  factuuradres_straat: null,
  factuuradres_postcode: null,
  factuuradres_plaats: null,
}

const ZEKERHEID = {
  omschrijving: 0.92,
  klant_naam: 1,
  contactpersoon_naam: 0.88,
  werkadres_straat: 1,
  werkadres_huisnummer: 1,
  werkadres_postcode: 1,
  werkadres_stad: 1,
  referentie: 0.95,
  vve_code: 0.9,
  categorie_voorstel: 0.72,
  werkmaatschappij_voorstel: 0.3,
  deadline: 0,
  mandaat_bedrag: 1,
}

const DETAIL = {
  bericht: {
    id: 'voorbeeld',
    onderwerp: 'Opdrachtbon 184-64879-6',
    van_naam: 'Barbara Vogelesang',
    van_adres: 'bv@vvebeheer.nl',
    aan: ['opdrachten@everts.chat'],
    cc: [],
    ontvangen_op: '2026-09-21T09:34:49+00:00',
    body_tekst:
      'Geachte heer/mevrouw,\n\nHierbij verzoeken wij u namens VvE Papsouwselaan/Artemisstraat '
      + 'te Delft onderstaande melding af te handelen.\n\n'
      + 'Opdracht: Opdracht voor uw offerte met kenmerk 202600293 (zie bijlage)\n\n'
      + 'Betreft: Relinen van de keukenstandleidingen, fase 2, modelstrang.\n\n'
      + 'Vriendelijk verzoek ons te laten weten wanneer dit ingepland wordt en dit af te '
      + 'stemmen met de bewoner.\n\nUrgentie: Hoog.\n'
      + 'Maximaal factuurbedrag: 3.372,73 euro inclusief BTW\n\n'
      + 'U kunt ter plaatse contact opnemen met: De heer J.W. van Dop, 06 - 126 876 43.',
    status: 'wacht_op_mens',
    soort: 'opdrachtbon',
    soort_vertrouwen: 0.84,
    heeft_bijlagen: true,
    postbus: { naam: 'Opdrachten', sleutel: 'opdrachten', standaard_werkmaatschappij_id: null },
    relatie: { id: 'r1', naam: 'Het Vastgoedbureau B.V.' },
    contactpersoon: { id: 'c1', naam: 'Frits de Zwart' },
    dossier: null,
    object: null,
    gevraagde_werkzaamheden:
      'Keukenstandleidingen relinen in de modelstrang.\n'
      + 'Bestaande leidingen reinigen en camera-inspectie vooraf.\n'
      + 'Onduidelijk: of de standleiding in de kruipruimte ook meegenomen wordt.',
    buiten_scope: 'Herstel van tegelwerk in de keukens.',
    aandachtspunten: 'Bewoner is overdag aanwezig; werkzaamheden afstemmen.',
    bouw7_ontbreekt: [],
    mens_zegt_werk: false,
  },
  postbus: { naam: 'Opdrachten', sleutel: 'opdrachten' },
  bijlagen: [
    {
      id: 'b1', bestandsnaam: 'Opdrachtbon 184-64879-6.pdf', content_type: 'application/pdf',
      grootte_bytes: 88_400, opslag_pad: 'x', te_groot: false, is_inline: false,
    },
    {
      id: 'b2', bestandsnaam: 'Offerte 202600293.pdf', content_type: 'application/pdf',
      grootte_bytes: 214_900, opslag_pad: 'x', te_groot: false, is_inline: false,
    },
    {
      id: 'b3', bestandsnaam: 'image003.jpg', content_type: 'image/jpeg',
      grootte_bytes: 612_000, opslag_pad: 'x', te_groot: false, is_inline: true,
    },
  ],
  groepsMails: [],
  extractie: { velden: VELDEN, gekeurde_velden: VELDEN, vertrouwen: ZEKERHEID },
  duplicaten: [],
  log: [
    {
      id: 'l1', moment: '2026-09-21T09:36:00+00:00', actor: 'systeem', actie: 'beoordeeld',
      details: {
        redenen: [
          'EVA denkt aan "opdrachtbon", maar niet zeker genoeg om zelf te handelen.',
          'De werkmaatschappij is niet bepaald; kies zelf tussen de schilders en bouw.',
          'Er is geen offerte gevonden die hierbij hoort — wijs zelf het juiste dossier aan.',
        ],
      },
    },
  ],
}

/**
 * De twee routes zien er van binnen anders uit, en dat is precies wat er
 * beoordeeld moet worden. Een aanvraag toont het formulier met de vaste secties;
 * een opdracht toont de offertekeuze. De buitenkant hoort hetzelfde te blijven.
 */
function aanvraagVariant() {
  return {
    ...DETAIL,
    bericht: {
      ...DETAIL.bericht,
      onderwerp: 'Offerteaanvraag Bachstraat 436 e.o. te Leiden',
      soort: 'offerteaanvraag',
      soort_vertrouwen: 0.93,
    },
    log: [{
      ...DETAIL.log[0],
      details: {
        redenen: [
          'De werkmaatschappij is niet bepaald; kies zelf tussen de schilders en bouw.',
          'Het werkadres kon niet worden bevestigd.',
        ],
      },
    }],
  }
}

export default function Voorbeeld() {
  const [aanvraag, setAanvraag] = React.useState(true)
  const knop = (actief: boolean) => ({
    padding: '6px 12px', borderRadius: 6, fontSize: 13, cursor: 'pointer',
    border: `1px solid ${actief ? 'hsl(var(--primary))' : 'var(--border)'}`,
    background: actief ? 'hsl(var(--primary))' : 'var(--surface)',
    color: actief ? 'hsl(var(--primary-foreground))' : 'var(--fg)',
    fontWeight: actief ? 600 : 400,
  })

  return (
    <div className="eva" style={{ background: 'var(--bg)', minHeight: '100vh', padding: '28px 32px' }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button type="button" style={knop(aanvraag)} onClick={() => setAanvraag(true)}>
          A — aanvraag
        </button>
        <button type="button" style={knop(!aanvraag)} onClick={() => setAanvraag(false)}>
          B — opdracht
        </button>
      </div>

      <div style={{
        marginBottom: 16, padding: '8px 12px', borderRadius: 8, fontSize: 12.5,
        background: 'var(--wa-50, #fff6ec)', border: '1px solid var(--wa-200, #fde68a)',
        color: 'var(--wa-900, #78350f)',
      }}>
        Voorbeeldpagina met verzonnen gegevens. De knoppen en zoekvelden werken niet —
        de acties erachter hebben een sessie nodig. De foutmelding linksonder in beeld
        hoort daarbij.
      </div>

      <DialoogProvider key={aanvraag ? 'a' : 'b'}>
        <BerichtBehandelen
          detail={(aanvraag ? aanvraagVariant() : DETAIL) as never}
          objectTreffer={null}
          werkmaatschappijen={WERKMAATSCHAPPIJEN}
          categorieen={CATEGORIEEN}
          medewerkers={MEDEWERKERS}
          magSchrijven
        />
      </DialoogProvider>
    </div>
  )
}
