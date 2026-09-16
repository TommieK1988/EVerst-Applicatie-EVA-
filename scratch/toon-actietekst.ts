/**
 * Toont hoe de actietekst eruitziet die een behandelaar krijgt.
 *
 * Draaien: npx tsx scratch/toon-actietekst.ts
 *
 * Geen toets maar een afdruk: de tekst is bedoeld voor een mens, dus de enige
 * zinnige controle is hem lezen. De opbouw hieronder is een kopie van de regels
 * uit verwerken.ts; wijkt die af, dan klopt deze afdruk niet meer.
 */

import { MAIL_SOORT_LABELS, type MailSoort } from '../apps/dashboard/src/lib/mailintake/types'

type Velden = {
  omschrijving: string | null
  werkadresStraat: string | null
  werkadresHuisnummer: string | null
  werkadresStad: string | null
  adresBevestigd: boolean
  categorieNaam: string | null
  deadline: string | null
  deadlineAfgeleid: boolean
  referentie: string | null
  opdrachtReferentie: string | null
  mandaatBedrag: number | null
}

function bouwTekst(
  berichtId: string,
  bericht: { onderwerp: string | null; van_naam: string | null; van_adres: string | null },
  redenen: string[],
  context: { velden?: Velden; relatieNaam?: string | null; soort?: string | null },
): string {
  const afzender = bericht.van_naam || bericht.van_adres || 'onbekende afzender'
  const v = context.velden
  const regels: string[] = []

  regels.push('Waarom dit wordt voorgelegd:')
  for (const r of redenen.slice(0, 4)) regels.push(`- ${r}`)

  regels.push('')
  regels.push(`Van: ${afzender}${bericht.van_naam && bericht.van_adres ? ` <${bericht.van_adres}>` : ''}`)
  regels.push(`Onderwerp: ${bericht.onderwerp ?? '(geen onderwerp)'}`)
  if (context.soort) regels.push(`EVA denkt: ${MAIL_SOORT_LABELS[context.soort as MailSoort] ?? context.soort}`)

  if (v) {
    const ingevuld: string[] = []
    const ontbreekt: string[] = []
    const noteer = (label: string, waarde: unknown, extra = '') => {
      if (waarde) ingevuld.push(`- ${label}: ${String(waarde)}${extra}`)
      else ontbreekt.push(`- ${label}`)
    }

    if (context.relatieNaam) ingevuld.push(`- Opdrachtgever: ${context.relatieNaam}`)
    else ontbreekt.push('- Opdrachtgever (kies of maak de relatie)')

    noteer('Werk', v.omschrijving)
    const adres = [v.werkadresStraat, v.werkadresHuisnummer].filter(Boolean).join(' ')
    noteer('Adres', adres && v.werkadresStad ? `${adres}, ${v.werkadresStad}` : adres || null,
      v.adresBevestigd ? '' : ' (niet bevestigd door PDOK)')
    noteer('Categorie', v.categorieNaam)
    if (v.deadline) {
      ingevuld.push(`- Deadline: ${v.deadline}${v.deadlineAfgeleid ? ' (afgeleid: aanvraagdatum + 4 weken)' : ''}`)
    }
    if (v.referentie) ingevuld.push(`- Referentie klant: ${v.referentie}`)
    if (v.opdrachtReferentie) ingevuld.push(`- Opdrachtreferentie: ${v.opdrachtReferentie}`)
    if (v.mandaatBedrag != null) ingevuld.push(`- Mandaat: ${v.mandaatBedrag}`)

    if (ingevuld.length) {
      regels.push('')
      regels.push('Dit heeft EVA al ingevuld:')
      regels.push(...ingevuld)
    }
    if (ontbreekt.length) {
      regels.push('')
      regels.push('Dit moet je zelf aanvullen of controleren:')
      regels.push(...ontbreekt)
    }
  }

  regels.push('')
  regels.push(`Afhandelen in EVA: /mailintake/${berichtId}`)
  return regels.join('\n')
}

const kaal: Velden = {
  omschrijving: null, werkadresStraat: null, werkadresHuisnummer: null, werkadresStad: null,
  adresBevestigd: false, categorieNaam: null, deadline: null, deadlineAfgeleid: false,
  referentie: null, opdrachtReferentie: null, mandaatBedrag: null,
}

function toon(titelRegel: string, titel: string, tekst: string) {
  console.log(`\n${'═'.repeat(76)}\n${titelRegel}\n${'═'.repeat(76)}`)
  console.log(`TITEL:  ${titel}\n`)
  console.log(tekst)
}

// ── 1. Onbekende afzender bij een verder complete aanvraag ───────────────────
toon(
  'Geval 1 — offerteaanvraag, afzender niet herkend',
  'Beoordeel offerteaanvragen van J. de Groot',
  bouwTekst('a1b2c3d4-0000-0000-0000-000000000001',
    { onderwerp: 'Offerteaanvraag schilderwerk Delftselaan', van_naam: 'J. de Groot', van_adres: 'jdegroot@vvebeheerdelft.nl' },
    ['De afzender is niet herkend als bestaande klant.'],
    {
      relatieNaam: null,
      soort: 'offerteaanvraag',
      velden: {
        ...kaal,
        omschrijving: 'Buitenschilderwerk kozijnen en dakkapellen',
        werkadresStraat: 'Delftselaan', werkadresHuisnummer: '7', werkadresStad: 'Den Haag',
        adresBevestigd: true, categorieNaam: 'Schilderwerk',
        deadline: '2026-10-14', deadlineAfgeleid: true,
      },
    }),
)

// ── 2. Opdracht zonder gevonden offerte ──────────────────────────────────────
toon(
  'Geval 2 — opdracht, geen offerte gevonden',
  'Beoordeel opdrachten van Woonstad Rotterdam',
  bouwTekst('a1b2c3d4-0000-0000-0000-000000000002',
    { onderwerp: 'Opdrachtbevestiging 45012 — Van Speykstraat', van_naam: 'Woonstad Rotterdam', van_adres: 'inkoop@woonstad.nl' },
    ['Er is geen offerte gevonden die hierbij hoort — wijs zelf het juiste dossier aan.'],
    {
      relatieNaam: 'Woonstad Rotterdam',
      soort: 'opdracht_op_offerte',
      velden: {
        ...kaal,
        omschrijving: 'Vervangen dakbedekking blok C',
        werkadresStraat: 'Van Speykstraat', werkadresHuisnummer: '112', werkadresStad: 'Rotterdam',
        adresBevestigd: true, categorieNaam: 'Bouwkundig Onderhoud',
        opdrachtReferentie: '45012', referentie: 'INK-2026-0912',
      },
    }),
)

// ── 3. Twijfel over de soort, weinig ingevuld ────────────────────────────────
toon(
  'Geval 3 — EVA weet niet wat het is',
  'Beoordeel servicedesk van info@vveplus.nl',
  bouwTekst('a1b2c3d4-0000-0000-0000-000000000003',
    { onderwerp: 'FW: vraag over het complex', van_naam: null, van_adres: 'info@vveplus.nl' },
    [
      'EVA is onzeker over wat voor bericht dit is (62%).',
      'Er zit een bijlage bij die EVA niet kon lezen — er kan informatie ontbreken.',
    ],
    {
      relatieNaam: 'VvE Plus Beheer',
      soort: 'servicedeskbon',
      velden: { ...kaal, mandaatBedrag: 1500 },
    }),
)

console.log('')
