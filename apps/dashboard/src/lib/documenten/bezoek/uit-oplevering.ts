/**
 * uit-oplevering.ts — een oplevering als bezoekrapport.
 *
 * Leunt volledig op `getOplevermomentRapport(momentId)`: dat levert het moment, het dossier,
 * de klant, het werkadres, de punten mét foto's en reacties, de losse aandachtspunten en de
 * handtekeningen, en filtert de niet-actieve statussen (nieuw/afgewezen) al weg. Wat hier bij
 * komt is de vertaling naar het gedeelde contract plus het inladen van de foto's als
 * data-URL.
 *
 * Twee dingen die dit rapport bewust NIET toont:
 *  - **wie een punt moet oplossen.** `getOplevermomentRapport` levert `toegewezenNaam` sowieso
 *    als null, en voor een document dat naar de opdrachtgever gaat is dat de juiste keuze:
 *    wie het werk doet is onze interne verdeling.
 *  - **reacties**, tenzij expliciet aangezet. Daar staat afstemming in die intern bedoeld is.
 *
 * Dit vervangt het bestaande pdf-lib-opleverrapport níét. Dat blijft de mailbijlage en het
 * interne werkdocument; zie de noot in `lib/dossiers/oplever-rapport-pdf.ts`.
 */

import 'server-only'
import { getOplevermomentRapport, type OpleverRapport, type OpleverPuntView } from '@/lib/dossiers/oplevering'
import { splitsFotos } from '@/lib/dossiers/oplever-fotos'
import { opleverPuntStatusLabels } from '@everts/database/platform-types'
import { datumNL, afkappen } from '../format'
import { knipInPaginas } from '../rapport-paginas'
import {
  FOTO_GRENZEN, mapMetLimiet, haalRapportFoto, pasFotoBudgetToe, veiligeFotoUrl,
} from '../rapport-fotos'
import type { BezoekOpties } from '../bezoek-opties'
import { MAX_BEVINDINGEN } from '../bezoek-opties'
import {
  LEEG_BEZOEK_BLOK, LEGE_BEVINDING, BEZOEK_SOORT_LABELS, bezoekDisclaimer,
  type BezoekBlok, type BezoekBevinding, type Rij,
} from './contract'

/** Statussen waarbij het punt als afgehandeld geldt. */
const AFGEHANDELD = new Set(['opgelost', 'geaccepteerd'])

const STANDAARD_INLEIDING =
  'Bij deze oplevering is het uitgevoerde werk gezamenlijk nagelopen. De punten die daarbij zijn '
  + 'vastgelegd, staan hieronder met de afgesproken afhandeling erbij.'

export async function bouwBezoekUitOplevering(
  momentId: string,
  keuze: BezoekOpties,
  opties: { preview?: boolean } = {},
): Promise<BezoekBlok> {
  const rapport = await getOplevermomentRapport(momentId)
  if (!rapport) return { ...LEEG_BEZOEK_BLOK, per_pagina: keuze.per_pagina }

  // Opleverpunten (OP) en losse aandachtspunten (AP) hebben elk hun eigen nummerreeks; het
  // voorvoegsel houdt ze uit elkaar in één lijst.
  const alle: { punt: OpleverPuntView; prefix: string }[] = [
    ...rapport.punten.map(p => ({ punt: p, prefix: 'OP' })),
    ...rapport.aandachtspunten.map(p => ({ punt: p, prefix: 'AP' })),
  ]

  if (!opties.preview && alle.length > MAX_BEVINDINGEN) {
    throw new Error(
      `Dit rapport bevat ${alle.length} punten; het maximum is ${MAX_BEVINDINGEN}. `
      + 'Kies een ander oplevermoment of splits de rapportage.',
    )
  }
  const gekozen = opties.preview ? alle.slice(0, keuze.per_pagina * 2) : alle

  // ── Foto's ─────────────────────────────────────────────────────────────
  // Per punt hooguit één voor- en één na-foto: meer past niet op een rapportpagina.
  // `veiligeFotoUrl` weert alles buiten onze eigen publieke bucket — deze URL's komen deels
  // van een publiek tokenportaal en worden hieronder server-side opgehaald.
  const gesplitst = gekozen.map(x => splitsFotos(x.punt.fotos ?? []))
  const teHalen = keuze.toon_fotos
    ? [
        ...gesplitst.map(f => veiligeFotoUrl(f.voor[0]?.url)),
        ...gesplitst.map(f => (keuze.toon_voor_na ? veiligeFotoUrl(f.na[0]?.url) : '')),
      ]
    : []
  const opgehaald = await mapMetLimiet(teHalen, FOTO_GRENZEN.PARALLEL, haalRapportFoto)
  // 'laat_vallen': liever een rapport zonder de laatste foto's dan helemaal geen rapport —
  // een oplevering moet de deur uit kunnen.
  const dataUrls = pasFotoBudgetToe(opgehaald, 'laat_vallen')
  const voorFoto = (i: number) => dataUrls[i] ?? ''
  const naFoto = (i: number) => dataUrls[gekozen.length + i] ?? ''

  // ── Bevindingen ────────────────────────────────────────────────────────
  const bevindingen: BezoekBevinding[] = gekozen.map(({ punt, prefix }, i) => {
    const statusLabel = opleverPuntStatusLabels[punt.status] ?? punt.status
    const reacties: Rij[] = keuze.toon_reacties
      ? (punt.reacties ?? []).map(r => ({
          tekst: r.opmerking ?? '',
          datum: r.created_at ? datumNL(r.created_at) : '',
        }))
      : []
    return {
      ...LEGE_BEVINDING,
      nummer: `${prefix}-${String(punt.volgnummer).padStart(2, '0')}`,
      volgnummer: punt.volgnummer,
      // Een opleverpunt heeft geen aparte titel; de ruimte is waar de lezer op zoekt.
      titel: punt.ruimte ?? '',
      omschrijving: punt.omschrijving ?? '',
      omschrijving_kort: afkappen(punt.omschrijving ?? '', 220),
      locatie: punt.ruimte ?? '',
      groep: punt.is_extra_werk ? 'Meerwerk' : '',
      status: punt.status,
      status_label: statusLabel,
      is_open: !AFGEHANDELD.has(punt.status),
      is_opgelost: AFGEHANDELD.has(punt.status),
      datum: punt.created_at ? datumNL(punt.created_at) : '',
      hersteldatum: punt.deadline ? datumNL(punt.deadline) : '',
      foto: voorFoto(i),
      heeft_foto: !!voorFoto(i),
      foto_na: naFoto(i),
      heeft_foto_na: !!naFoto(i),
      reacties,
      heeft_reacties: reacties.length > 0,
    }
  })

  const open = bevindingen.filter(b => b.is_open).length
  const kengetallen: Rij[] = [
    { label: 'Vastgelegde punten', waarde: bevindingen.length },
    { label: 'Afgehandeld', waarde: bevindingen.length - open },
    { label: 'Nog open', waarde: open, is_negatief: true },
  ].filter(k => Number(k.waarde) > 0)

  // ── Handtekeningen ─────────────────────────────────────────────────────
  const handtekeningen = keuze.toon_handtekeningen
    ? await bouwHandtekeningen(rapport)
    : []

  const moment = rapport.moment
  return {
    ...LEEG_BEZOEK_BLOK,
    aanwezig: true,
    soort: 'oplevering',
    soort_label: BEZOEK_SOORT_LABELS.oplevering,
    titel: `${BEZOEK_SOORT_LABELS.oplevering} ${moment.titel ?? ''}`.trim(),
    kenmerk: moment.titel ?? '',
    datum: datumNL(moment.opgeleverd_op ?? moment.created_at),
    uitvoerder: '',
    locatie: rapport.dossier.werkadres ?? '',
    inleiding: keuze.inleiding || STANDAARD_INLEIDING,
    samenvatting_regel: samenvattingsregel(bevindingen.length, open),
    kengetallen,
    heeft_kengetallen: kengetallen.length > 0,
    alle_bevindingen: bevindingen,
    paginas: knipInPaginas(bevindingen, { perPagina: keuze.per_pagina, itemVeld: 'bevindingen' }),
    heeft_bevindingen: bevindingen.length > 0,
    aantal_bevindingen: bevindingen.length,
    aantal_open: open,
    handtekeningen,
    heeft_handtekeningen: handtekeningen.length > 0,
    disclaimer: bezoekDisclaimer('oplevering'),
    per_pagina: keuze.per_pagina,
  }
}

function samenvattingsregel(totaal: number, open: number): string {
  if (totaal === 0) return 'Er zijn bij deze oplevering geen punten vastgelegd.'
  const kop = totaal === 1 ? 'Er is 1 punt vastgelegd.' : `Er zijn ${totaal} punten vastgelegd.`
  if (open === 0) return `${kop} Alle punten zijn afgehandeld.`
  return `${kop} Daarvan ${open === 1 ? 'staat er 1 nog open' : `staan er ${open} nog open`}.`
}

/**
 * Handtekeningen met hun beeld. Een akkoord op afstand heeft geen handtekeningpad; die krijgt
 * `heeft_beeld: false` en het sjabloon zet er "digitaal akkoord" neer.
 */
async function bouwHandtekeningen(rapport: OpleverRapport): Promise<Rij[]> {
  const lijst = rapport.handtekeningen ?? []
  const urls = lijst.map(h => veiligeFotoUrl(h.handtekening_url))
  const opgehaald = await mapMetLimiet(urls, FOTO_GRENZEN.PARALLEL, haalRapportFoto)
  const beelden = pasFotoBudgetToe(opgehaald, 'laat_vallen')

  return lijst.map((h, i) => ({
    rol: h.rol ?? '',
    rol_label: ROL_LABELS[h.rol ?? ''] ?? (h.rol ?? ''),
    naam: h.naam ?? '',
    datum: h.created_at ? datumNL(h.created_at) : '',
    methode: h.methode ?? '',
    beeld: beelden[i] ?? '',
    heeft_beeld: !!beelden[i],
  }))
}

/** Hoe we een rol naar de klant toe noemen. */
const ROL_LABELS: Record<string, string> = {
  opdrachtgever: 'Namens de opdrachtgever',
  bewoner: 'Namens de bewoner',
  uitvoerder: 'Namens ons',
  medewerker: 'Namens ons',
}
