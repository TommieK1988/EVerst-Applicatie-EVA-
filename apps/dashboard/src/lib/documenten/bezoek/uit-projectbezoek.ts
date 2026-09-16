/**
 * uit-projectbezoek.ts — een projectbezoek als bezoekrapport.
 *
 * Een bezoek is opgebouwd rond disciplines: de projectleider koos de vakken die in uitvoering
 * waren, legde er punten bij vast en gaf per vak een percentage. Dat levert twee hoofdstukken op
 * die bewust van elkaar verschillen:
 *
 *  * **Bevindingen** — alléén de punten die hij als aandachtspunt heeft aangemerkt. Die staan in
 *    `oplever_punten` en hebben daarmee een nummer, een status en opvolging. Dit is het
 *    actielijstje: wat er nog moet gebeuren.
 *
 *  * **Per onderdeel** — álle punten, gegroepeerd per discipline, met de voortgang erbij. Dit is
 *    het verslag: wat er is gezien.
 *
 * Alles als bevinding opnemen zou de twee hoofdstukken dubbelop maken, en alleen het verslag
 * tonen zou de opvolging onzichtbaar maken.
 */

import 'server-only'
import { createAdminClient } from '@everts/database/server'
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
  type BezoekBlok, type BezoekBevinding, type BezoekDisciplineRij, type Rij,
} from './contract'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

const AFGEHANDELD = new Set(['opgelost', 'geaccepteerd'])
const NIET_ACTIEF = new Set(['nieuw', 'afgewezen'])

const STANDAARD_INLEIDING =
  'Tijdens dit projectbezoek zijn de op dat moment zichtbare en bereikbare onderdelen van het '
  + 'werk beoordeeld. Wat daarbij is vastgelegd, staat hieronder.'

export async function bouwBezoekUitProjectbezoek(
  bezoekId: string,
  keuze: BezoekOpties,
  opties: { preview?: boolean } = {},
): Promise<BezoekBlok> {
  const supabase = db()
  const { data: bezoek } = await supabase
    .from('projectbezoeken').select('*').eq('id', bezoekId).maybeSingle()
  if (!bezoek) return { ...LEEG_BEZOEK_BLOK, per_pagina: keuze.per_pagina }

  // Alles begrensd op dit ene bezoek; geen paginering nodig.
  const [{ data: gekozen }, { data: puntRijen }, { data: fotos }, { data: medewerker }] =
    await Promise.all([
      supabase.from('projectbezoek_disciplines')
        .select('discipline_code, voortgang_pct, volgorde')
        .eq('bezoek_id', bezoekId).order('volgorde'),
      supabase.from('projectbezoek_punten')
        .select('id, discipline_code, volgnummer, tekst, is_aandachtspunt, oplever_punt_id')
        .eq('bezoek_id', bezoekId).order('volgnummer'),
      supabase.from('projectbezoek_fotos')
        .select('id, soort, punt_id, url, toelichting').eq('bezoek_id', bezoekId).order('volgorde'),
      bezoek.uitgevoerd_door
        ? supabase.from('medewerkers').select('voornaam, tussenvoegsel, achternaam')
            .eq('id', bezoek.uitgevoerd_door).maybeSingle()
        : Promise.resolve({ data: null }),
    ])

  const disciplineRijen = (gekozen ?? []) as {
    discipline_code: string; voortgang_pct: number | null
  }[]
  const punten = (puntRijen ?? []) as Record<string, unknown>[]
  const bezoekFotos = (fotos ?? []) as Record<string, unknown>[]

  const codes = disciplineRijen.map(d => d.discipline_code)
  const { data: discData } = codes.length
    ? await supabase.from('kwaliteit_disciplines').select('code, naam').in('code', codes)
    : { data: [] }
  const naamPerCode = new Map(
    ((discData ?? []) as { code: string; naam: string }[]).map(d => [d.code, d.naam]),
  )

  // ── De aangevinkte aandachtspunten uit het dossierregister ─────────────
  const opleverIds = punten
    .map(p => p.oplever_punt_id as string | null).filter(Boolean) as string[]
  const { data: opleverData } = opleverIds.length
    ? await supabase.from('oplever_punten')
        .select('id, volgnummer, omschrijving, ruimte, status, deadline, created_at')
        .in('id', opleverIds).order('volgnummer')
    : { data: [] }
  const opleverPerId = new Map(
    ((opleverData ?? []) as Record<string, unknown>[]).map(o => [String(o.id), o]),
  )

  const aandachtspunten = punten.filter(p => {
    const o = opleverPerId.get(String(p.oplever_punt_id ?? ''))
    return o && !NIET_ACTIEF.has(String(o.status))
  })
  if (!opties.preview && aandachtspunten.length > MAX_BEVINDINGEN) {
    throw new Error(
      `Dit bezoek bevat ${aandachtspunten.length} aandachtspunten; het maximum is ${MAX_BEVINDINGEN}.`,
    )
  }

  // ── Foto's ─────────────────────────────────────────────────────────────
  // Eerste foto per punt; de rest valt buiten het rapport. Het fotobudget is één vlakke
  // array met drie blokken achter elkaar — let op de offsets hieronder.
  const eersteFotoPerPunt = new Map<string, string>()
  for (const f of bezoekFotos) {
    const pid = f.punt_id ? String(f.punt_id) : ''
    if (pid && !eersteFotoPerPunt.has(pid)) eersteFotoPerPunt.set(pid, String(f.url))
  }
  const losseFotos = bezoekFotos.filter(f => !f.punt_id)

  const gekozenAandacht = opties.preview
    ? aandachtspunten.slice(0, keuze.per_pagina * 2)
    : aandachtspunten

  const teHalen = keuze.toon_fotos
    ? [
        ...gekozenAandacht.map(p => veiligeFotoUrl(eersteFotoPerPunt.get(String(p.id)))),
        ...punten.map(p => veiligeFotoUrl(eersteFotoPerPunt.get(String(p.id)))),
        ...losseFotos.map(f => veiligeFotoUrl(String(f.url))),
      ]
    : []
  const opgehaald = await mapMetLimiet(teHalen, FOTO_GRENZEN.PARALLEL, haalRapportFoto)
  // 'laat_vallen': liever een rapport zonder de laatste foto's dan geen rapport.
  const dataUrls = pasFotoBudgetToe(opgehaald, 'laat_vallen')
  const aandachtFoto = (i: number) => dataUrls[i] ?? ''
  const puntFoto = (i: number) => dataUrls[gekozenAandacht.length + i] ?? ''
  const losseFoto = (i: number) => dataUrls[gekozenAandacht.length + punten.length + i] ?? ''

  // ── Bevindingen: de aandachtspunten ────────────────────────────────────
  const bevindingen: BezoekBevinding[] = gekozenAandacht.map((p, i) => {
    const o = opleverPerId.get(String(p.oplever_punt_id))!
    const status = String(o.status ?? 'open')
    const groep = naamPerCode.get(String(p.discipline_code)) ?? String(p.discipline_code)
    return {
      ...LEGE_BEVINDING,
      nummer: `AP-${String(o.volgnummer).padStart(2, '0')}`,
      volgnummer: Number(o.volgnummer),
      titel: groep,
      omschrijving: String(o.omschrijving ?? p.tekst ?? ''),
      omschrijving_kort: afkappen(String(o.omschrijving ?? p.tekst ?? ''), 220),
      locatie: String(o.ruimte ?? groep),
      groep,
      status,
      status_label: opleverPuntStatusLabels[status as keyof typeof opleverPuntStatusLabels] ?? status,
      is_open: !AFGEHANDELD.has(status),
      is_opgelost: AFGEHANDELD.has(status),
      datum: o.created_at ? datumNL(String(o.created_at)) : '',
      hersteldatum: o.deadline ? datumNL(String(o.deadline)) : '',
      foto: aandachtFoto(i),
      heeft_foto: !!aandachtFoto(i),
    }
  })

  // ── Per onderdeel: alle punten, gegroepeerd per discipline ─────────────
  const puntIndex = new Map(punten.map((p, i) => [String(p.id), i]))
  const disciplines: BezoekDisciplineRij[] = disciplineRijen.map(d => {
    const naam = naamPerCode.get(d.discipline_code) ?? d.discipline_code
    const eigen = punten.filter(p => String(p.discipline_code) === d.discipline_code)
    const regels: Rij[] = eigen.map(p => {
      const i = puntIndex.get(String(p.id)) ?? -1
      const foto = i >= 0 && keuze.toon_fotos ? puntFoto(i) : ''
      const o = opleverPerId.get(String(p.oplever_punt_id ?? ''))
      return {
        nummer: `P-${String(p.volgnummer).padStart(2, '0')}`,
        tekst: String(p.tekst ?? ''),
        tekst_kort: afkappen(String(p.tekst ?? ''), 220),
        is_aandachtspunt: p.is_aandachtspunt === true,
        aandachtspunt_nummer: o ? `AP-${String(o.volgnummer).padStart(2, '0')}` : '',
        status_label: o
          ? (opleverPuntStatusLabels[String(o.status) as keyof typeof opleverPuntStatusLabels] ?? String(o.status))
          : '',
        disciplinefoto: foto,
        heeft_foto: !!foto,
      }
    })
    const pct = d.voortgang_pct
    return {
      code: d.discipline_code,
      naam,
      discipline_naam: naam,
      voortgang_pct: pct ?? 0,
      // Een streepje en geen lege cel: in de voortgangstabel moet te zien zijn dat er níéts is
      // opgegeven, en dat is iets anders dan 0 % gereed.
      voortgang_label: pct === null || pct === undefined ? '—' : `${pct} %`,
      heeft_voortgang: pct !== null && pct !== undefined,
      disciplinepunten: regels,
      heeft_disciplinepunten: regels.length > 0,
      aantal_punten: regels.length,
    }
  })

  // Alleen de namen. De percentages staan in de voortgangstabel; ze hier herhalen levert
  // twee plekken op die uit elkaar kunnen lopen zodra er één verandert.
  const disciplinesRegel = disciplines.map(d => d.discipline_naam).join(', ')

  // ── Waarnemingen: de overzichtsfoto's van het bezoek zelf ──────────────
  const waarnemingen: Rij[] = keuze.toon_waarnemingen
    ? losseFotos
        .map((f, i) => ({
          omschrijving: String(f.toelichting ?? '') || 'Overzicht',
          locatie: '', groep: 'Bezoek',
          foto: losseFoto(i), foto_klein: losseFoto(i), heeft_foto: !!losseFoto(i),
        }))
        .filter(r => r.heeft_foto)
    : []

  const open = bevindingen.filter(b => b.is_open).length
  const kengetallen: Rij[] = [
    { label: 'Bekeken disciplines', waarde: disciplines.length, is_negatief: false },
    { label: 'Vastgelegde punten', waarde: punten.length, is_negatief: false },
    { label: 'Als aandachtspunt', waarde: bevindingen.length, is_negatief: bevindingen.length > 0 },
    { label: 'Nog open', waarde: open, is_negatief: true },
  ].filter(k => Number(k.waarde) > 0)

  const naam = medewerker
    ? [medewerker.voornaam, medewerker.tussenvoegsel, medewerker.achternaam].filter(Boolean).join(' ')
    : ''

  const genummerd = bevindingen.map((b, i) => ({ ...b, volgnummer: i + 1 }))

  return {
    ...LEEG_BEZOEK_BLOK,
    aanwezig: true,
    soort: 'projectbezoek',
    soort_label: BEZOEK_SOORT_LABELS.projectbezoek,
    titel: `${BEZOEK_SOORT_LABELS.projectbezoek} PB-${String(bezoek.volgnummer).padStart(2, '0')}`,
    kenmerk: `PB-${String(bezoek.volgnummer).padStart(2, '0')}`,
    datum: datumNL(bezoek.datum),
    tijd: bezoek.tijd ? String(bezoek.tijd).slice(0, 5) : '',
    uitvoerder: naam,
    locatie: bezoek.locatie ?? '',
    werkzaamheden: bezoek.werkzaamheden ?? '',
    omstandigheden: bezoek.weer ?? '',
    inleiding: keuze.inleiding || STANDAARD_INLEIDING,
    samenvatting_regel: samenvattingsregel(disciplines, punten.length, bevindingen.length, open),
    kengetallen,
    heeft_kengetallen: kengetallen.length > 0,
    alle_bevindingen: genummerd,
    paginas: knipInPaginas(genummerd, { perPagina: keuze.per_pagina, itemVeld: 'bevindingen' }),
    heeft_bevindingen: genummerd.length > 0,
    aantal_bevindingen: genummerd.length,
    aantal_open: open,
    disciplines,
    heeft_disciplines: disciplines.length > 0,
    disciplines_regel: disciplinesRegel,
    waarnemingen,
    heeft_waarnemingen: waarnemingen.length > 0,
    opmerkingen: bezoek.algemene_opmerkingen ?? '',
    disclaimer: bezoekDisclaimer('projectbezoek'),
    per_pagina: keuze.per_pagina,
  }
}

function samenvattingsregel(
  disciplines: BezoekDisciplineRij[],
  totaal: number,
  aandacht: number,
  open: number,
): string {
  const kop = disciplines.length
    ? `Tijdens dit bezoek is gekeken naar ${lijst(disciplines.map(d => d.discipline_naam.toLowerCase()))}.`
    : 'Tijdens dit bezoek is het werk beoordeeld.'

  if (totaal === 0) return `${kop} Er zijn geen punten vastgelegd.`
  const punten = totaal === 1 ? 'Er is 1 punt vastgelegd' : `Er zijn ${totaal} punten vastgelegd`
  if (aandacht === 0) return `${kop} ${punten}; geen daarvan vraagt opvolging.`
  const staart = open === 0
    ? 'Die zijn allemaal afgehandeld.'
    : (open === 1 ? 'Daarvan staat er 1 nog open.' : `Daarvan staan er ${open} nog open.`)
  return `${kop} ${punten}, waarvan ${aandacht} als aandachtspunt op het dossier. ${staart}`
}

/** "a, b en c" — leest prettiger dan een opsomming met komma's in een klantdocument. */
function lijst(items: string[]): string {
  if (items.length <= 1) return items[0] ?? ''
  return `${items.slice(0, -1).join(', ')} en ${items[items.length - 1]}`
}
