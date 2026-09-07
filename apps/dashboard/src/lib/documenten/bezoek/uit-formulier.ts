/**
 * uit-formulier.ts — een ingevuld inspectieformulier als bezoekrapport.
 *
 * Leest het **bevroren** schema uit `form_versies` en de antwoorden uit
 * `form_inzendingen.waarden`. Bevroren is hier wezenlijk: een sjabloon dat later verandert
 * mag een al verstuurd rapport niet met terugwerkende kracht anders laten lezen.
 *
 * Bewust NIET hergebruikt: `buildBlokken` uit `components/formulieren/pdf-schema.ts`. Dat
 * levert jsPDF-georiënteerde blokken (met `Afbeelding`-objecten en eigen handtekening- en
 * herhalingsblokken) en trekt `fetchBriefpapier` mee. Een eigen kleine walk over de velden
 * is hier helderder en koppelt de twee uitvoerpaden niet aan elkaar.
 *
 * Welke antwoorden worden bevindingen? Alleen de velden van het type `aandachtspunt` — dat
 * is het enige veldtype dat semantisch "hier is iets mis" betekent. De rest wordt een rij in
 * "Wat er is beoordeeld". Een formulierschema kent geen vlag "dit antwoord is een
 * bevinding", en die toevoegen zou een wijziging in het bevroren schema vragen.
 */

import 'server-only'
import { createAdminClient } from '@everts/database/server'
import type { FormField, FormSchema, AandachtspuntWaarde } from '@/components/formulieren/types'
import { isInvoerVeld } from '@/components/formulieren/types'
import { formatVeldwaardeTekst } from '@/components/formulieren/format'
import { datumNL, afkappen } from '../format'
import { knipInPaginas } from '../rapport-paginas'
import {
  FOTO_GRENZEN, mapMetLimiet, haalRapportFoto, pasFotoBudgetToe, veiligeFotoUrl,
} from '../rapport-fotos'
import type { BezoekOpties } from '../bezoek-opties'
import {
  LEEG_BEZOEK_BLOK, LEGE_BEVINDING, BEZOEK_SOORT_LABELS, bezoekDisclaimer,
  type BezoekBlok, type BezoekBevinding, type Rij, type BezoekSoort,
} from './contract'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

export interface FormulierBron {
  kenmerk: string
  datum: string
  uitvoerder: string
  bevindingen: BezoekBevinding[]
  punten: Rij[]
  handtekeningen: Rij[]
}

/**
 * Leest één inzending uit en zet hem om in de bouwstenen van een bezoekrapport.
 * Apart exporteerbaar omdat de veiligheidsronde dezelfde inzendingen gebruikt.
 */
export async function leesInzending(
  inzendingId: string,
  keuze: BezoekOpties,
): Promise<FormulierBron | null> {
  const { data: inzending } = await db()
    .from('form_inzendingen')
    .select('id, template_id, versie_id, waarden, status, ingediend_op, aangemaakt_op, ingevuld_door_naam')
    .eq('id', inzendingId)
    .maybeSingle()
  if (!inzending) return null

  const [{ data: versie }, { data: template }] = await Promise.all([
    db().from('form_versies').select('schema').eq('id', inzending.versie_id).maybeSingle(),
    db().from('form_templates').select('naam').eq('id', inzending.template_id).maybeSingle(),
  ])

  const schema = (versie?.schema ?? { version: 1, fields: [] }) as FormSchema
  const waarden = (inzending.waarden ?? {}) as Record<string, unknown>

  const punten: Rij[] = []
  const aandachtspunten: { veld: FormField; waarde: AandachtspuntWaarde; groep: string }[] = []
  const handtekeningVelden: { veld: FormField; waarde: unknown }[] = []
  let groep = ''

  const loopVelden = (velden: FormField[], prefix = '') => {
    for (const veld of velden) {
      // Een kop begint een nieuwe sectie; die naam wordt de groep van wat erna komt.
      if (veld.type === 'heading') { groep = veld.label ?? ''; continue }
      if (!isInvoerVeld(veld)) continue

      const waarde = waarden[veld.id]

      if (veld.type === 'aandachtspunt') {
        const lijst = Array.isArray(waarde) ? (waarde as AandachtspuntWaarde[]) : []
        for (const ap of lijst) {
          if (typeof ap?.omschrijving === 'string' && ap.omschrijving.trim()) {
            aandachtspunten.push({ veld, waarde: ap, groep })
          }
        }
        continue
      }

      if (veld.type === 'signature') {
        handtekeningVelden.push({ veld, waarde })
        continue
      }

      // Herhalende sectie: elke ronde als eigen rijen, met een volgnummer in de groepsnaam.
      if (veld.type === 'repeatable' && Array.isArray(waarde)) {
        const kinderen = veld.children ?? []
        ;(waarde as Record<string, unknown>[]).forEach((rij, i) => {
          const buitenGroep = groep
          groep = `${veld.label} ${i + 1}`
          for (const kind of kinderen) {
            if (!isInvoerVeld(kind) || kind.type === 'signature') continue
            const tekst = formatVeldwaardeTekst(kind, rij?.[kind.id])
            if (!keuze.toon_niet_beoordeeld && tekst === '—') continue
            punten.push({
              code: '', groep, onderdeel: kind.label ?? '',
              vraag: kind.label ?? '', resultaat: tekst, opmerking: '',
            })
          }
          groep = buitenGroep
        })
        continue
      }

      const tekst = formatVeldwaardeTekst(veld, waarde)
      // Een leeg antwoord is "niet beoordeeld"; dat mag de opsteller weglaten.
      if (!keuze.toon_niet_beoordeeld && tekst === '—') continue
      punten.push({
        code: prefix, groep, onderdeel: veld.label ?? '',
        vraag: veld.label ?? '', resultaat: tekst, opmerking: veld.helpText ?? '',
      })
    }
  }
  loopVelden(schema.fields ?? [])

  // ── Foto's bij de aandachtspunten ──────────────────────────────────────
  const fotoUrls = keuze.toon_fotos
    ? aandachtspunten.map(a => veiligeFotoUrl(a.waarde.fotos?.[0]))
    : []
  const opgehaald = await mapMetLimiet(fotoUrls, FOTO_GRENZEN.PARALLEL, haalRapportFoto)
  const fotos = pasFotoBudgetToe(opgehaald, 'laat_vallen')

  const bevindingen: BezoekBevinding[] = aandachtspunten.map((a, i) => ({
    ...LEGE_BEVINDING,
    nummer: `AP-${String(i + 1).padStart(2, '0')}`,
    volgnummer: i + 1,
    titel: a.waarde.ruimte ?? '',
    omschrijving: a.waarde.omschrijving,
    omschrijving_kort: afkappen(a.waarde.omschrijving, 220),
    locatie: a.waarde.ruimte ?? '',
    groep: a.groep,
    status: 'open',
    status_label: 'Open',
    is_open: true,
    datum: inzending.ingediend_op ? datumNL(inzending.ingediend_op) : '',
    foto: fotos[i] ?? '',
    heeft_foto: !!fotos[i],
  }))

  // ── Handtekeningen ─────────────────────────────────────────────────────
  const htUrls = keuze.toon_handtekeningen
    ? handtekeningVelden.map(h => veiligeFotoUrl(typeof h.waarde === 'string' ? h.waarde : ''))
    : []
  const htOpgehaald = await mapMetLimiet(htUrls, FOTO_GRENZEN.PARALLEL, haalRapportFoto)
  const htBeelden = pasFotoBudgetToe(htOpgehaald, 'laat_vallen')
  const handtekeningen: Rij[] = handtekeningVelden.map((h, i) => ({
    rol: h.veld.name ?? '',
    rol_label: h.veld.label ?? 'Ondertekend door',
    naam: inzending.ingevuld_door_naam ?? '',
    datum: inzending.ingediend_op ? datumNL(inzending.ingediend_op) : '',
    methode: 'pad',
    beeld: htBeelden[i] ?? '',
    heeft_beeld: !!htBeelden[i],
  }))

  return {
    kenmerk: template?.naam ?? 'Formulier',
    datum: datumNL(inzending.ingediend_op ?? inzending.aangemaakt_op),
    uitvoerder: inzending.ingevuld_door_naam ?? '',
    bevindingen,
    punten,
    handtekeningen,
  }
}

export async function bouwBezoekUitFormulier(
  inzendingId: string,
  keuze: BezoekOpties,
): Promise<BezoekBlok> {
  const bron = await leesInzending(inzendingId, keuze)
  if (!bron) return { ...LEEG_BEZOEK_BLOK, per_pagina: keuze.per_pagina }
  return naarBlok(bron, keuze, 'formulier', STANDAARD_INLEIDING)
}

/** Gedeeld met de veiligheidsronde: dezelfde bouwstenen, andere soort en inleiding. */
export function naarBlok(
  bron: FormulierBron,
  keuze: BezoekOpties,
  soort: BezoekSoort,
  inleiding: string,
  extra: Partial<BezoekBlok> = {},
): BezoekBlok {
  const open = bron.bevindingen.filter(b => b.is_open).length
  const kengetallen: Rij[] = [
    { label: 'Beantwoorde vragen', waarde: bron.punten.length },
    { label: 'Vastgelegde punten', waarde: bron.bevindingen.length, is_negatief: true },
  ].filter(k => Number(k.waarde) > 0)

  return {
    ...LEEG_BEZOEK_BLOK,
    aanwezig: true,
    soort,
    soort_label: BEZOEK_SOORT_LABELS[soort],
    titel: `${BEZOEK_SOORT_LABELS[soort]} ${bron.kenmerk}`.trim(),
    kenmerk: bron.kenmerk,
    datum: bron.datum,
    uitvoerder: bron.uitvoerder,
    inleiding: keuze.inleiding || inleiding,
    samenvatting_regel: samenvattingsregel(bron.punten.length, bron.bevindingen.length),
    kengetallen,
    heeft_kengetallen: kengetallen.length > 0,
    alle_bevindingen: bron.bevindingen,
    paginas: knipInPaginas(bron.bevindingen, { perPagina: keuze.per_pagina, itemVeld: 'bevindingen' }),
    heeft_bevindingen: bron.bevindingen.length > 0,
    aantal_bevindingen: bron.bevindingen.length,
    aantal_open: open,
    punten: bron.punten,
    heeft_punten: bron.punten.length > 0,
    handtekeningen: keuze.toon_handtekeningen ? bron.handtekeningen : [],
    heeft_handtekeningen: keuze.toon_handtekeningen && bron.handtekeningen.length > 0,
    disclaimer: bezoekDisclaimer(soort),
    per_pagina: keuze.per_pagina,
    ...extra,
  }
}

function samenvattingsregel(vragen: number, punten: number): string {
  const kop = vragen === 1 ? '1 vraag beantwoord.' : `${vragen} vragen beantwoord.`
  if (punten === 0) return `${kop} Er zijn geen punten vastgelegd.`
  return `${kop} Er ${punten === 1 ? 'is 1 punt' : `zijn ${punten} punten`} vastgelegd.`
}

const STANDAARD_INLEIDING =
  'Dit rapport geeft de antwoorden weer zoals die tijdens het bezoek op locatie zijn vastgelegd.'
