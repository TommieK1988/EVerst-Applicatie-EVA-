/**
 * kwaliteit-rapport.ts
 *
 * Bouwt het `kwaliteit`-blok van de renderkontext voor documentsoort `kwaliteitsrapport`.
 * Analoog aan `houtrot-rapport.ts`: alleen geladen wanneer het sjabloon erom vraagt, zodat een
 * bewonersbrief geen inspectiegegevens ophaalt.
 *
 * Wat dit blok wél en niet doet, volgt uit het ontwerp van de module:
 *  - **Alleen daadwerkelijk uitgevoerde metingen** komen in de metingentabel. Een niet-uitgevoerde
 *    meting is geen resultaat en hoort niet in een rapport aan de opdrachtgever.
 *  - **Geen kwaliteitspercentage.** Een steekproef rechtvaardigt geen "96% kwaliteit"; er komen
 *    alleen absolute aantallen uit.
 *  - **Niet beoordeeld staat er expliciet in**, met de disclaimer erbij. Wat niet is beoordeeld
 *    mag nergens als goedgekeurd worden gelezen.
 *  - **Positieve waarnemingen zijn een eigen hoofdstuk.** Het rapport mag niet uitsluitend fouten
 *    tonen.
 *  - De **eis komt uit het snapshot** op het resultaat, niet uit de bibliotheek van vandaag; een
 *    later bijgestelde grenswaarde verandert een verzonden rapport niet met terugwerkende kracht.
 */

import 'server-only'
import { createAdminClient } from '@everts/database/server'
import type {
  KwaliteitAfwijking,
  KwaliteitControlepunt,
  KwaliteitEis,
  KwaliteitFoto,
  KwaliteitInspectie,
  KwaliteitResultaat,
  KwaliteitWaarneming,
} from '@everts/database/kwaliteit-types'
import {
  kwaliteitAfwijkingStatusLabels,
  kwaliteitBronTypeLabels,
  kwaliteitErnstLabels,
  kwaliteitResultaatStatusLabels,
} from '@everts/database/kwaliteit-types'
import { eenheidLabel, eisOmschrijving, getalNL, samenvatting } from '@/lib/kwaliteit/regels'
import {
  FOTO_GRENZEN, mapMetLimiet, haalRapportFoto, pasFotoBudgetToe, veiligeFotoUrl,
} from './rapport-fotos'
import { knipInPaginas } from './rapport-paginas'
import { haalAlleRijen } from '@/lib/supabase/paginate'
import { datumNL, afkappen, volledigeNaam } from './format'
import {
  parseKwaliteitOpties, KWALITEIT_OPTIES_SLEUTEL, MAX_AFWIJKINGEN,
  type KwaliteitRapportOpties,
} from './kwaliteit-opties'

// ── Grenzen ───────────────────────────────────────────────────────────────

const TE_VEEL = (n: number) =>
  `Dit rapport bevat ${n} afwijkingen; het maximum is ${MAX_AFWIJKINGEN}. ` +
  'Kies een andere inspectie of splits de rapportage.'

// ── Contexttypes (dit is wat de sjabloonmaker in Word aanspreekt) ──────────

interface Rij { [k: string]: unknown }

export interface KwaliteitBlok {
  /** true zodra er een inspectie is gevonden; `{#kwaliteit.aanwezig}` in het sjabloon. */
  aanwezig: boolean
  inspectienummer: string
  datum: string
  tijd: string
  inspecteur: string
  weer: string
  werkzaamheden: string
  gebied: string
  disciplines: string
  disciplines_lijst: Rij[]
  /** Absolute aantallen; bewust geen percentage. */
  totaal_beoordeeld: number
  totaal_voldoet: number
  totaal_voldoet_niet: number
  totaal_niet_beoordeeld: number
  totaal_nvt: number
  totaal_nader_onderzoek: number
  aantal_kritiek: number
  aantal_technisch: number
  aantal_esthetisch: number
  aantal_observatie: number
  samenvatting_regel: string
  steekproef: string
  /** Uitsluitend uitgevoerde metingen. */
  metingen: Rij[]
  heeft_metingen: boolean
  /** Alle beoordeelde controlepunten, per discipline gegroepeerd. */
  punten: Rij[]
  /** De afwijkingen uit deze inspectie, in pagina's geknipt. */
  afwijkingen: Rij[]
  paginas: Rij[]
  heeft_afwijkingen: boolean
  /** Positieve kwaliteitswaarnemingen met foto. */
  waarnemingen: Rij[]
  heeft_waarnemingen: boolean
  /** Opvolging van eerdere inspecties. */
  opvolging: Rij[]
  heeft_opvolging: boolean
  opvolging_regel: string
  algemene_opmerkingen: string
  disclaimer: string
  per_pagina: number
}

export const LEEG_KWALITEIT_BLOK: KwaliteitBlok = {
  aanwezig: false,
  inspectienummer: '', datum: '', tijd: '', inspecteur: '', weer: '', werkzaamheden: '', gebied: '',
  disciplines: '', disciplines_lijst: [],
  totaal_beoordeeld: 0, totaal_voldoet: 0, totaal_voldoet_niet: 0, totaal_niet_beoordeeld: 0,
  totaal_nvt: 0, totaal_nader_onderzoek: 0,
  aantal_kritiek: 0, aantal_technisch: 0, aantal_esthetisch: 0, aantal_observatie: 0,
  samenvatting_regel: '', steekproef: '',
  metingen: [], heeft_metingen: false,
  punten: [],
  afwijkingen: [], paginas: [], heeft_afwijkingen: false,
  waarnemingen: [], heeft_waarnemingen: false,
  opvolging: [], heeft_opvolging: false, opvolging_regel: '',
  algemene_opmerkingen: '', disclaimer: DISCLAIMER(), per_pagina: 3,
}

/**
 * De vaste disclaimer uit het ontwerp (§41). Staat hier en niet in het Word-sjabloon, zodat hij op
 * elk rapport identiek is en niet per ongeluk uit een sjabloon verdwijnt.
 */
function DISCLAIMER(): string {
  return 'Deze kwaliteitscontrole betreft een periodieke steekproef van de op het moment van '
    + 'inspectie zichtbare, bereikbare en beoordeelbare werkzaamheden. De beoordeling vindt plaats '
    + 'op basis van de voor het betreffende onderdeel toepasselijke technische normen, richtlijnen, '
    + 'productspecificaties, projectafspraken en vastgestelde kwaliteitscriteria. '
    + 'Niet tijdens deze inspectie beoordeelde werkzaamheden worden niet automatisch als '
    + 'goedgekeurd beschouwd.'
}

// ── Hulpjes ───────────────────────────────────────────────────────────────

// ── Contextbouw ───────────────────────────────────────────────────────────

export interface BouwKwaliteitOpties {
  /** Live preview: maar een handvol afwijkingen verwerken (elke render is een Graph-conversie). */
  preview?: boolean
}

/**
 * Bouwt het `kwaliteit`-blok voor één dossier.
 * Gooit een `Error` met een leesbare NL-melding als het rapport te groot is.
 */
export async function bouwKwaliteitBlok(
  dossierId: string,
  invoer: Record<string, string>,
  opties: BouwKwaliteitOpties = {},
): Promise<KwaliteitBlok> {
  const keuze = parseKwaliteitOpties(invoer[KWALITEIT_OPTIES_SLEUTEL])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any

  const inspectie = await laadInspectie(supabase, dossierId, keuze)
  if (!inspectie) return { ...LEEG_KWALITEIT_BLOK, per_pagina: keuze.per_pagina }

  const [
    { data: resultaten },
    { data: afwijkingenRuw },
    { data: waarnemingen },
    { data: disciplines },
  ] = await Promise.all([
    supabase
      .from('kwaliteit_resultaten')
      .select('*, punt:kwaliteit_controlepunten!controlepunt_id(*)')
      .eq('inspectie_id', inspectie.id),
    supabase
      .from('kwaliteit_afwijkingen')
      .select('*')
      .eq('inspectie_id', inspectie.id)
      .order('afwijkingsnummer'),
    supabase.from('kwaliteit_waarnemingen').select('*').eq('inspectie_id', inspectie.id).order('created_at'),
    supabase.from('kwaliteit_disciplines').select('code, naam, volgorde').order('volgorde'),
  ])

  type ResultaatMetPunt = KwaliteitResultaat & { punt: KwaliteitControlepunt }
  const rijen = (resultaten ?? []) as ResultaatMetPunt[]
  let afwijkingen = (afwijkingenRuw ?? []) as KwaliteitAfwijking[]
  const positief = (waarnemingen ?? []) as KwaliteitWaarneming[]
  const disciplineNaam = new Map<string, string>(
    ((disciplines ?? []) as { code: string; naam: string }[]).map(d => [d.code, d.naam]),
  )

  if (!opties.preview && afwijkingen.length > MAX_AFWIJKINGEN) throw new Error(TE_VEEL(afwijkingen.length))
  if (opties.preview) afwijkingen = afwijkingen.slice(0, Math.max(1, keuze.per_pagina * 2))

  // ── Foto's ─────────────────────────────────────────────────────────────
  const fotoIds = [
    ...afwijkingen.map(a => a.id),
    ...(keuze.toon_waarnemingen ? positief.map(w => w.id) : []),
  ]
  const fotos: KwaliteitFoto[] = fotoIds.length > 0
    ? ((await supabase
        .from('kwaliteit_fotos')
        .select('*')
        .or(`afwijking_id.in.(${afwijkingen.map(a => a.id).join(',') || '00000000-0000-0000-0000-000000000000'}),`
          + `waarneming_id.in.(${positief.map(w => w.id).join(',') || '00000000-0000-0000-0000-000000000000'})`)
      ).data ?? []) as KwaliteitFoto[]
    : []

  // Eén foto per afwijking (de eerste) en per waarneming: meer past niet op een rapportpagina.
  const eersteFotoPerAfwijking = new Map<string, string>()
  for (const f of fotos) {
    if (f.afwijking_id && !eersteFotoPerAfwijking.has(f.afwijking_id)) {
      eersteFotoPerAfwijking.set(f.afwijking_id, f.url)
    }
  }
  const herstelFotoPerAfwijking = new Map<string, string>()
  for (const f of fotos) {
    if (f.afwijking_id && f.soort === 'herstel' && !herstelFotoPerAfwijking.has(f.afwijking_id)) {
      herstelFotoPerAfwijking.set(f.afwijking_id, f.url)
    }
  }
  const fotoPerWaarneming = new Map<string, string>()
  for (const f of fotos) {
    if (f.waarneming_id && !fotoPerWaarneming.has(f.waarneming_id)) {
      fotoPerWaarneming.set(f.waarneming_id, f.url)
    }
  }

  const teHalen = [
    ...afwijkingen.map(a => eersteFotoPerAfwijking.get(a.id) ?? ''),
    ...(keuze.toon_waarnemingen ? positief.map(w => fotoPerWaarneming.get(w.id) ?? '') : []),
    // De herstelfoto werd hierboven al bepaald maar landde nergens; als na-foto hoort hij in
    // het bezoekrapport thuis (voor/na naast elkaar).
    ...afwijkingen.map(a => herstelFotoPerAfwijking.get(a.id) ?? ''),
  ]
  // `veiligeFotoUrl` weert alles buiten onze eigen publieke bucket: deze URL's komen uit een
  // vrije tekstkolom en worden hieronder server-side opgehaald.
  const opgehaald = await mapMetLimiet(
    teHalen, FOTO_GRENZEN.PARALLEL, url => haalRapportFoto(veiligeFotoUrl(url)),
  )
  // 'laat_vallen': boven de bytelimiet vallen de resterende foto's weg in plaats van dat de
  // hele conversie klapt.
  const dataUrls = pasFotoBudgetToe(opgehaald, 'laat_vallen')
  const aantalWaarnemingFotos = keuze.toon_waarnemingen ? positief.length : 0
  const fotoVanAfwijking = (i: number) => dataUrls[i] ?? ''
  const fotoVanWaarneming = (i: number) => dataUrls[afwijkingen.length + i] ?? ''
  const herstelFotoVanAfwijking = (i: number) =>
    dataUrls[afwijkingen.length + aantalWaarnemingFotos + i] ?? ''

  // ── Tellingen ──────────────────────────────────────────────────────────
  const telling = samenvatting(rijen, afwijkingen)

  // ── Metingen: alleen wat er daadwerkelijk is gemeten ───────────────────
  const metingen: Rij[] = rijen
    .filter(r => r.gemeten_waarde !== null && r.gemeten_waarde !== undefined)
    .sort((a, b) => a.punt.code.localeCompare(b.punt.code))
    .map(r => {
      const eis = (r.toegepaste_eis ?? {}) as KwaliteitEis
      const eenheid = eis.eenheid ? eenheidLabel(eis.eenheid) : ''
      return {
        code: r.punt.code,
        onderdeel: r.punt.titel,
        locatie: r.meetlocatie ?? '',
        meting: `${getalNL(r.gemeten_waarde)}${eenheid ? ' ' + eenheid : ''}`,
        eis: eis.geen_waarde_bekend ? 'projectspecifiek' : eisOmschrijving(eis),
        meetmiddel: r.meetmiddel ?? r.punt.meetmiddel ?? '',
        resultaat: kwaliteitResultaatStatusLabels[r.status],
        voldoet: r.status === 'voldoet',
      }
    })

  // ── Alle beoordeelde punten, per discipline ────────────────────────────
  const puntRijen = rijen
    .filter(r => keuze.toon_niet_beoordeeld || (r.status !== 'niet_beoordeeld' && r.status !== 'nvt'))
    .sort((a, b) =>
      (a.punt.discipline_code.localeCompare(b.punt.discipline_code))
      || (a.punt.volgorde - b.punt.volgorde))
    .map(r => {
      const eis = (r.toegepaste_eis ?? {}) as KwaliteitEis
      return {
        code: r.punt.code,
        discipline: disciplineNaam.get(r.punt.discipline_code) ?? r.punt.discipline_code,
        onderdeel: r.punt.titel,
        vraag: r.punt.korte_vraag,
        resultaat: kwaliteitResultaatStatusLabels[r.status],
        voldoet: r.status === 'voldoet',
        afwijkend: r.status === 'voldoet_niet',
        niet_beoordeeld: r.status === 'niet_beoordeeld',
        opmerking: r.opmerking ?? '',
        eis: eis.eis_tekst ?? '',
        bron: eis.bron_type
          ? `${kwaliteitBronTypeLabels[eis.bron_type]}${eis.bron_document ? ' — ' + eis.bron_document : ''}`
          : '',
      }
    })

  // ── Afwijkingen ────────────────────────────────────────────────────────
  const afwRijen: Rij[] = afwijkingen.map((a, i) => ({
    nummer: a.afwijkingsnummer,
    code: a.controlepunt_code ?? '',
    discipline: a.discipline_code ? (disciplineNaam.get(a.discipline_code) ?? a.discipline_code) : '',
    locatie: a.locatie ?? '',
    ernst: kwaliteitErnstLabels[a.ernst],
    kritiek: a.ernst === 'kritiek',
    omschrijving: a.omschrijving ?? '',
    omschrijving_kort: afkappen(a.omschrijving ?? '', 220),
    eis: a.eis_tekst ?? '',
    eis_kort: afkappen(a.eis_tekst ?? '', 160),
    meting: a.gemeten_waarde !== null
      ? `${getalNL(a.gemeten_waarde)}${a.eenheid ? ' ' + eenheidLabel(a.eenheid) : ''}`
      : '',
    status: kwaliteitAfwijkingStatusLabels[a.status],
    actie: a.voorgestelde_actie ?? '',
    actie_kort: afkappen(a.voorgestelde_actie ?? '', 180),
    hersteldatum: a.gewenste_hersteldatum ? datumNL(a.gewenste_hersteldatum) : '',
    datum: datumNL(a.datum_constatering),
    foto: fotoVanAfwijking(i),
    heeft_foto: !!fotoVanAfwijking(i),
    foto_na: herstelFotoVanAfwijking(i),
    heeft_foto_na: !!herstelFotoVanAfwijking(i),
    hersteld: a.status === 'hersteld_akkoord',
  }))

  // In pagina's knippen. De paginabreuk zelf staat in het Word-sjabloon, binnen een
  // {#niet_laatste}-conditie: er is geen rawxml-module geregistreerd in render-docx, dus een
  // XML-string in een gewone tag zou als zichtbare tekst worden weggeschreven. Zelfde oplossing
  // als in het houtrot-sjabloon. De andere helft van "een afwijking nooit over twee pagina's"
  // zit in het sjabloon (exacte rijhoogte + begrensd fotokader + cantSplit).
  // paginabreukXml blijft leeg: die tag is pas bruikbaar zodra er een rawxml-module is
  // geregistreerd in render-docx.
  const paginas: Rij[] = knipInPaginas(afwRijen, { perPagina: keuze.per_pagina, itemVeld: 'regels' })

  // ── Positieve waarnemingen ─────────────────────────────────────────────
  const waarnemingRijen: Rij[] = keuze.toon_waarnemingen
    ? positief.map((w, i) => ({
        omschrijving: w.omschrijving,
        locatie: w.locatie ?? '',
        discipline: w.discipline_code ? (disciplineNaam.get(w.discipline_code) ?? w.discipline_code) : '',
        // Twee namen voor dezelfde foto: de image-module kiest het max-kader op TAGNAAM, dus
        // {%foto_klein} levert de smallere strook en {%foto} het gewone kader. Zo kan de
        // sjabloonmaker kiezen zonder dat hier iets aan te passen valt.
        foto: fotoVanWaarneming(i),
        foto_klein: fotoVanWaarneming(i),
        heeft_foto: !!fotoVanWaarneming(i),
      }))
    : []

  // ── Opvolging van eerdere inspecties ───────────────────────────────────
  let opvolging: Rij[] = []
  let opvolgingRegel = ''
  if (keuze.toon_opvolging) {
    // Gepagineerd: een dossier met veel rondes komt boven de PostgREST-grens van 1000 rijen
    // uit, en die afkapping is stil — `error` blijft null. `afwijkingsnummer` is de stabiele
    // ordening die de paginering nodig heeft.
    const rijenEerder = await haalAlleRijen<KwaliteitAfwijking>((van, tot) =>
      supabase
        .from('kwaliteit_afwijkingen')
        .select('afwijkingsnummer, discipline_code, locatie, omschrijving, status, ernst, hercontrole_datum')
        .eq('dossier_id', dossierId)
        .neq('inspectie_id', inspectie.id)
        .order('afwijkingsnummer')
        .range(van, tot))
    opvolging = rijenEerder.map(a => ({
      nummer: a.afwijkingsnummer,
      discipline: a.discipline_code ? (disciplineNaam.get(a.discipline_code) ?? a.discipline_code) : '',
      locatie: a.locatie ?? '',
      omschrijving: afkappen(a.omschrijving ?? '', 180),
      ernst: kwaliteitErnstLabels[a.ernst],
      status: kwaliteitAfwijkingStatusLabels[a.status],
      hersteld: a.status === 'hersteld_akkoord',
      hercontrole: a.hercontrole_datum ? datumNL(a.hercontrole_datum) : '',
    }))
    const hersteld = rijenEerder.filter(a => a.status === 'hersteld_akkoord').length
    const nogOpen = rijenEerder.length - hersteld
    opvolgingRegel = rijenEerder.length === 0
      ? 'Er zijn geen afwijkingen uit eerdere inspecties.'
      : `${hersteld} eerdere afwijking${hersteld === 1 ? '' : 'en'} hersteld en akkoord; `
        + `${nogOpen} nog in behandeling.`
  }

  const gekozenDisciplines = (inspectie.discipline_codes ?? [])
    .map((c: string) => disciplineNaam.get(c) ?? c)

  return {
    aanwezig: true,
    inspectienummer: inspectie.inspectienummer,
    datum: datumNL(inspectie.datum),
    tijd: inspectie.tijd ? inspectie.tijd.slice(0, 5) : '',
    inspecteur: volledigeNaam(inspectie.inspecteur),
    weer: inspectie.weer ?? '',
    werkzaamheden: inspectie.werkzaamheden_omschrijving ?? '',
    gebied: inspectie.gebied_omschrijving ?? '',
    disciplines: gekozenDisciplines.join(', '),
    disciplines_lijst: gekozenDisciplines.map((naam: string) => ({ naam })),

    totaal_beoordeeld: telling.beoordeeld,
    totaal_voldoet: telling.voldoet,
    totaal_voldoet_niet: telling.voldoet_niet,
    totaal_niet_beoordeeld: telling.niet_beoordeeld,
    totaal_nvt: telling.nvt,
    totaal_nader_onderzoek: telling.nader_onderzoek,
    aantal_kritiek: telling.kritiek,
    aantal_technisch: telling.technisch,
    aantal_esthetisch: telling.esthetisch,
    aantal_observatie: telling.observatie,
    samenvatting_regel:
      `${telling.beoordeeld} controlepunten beoordeeld: ${telling.voldoet} voldoen, `
      + `${telling.technisch} technische en ${telling.esthetisch} esthetische aandachtspunten, `
      + `${telling.kritiek} kritieke afwijkingen`
      + (telling.niet_beoordeeld > 0 ? `, ${telling.niet_beoordeeld} niet beoordeeld` : '')
      + '.',
    steekproef: inspectie.steekproef_bekeken
      ? `${inspectie.steekproef_afwijkend ?? 0} van ${inspectie.steekproef_bekeken} bekeken elementen wijkt af.`
      : '',

    metingen,
    heeft_metingen: metingen.length > 0,
    punten: puntRijen,
    afwijkingen: afwRijen,
    paginas,
    heeft_afwijkingen: afwRijen.length > 0,
    waarnemingen: waarnemingRijen,
    heeft_waarnemingen: waarnemingRijen.length > 0,
    opvolging,
    heeft_opvolging: opvolging.length > 0,
    opvolging_regel: opvolgingRegel,
    algemene_opmerkingen: inspectie.algemene_opmerkingen ?? '',
    disclaimer: DISCLAIMER(),
    per_pagina: keuze.per_pagina,
  }
}

/**
 * De inspectie waarover gerapporteerd wordt: de gekozen inspectie, of anders de meest recente
 * definitieve op dit dossier. Bewust een definitieve: een concept is nog niet af en hoort niet bij
 * de opdrachtgever terecht te komen.
 */
async function laadInspectie(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  dossierId: string,
  keuze: KwaliteitRapportOpties,
): Promise<(KwaliteitInspectie & { inspecteur: { voornaam: string; tussenvoegsel: string | null; achternaam: string } | null }) | null> {
  const select = '*, inspecteur:medewerkers!inspecteur_id(voornaam, tussenvoegsel, achternaam)'
  if (keuze.inspectie_id) {
    const { data } = await supabase
      .from('kwaliteit_inspecties')
      .select(select)
      .eq('id', keuze.inspectie_id)
      .eq('dossier_id', dossierId)
      .maybeSingle()
    if (data) return data
  }
  const { data } = await supabase
    .from('kwaliteit_inspecties')
    .select(select)
    .eq('dossier_id', dossierId)
    .eq('status', 'definitief')
    .order('datum', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data ?? null
}
