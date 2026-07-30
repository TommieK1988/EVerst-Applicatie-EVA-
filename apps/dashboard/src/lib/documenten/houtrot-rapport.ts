/**
 * houtrot-rapport.ts
 *
 * Bouwt het `houtrot`-blok van de renderkontext voor documentsoort
 * `houtrot_rapportage`. Analoog aan het `opdracht`-blok: alleen geladen wanneer
 * het sjabloon er om vraagt, zodat een bewonersbrief geen registraties ophaalt.
 *
 * De harde eis uit het ontwerp — een vast aantal registraties per pagina, en een
 * registratie nooit over twee pagina's — wordt hier voor de helft opgelost: de
 * gesorteerde lijst wordt server-side in brokken van N geknipt (`paginas[]`), met
 * per pagina een geconditioneerde paginabreuk. De andere helft zit in het Word-
 * sjabloon (exacte rijhoogte + begrensd fotokader + `cantSplit`); daarom levert
 * dit bestand ook de afgekapte tekstvarianten `*_kort`.
 */

import 'server-only'
import { createHoutrotAdminClient } from '@/lib/houtrotherstel/supabase/admin'
import { createAdminClient } from '@everts/database/server'
import { fotoPubliekeUrl } from '@/lib/houtrotherstel/fotos'
import { platteBoom, selectieVanLocatie, subtreeIds, MAX_DIEPTE } from '@/lib/houtrotherstel/locatie-boom'
import {
  registratieVerkoop, registratieKostprijs, registratieUren, registratieArbeid,
  registratieMateriaal, gesorteerdeRegels, werkzaamhedenTekst,
} from '@/lib/houtrotherstel/bedragen'
import {
  REGISTRATIE_STATUSSEN, CONTROL_STATUSSEN, SCHADE_SEVERITY,
  type LocatieBoom, type RepairRegistration, type RepairPhoto,
} from '@/lib/houtrotherstel/types'
import { bufferNaarDataUrl } from './render-docx'
import { datumNL, datumISO, euroNL, getalNL, afkappen, volledigeNaam } from './format'
import {
  parseRapportOpties, HOUTROT_OPTIES_SLEUTEL, MAX_REGISTRATIES, PAGINABREUK_XML,
  type HoutrotRapportOpties,
} from './houtrot-opties'

// ── Grenzen ───────────────────────────────────────────────────────────────

/** Bronfoto's groter dan dit worden overgeslagen (kapotte upload / rauw bestand). */
const MAX_BRON_BYTES = 12 * 1024 * 1024
/**
 * JPEG's comprimeren in een zip vrijwel niet, dus de .docx wordt ongeveer zo groot
 * als de som van de fotobytes. Boven deze grens loopt de Graph-conversie vast.
 */
const MAX_FOTO_BYTES_TOTAAL = 35 * 1024 * 1024
/** Gelijktijdig opgehaalde foto's. Niet Promise.all over honderden: dat trekt sharp leeg. */
const FOTO_PARALLEL = 6

/** Ingesloten fotobreedte in px. Getoond op ~180 px → ±200 dpi op papier. */
const FOTO_PX = 380
const FOTO_JPEG_KWALITEIT = 70

const TE_VEEL = (n: number) =>
  `Deze rapportage bevat ${n} registraties; het maximum is ${MAX_REGISTRATIES}. ` +
  'Scherp het filter aan (bijvoorbeeld op status of op één tak van de locatie-indeling).'

// ── Contexttypes (dit is wat de sjabloonmaker in Word aanspreekt) ──────────

interface WerkzaamheidCtx { [k: string]: unknown }
interface RegistratieCtx { [k: string]: unknown }
interface PaginaCtx { [k: string]: unknown }
interface GroepCtx { [k: string]: unknown }

export interface HoutrotBlok {
  heeft: boolean
  aantal: number
  aantal_paginas: number
  per_pagina: number
  niveau_label: string
  filter_omschrijving: string
  is_voorbeeld: boolean
  totaal: Record<string, string | number>
  paginas: PaginaCtx[]
  groepen: GroepCtx[]
  /**
   * Vlakke lijst van alle registraties. Bewust NIET `registraties`: pagina- en
   * groepobjecten hebben dat veld ook, en de dotted parser lost een tag in de
   * binnenste passende scope op. Gelijke namen zouden stil het verkeerde blok pakken.
   */
  alle_registraties: RegistratieCtx[]
}

export const LEEG_HOUTROT_BLOK: HoutrotBlok = {
  heeft: false, aantal: 0, aantal_paginas: 0, per_pagina: 0, niveau_label: '',
  filter_omschrijving: '', is_voorbeeld: false,
  totaal: { verkoop: '', kostprijs: '', uren: '', arbeid: '', materiaal: '' },
  paginas: [], groepen: [], alle_registraties: [],
}

// ── Hulpjes ───────────────────────────────────────────────────────────────

/** Voert `fn` uit over `items` met maximaal `limiet` gelijktijdig. */
async function mapMetLimiet<T, R>(items: T[], limiet: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const uit = new Array<R>(items.length)
  let volgende = 0
  const werker = async () => {
    for (;;) {
      const i = volgende++
      if (i >= items.length) return
      uit[i] = await fn(items[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limiet, items.length) }, werker))
  return uit
}

/**
 * Haalt een foto op en maakt er een compacte JPEG-data-URL van.
 *
 * Sharp doet drie dingen die geen van alle optioneel zijn: verkleinen (scheelt
 * megabytes per foto), EXIF-rotatie toepassen (telefoonfoto's staan anders op hun
 * kant) en transparantie op wit zetten. De uitkomst gaat door `bufferNaarDataUrl`:
 * de image-module ziet een kale Buffer aan voor een al-verwerkte afbeelding en
 * crasht dan — alleen een base64-string doorloopt het echte insluit-pad.
 */
async function haalFoto(pad: string): Promise<{ dataUrl: string; bytes: number }> {
  try {
    const res = await fetch(fotoPubliekeUrl(pad))
    if (!res.ok) return { dataUrl: '', bytes: 0 }
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.byteLength === 0 || buf.byteLength > MAX_BRON_BYTES) return { dataUrl: '', bytes: 0 }

    const sharp = (await import('sharp')).default
    const jpeg = await sharp(buf)
      .rotate()
      .resize({ width: FOTO_PX, height: FOTO_PX, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: FOTO_JPEG_KWALITEIT, mozjpeg: true })
      .toBuffer()
    return { dataUrl: bufferNaarDataUrl(jpeg), bytes: jpeg.byteLength }
  } catch {
    // Onleesbaar of niet-ondersteund formaat (bv. HEIC zonder libheif) → geen foto.
    // Een lege string activeert de LEGE_PIXEL-tak; de registratie blijft gewoon staan.
    return { dataUrl: '', bytes: 0 }
  }
}

/** Locatiepad met terugval op de vaste velden van vóór de locatieboom. */
function locatieDelen(r: RepairRegistration): string[] {
  const uit = (r.locatie ?? []).map(l => String(l.waarde ?? '').trim()).filter(Boolean)
  if (uit.length > 0) return uit
  return [r.location_block, r.floor, r.facade_side, r.room_or_unit, r.component_type, r.element_number]
    .map(v => String(v ?? '').trim())
    .filter(Boolean)
}

const NIET_INGEVULD = '— niet ingevuld —'

// ── Contextbouw ───────────────────────────────────────────────────────────

export interface BouwHoutrotOpties {
  /** Live preview: maar een handvol registraties verwerken (elke render is een Graph-conversie). */
  preview?: boolean
}

/**
 * Bouwt het `houtrot`-blok voor één dossier.
 * Gooit een `Error` met een leesbare NL-melding als het rapport te groot is.
 */
export async function bouwHoutrotBlok(
  dossierId: string,
  invoer: Record<string, string>,
  opties: BouwHoutrotOpties = {},
): Promise<HoutrotBlok> {
  const keuze = parseRapportOpties(invoer[HOUTROT_OPTIES_SLEUTEL])

  const [registratiesRuw, boom] = await Promise.all([
    laadRegistraties(dossierId),
    laadBoom(dossierId),
  ])

  // ── Filteren, sorteren, nummeren ──────────────────────────────────────
  const orde = new Map(platteBoom(boom.nodes).map((k, i) => [k.node.id, i]))
  const tak = keuze.tak_node_id ? subtreeIds(boom.nodes, keuze.tak_node_id) : null

  type Rij = { r: RepairRegistration; ids: string[] }
  let rijen: Rij[] = registratiesRuw.map(r => ({ r, ids: selectieVanLocatie(boom.nodes, r.locatie ?? []) }))

  if (keuze.statussen.length > 0) rijen = rijen.filter(x => keuze.statussen.includes(x.r.status))
  if (tak) rijen = rijen.filter(x => x.ids.some(id => tak.has(id)))

  rijen.sort((a, b) => {
    for (let d = 0; d < MAX_DIEPTE; d++) {
      const va = orde.get(a.ids[d] ?? '') ?? Number.POSITIVE_INFINITY
      const vb = orde.get(b.ids[d] ?? '') ?? Number.POSITIVE_INFINITY
      if (va !== vb) return va - vb
    }
    return String(a.r.registration_date).localeCompare(String(b.r.registration_date))
  })

  const totaalGevonden = rijen.length
  if (!opties.preview && totaalGevonden > MAX_REGISTRATIES) throw new Error(TE_VEEL(totaalGevonden))
  if (opties.preview) rijen = rijen.slice(0, Math.max(1, keuze.per_pagina * 2))

  if (rijen.length === 0) {
    return {
      ...LEEG_HOUTROT_BLOK,
      per_pagina: keuze.per_pagina,
      niveau_label: niveauLabel(boom, keuze.niveau),
      filter_omschrijving: filterOmschrijving(keuze, boom),
    }
  }

  // ── Namen van de registrerende medewerkers ────────────────────────────
  const namen = await laadMedewerkerNamen(rijen.map(x => x.r.user_id))

  // ── Foto's ────────────────────────────────────────────────────────────
  const fotoOpdrachten: { rij: number; type: string; pad: string }[] = []
  for (const [i, x] of rijen.entries()) {
    for (const type of ['voor', 'tijdens', 'na'] as const) {
      const foto = nieuwsteFoto(x.r.photos, type)
      if (foto) fotoOpdrachten.push({ rij: i, type, pad: foto.storage_path })
    }
  }
  const fotoResultaten = await mapMetLimiet(fotoOpdrachten, FOTO_PARALLEL, o => haalFoto(o.pad))
  const totaalBytes = fotoResultaten.reduce((s, f) => s + f.bytes, 0)
  if (!opties.preview && totaalBytes > MAX_FOTO_BYTES_TOTAAL) {
    throw new Error(
      `De foto's in deze rapportage zijn samen ${Math.round(totaalBytes / 1024 / 1024)} MB; ` +
      'dat is te groot om om te zetten naar PDF. Scherp het filter aan of maak meerdere rapportages.',
    )
  }
  const fotoPerRij = new Map<string, string>()
  fotoOpdrachten.forEach((o, i) => fotoPerRij.set(`${o.rij}|${o.type}`, fotoResultaten[i].dataUrl))

  // ── Registratie-objecten ──────────────────────────────────────────────
  const registraties: RegistratieCtx[] = rijen.map((x, i) =>
    bouwRegistratie(x.r, i + 1, boom, fotoPerRij, i, namen, keuze.toon_prijzen),
  )

  // ── Groepen (totaalblad) ──────────────────────────────────────────────
  const groepen = bouwGroepen(rijen, registraties, boom, keuze)

  // ── Pagina's ──────────────────────────────────────────────────────────
  const paginas = bouwPaginas(registraties, groepen, keuze)

  const totalen = totaalVan(rijen.map(x => x.r), keuze.toon_prijzen)

  return {
    heeft: true,
    aantal: registraties.length,
    aantal_paginas: paginas.length,
    per_pagina: keuze.per_pagina,
    niveau_label: niveauLabel(boom, keuze.niveau),
    filter_omschrijving: filterOmschrijving(keuze, boom),
    is_voorbeeld: !!opties.preview && totaalGevonden > registraties.length,
    totaal: totalen,
    paginas,
    groepen,
    alle_registraties: registraties,
  }
}

// ── Laden ─────────────────────────────────────────────────────────────────

async function laadRegistraties(dossierId: string): Promise<RepairRegistration[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createHoutrotAdminClient() as any
  // Service-role: `.eq('dossier_id', …)` is de enige scoping en hoort daarom hier,
  // niet in JavaScript achteraf.
  const { data, error } = await supabase
    .from('repair_registrations')
    .select(`
      *,
      photos:repair_photos(id, photo_type, storage_path, file_name, created_at),
      lines:repair_registration_lines(*)
    `)
    .eq('dossier_id', dossierId)
    .order('registration_date', { ascending: true })
  if (error) throw new Error(`Houtrotregistraties laden mislukt: ${error.message}`)
  return (data ?? []) as RepairRegistration[]
}

async function laadBoom(dossierId: string): Promise<LocatieBoom> {
  const { getLocatieBoom } = await import('@/services/houtrotherstel/locatie-config')
  return getLocatieBoom(dossierId)
}

/** Naam per medewerker-id; `public.medewerkers` is niet embedbaar vanuit het houtrot-schema. */
async function laadMedewerkerNamen(ids: (string | null)[]): Promise<Map<string, string>> {
  const uniek = [...new Set(ids.filter((v): v is string => !!v))]
  if (uniek.length === 0) return new Map()
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = createAdminClient() as any
    const { data } = await supabase
      .from('medewerkers')
      .select('id, voornaam, tussenvoegsel, achternaam')
      .in('id', uniek)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new Map((data ?? []).map((m: any) => [m.id as string, volledigeNaam(m)]))
  } catch {
    return new Map()
  }
}

// ── Bouwstenen ────────────────────────────────────────────────────────────

function nieuwsteFoto(fotos: RepairPhoto[] | undefined, type: string): RepairPhoto | null {
  const van = (fotos ?? []).filter(f => f.photo_type === type)
  if (van.length === 0) return null
  return van.slice().sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')))[0]
}

function bouwRegistratie(
  r: RepairRegistration,
  nummer: number,
  boom: LocatieBoom,
  fotoPerRij: Map<string, string>,
  rijIndex: number,
  namen: Map<string, string>,
  toonPrijzen: boolean,
): RegistratieCtx {
  const delen = locatieDelen(r)
  const regels = gesorteerdeRegels(r)

  const werkzaamheden: WerkzaamheidCtx[] = regels.map(l => {
    const aantal = Number(l.aantal) || 0
    const perStuk = Number(l.sale_price_snapshot ?? 0)
    const kostPerStuk = Number(l.cost_price_snapshot ?? 0)
    return {
      aantal: getalNL(aantal, aantal % 1 === 0 ? 0 : 2),
      aantal_num: aantal,
      code: l.repair_code_snapshot ?? '',
      naam: l.repair_name_snapshot ?? '',
      omschrijving: l.repair_description_snapshot ?? '',
      eenheid: l.unit_snapshot ?? '',
      uren: getalNL(Number(l.labor_hours_snapshot ?? 0) * aantal),
      prijs_per_stuk: toonPrijzen ? euroNL(perStuk) : '',
      totaal: toonPrijzen ? euroNL(Number(l.line_sale_total ?? perStuk * aantal)) : '',
      totaal_num: toonPrijzen ? Number(l.line_sale_total ?? perStuk * aantal) : 0,
      kostprijs_per_stuk: toonPrijzen ? euroNL(kostPerStuk) : '',
      kostprijs_totaal: toonPrijzen ? euroNL(Number(l.line_cost_total ?? kostPerStuk * aantal)) : '',
    }
  })

  const tekst = werkzaamhedenTekst(r)
  const verkoop = registratieVerkoop(r)
  const foto = (type: string) => fotoPerRij.get(`${rijIndex}|${type}`) ?? ''
  const fotos = { voor: foto('voor'), tijdens: foto('tijdens'), na: foto('na') }

  // Bij een prijsloze versie de bedragen ook echt legen: één vergeten
  // {bedragen.verkoop} buiten het {#toon_prijzen}-blok zou anders de
  // verkoopprijs naar de klant lekken.
  const bedrag = (n: number) => (toonPrijzen ? euroNL(n) : '')

  return {
    nummer,
    datum: datumNL(r.registration_date),
    datum_iso: datumISO(r.registration_date),

    locatie_pad: delen.join(' › '),
    locatie_kort: delen[delen.length - 1] ?? '',
    loc1: delen[0] ?? '',
    loc2: delen[1] ?? '',
    loc3: delen[2] ?? '',
    locatie: (r.locatie ?? []).map((l, d) => ({
      naam: (l.naam || boom.labels[d] || '').trim(),
      waarde: l.waarde ?? '',
    })),

    status: r.status,
    status_label: REGISTRATIE_STATUSSEN[r.status] ?? String(r.status ?? ''),
    ernst_label: r.damage_severity ? (SCHADE_SEVERITY[r.damage_severity] ?? '') : '',
    controle_label: r.control_status ? (CONTROL_STATUSSEN[r.control_status] ?? '') : '',
    afgerond: r.status === 'afgerond',

    schade: r.damage_description ?? '',
    schade_kort: afkappen(r.damage_description, 120),
    oorzaak: r.damage_cause ?? '',
    notitie: r.notes ?? '',
    medewerker: (r.user_id && namen.get(r.user_id)) || r.medewerker_naam || '',

    werkzaamheden,
    heeft_werkzaamheden: werkzaamheden.length > 0,
    werkzaamheden_tekst: tekst,
    werkzaamheden_kort: afkappen(tekst, 160),

    bedragen: {
      verkoop: bedrag(verkoop),
      verkoop_num: toonPrijzen ? verkoop : 0,
      kostprijs: bedrag(registratieKostprijs(r)),
      uren: getalNL(registratieUren(r)),
      arbeid: bedrag(registratieArbeid(r)),
      materiaal: bedrag(registratieMateriaal(r)),
    },
    heeft_prijs: toonPrijzen && verkoop > 0,

    // Image-tags: platte vorm {%foto_voor} en geneste {%fotos.voor}. Beide staan
    // in `houtrotImageMax()`, want de image-module krijgt de tagnaam letterlijk.
    foto_voor: fotos.voor,
    foto_tijdens: fotos.tijdens,
    foto_na: fotos.na,
    fotos,
    heeft_foto_voor: !!fotos.voor,
    heeft_foto_tijdens: !!fotos.tijdens,
    heeft_foto_na: !!fotos.na,
    heeft_foto: !!(fotos.voor || fotos.tijdens || fotos.na),
  }
}

function totaalVan(registraties: RepairRegistration[], toonPrijzen: boolean): Record<string, string | number> {
  const som = (fn: (r: RepairRegistration) => number) => registraties.reduce((s, r) => s + fn(r), 0)
  const verkoop = som(registratieVerkoop)
  const bedrag = (n: number) => (toonPrijzen ? euroNL(n) : '')
  return {
    verkoop: bedrag(verkoop),
    verkoop_num: toonPrijzen ? verkoop : 0,
    kostprijs: bedrag(som(registratieKostprijs)),
    uren: getalNL(som(registratieUren)),
    arbeid: bedrag(som(registratieArbeid)),
    materiaal: bedrag(som(registratieMateriaal)),
  }
}

function niveauLabel(boom: LocatieBoom, niveau: number): string {
  if (niveau < 0) return ''
  return (boom.labels[niveau] || '').trim() || `Niveau ${niveau + 1}`
}

function filterOmschrijving(keuze: HoutrotRapportOpties, boom: LocatieBoom): string {
  const delen: string[] = []
  if (keuze.statussen.length > 0) {
    delen.push(keuze.statussen.map(s => REGISTRATIE_STATUSSEN[s as keyof typeof REGISTRATIE_STATUSSEN] ?? s).join(', '))
  }
  if (keuze.tak_node_id) {
    const node = boom.nodes.find(n => n.id === keuze.tak_node_id)
    if (node) delen.push(node.naam)
  }
  return delen.join(' · ')
}

/** Groepen voor het totaalblad, in boomvolgorde; `niveau: -1` levert één groep. */
function bouwGroepen(
  rijen: { r: RepairRegistration; ids: string[] }[],
  registraties: RegistratieCtx[],
  boom: LocatieBoom,
  keuze: HoutrotRapportOpties,
): GroepCtx[] {
  const label = niveauLabel(boom, keuze.niveau)

  if (keuze.niveau < 0) {
    return [{
      naam: 'Alle registraties',
      niveau_label: '',
      aantal: registraties.length,
      totaal: totaalVan(rijen.map(x => x.r), keuze.toon_prijzen),
      registraties,
    }]
  }

  const groepOrde = new Map(
    platteBoom(boom.nodes).filter(k => k.diepte === keuze.niveau).map((k, i) => [k.node.id, i]),
  )
  type Bak = { sleutel: string; naam: string; orde: number; rijen: typeof rijen; ctx: RegistratieCtx[] }
  const bakken = new Map<string, Bak>()

  rijen.forEach((x, i) => {
    const nodeId = x.ids[keuze.niveau]
    const waarde = String(x.r.locatie?.[keuze.niveau]?.waarde ?? '').trim()
    const sleutel = nodeId || waarde || '∅'
    const naam = waarde || NIET_INGEVULD
    // Onbekende knopen na de bekende; "niet ingevuld" helemaal achteraan.
    const orde = nodeId && groepOrde.has(nodeId) ? groepOrde.get(nodeId)!
      : waarde ? groepOrde.size + 1
      : Number.MAX_SAFE_INTEGER
    let bak = bakken.get(sleutel)
    if (!bak) { bak = { sleutel, naam, orde, rijen: [], ctx: [] }; bakken.set(sleutel, bak) }
    bak.rijen.push(x)
    bak.ctx.push(registraties[i])
  })

  return [...bakken.values()]
    .sort((a, b) => a.orde - b.orde || a.naam.localeCompare(b.naam, 'nl'))
    .map(b => ({
      naam: b.naam,
      niveau_label: label,
      aantal: b.ctx.length,
      totaal: totaalVan(b.rijen.map(x => x.r), keuze.toon_prijzen),
      registraties: b.ctx,
    }))
}

/**
 * Knipt de registraties in pagina's van `per_pagina`. `niet_laatste` stuurt de
 * geconditioneerde paginabreuk in het sjabloon; op de laatste pagina staat er dus
 * géén breuk, zodat er geen lege slotpagina ontstaat.
 */
function bouwPaginas(
  registraties: RegistratieCtx[],
  groepen: GroepCtx[],
  keuze: HoutrotRapportOpties,
): PaginaCtx[] {
  const n = Math.max(1, keuze.per_pagina)
  const brokken: { registraties: RegistratieCtx[]; groep_naam: string; eerste_van_groep: boolean }[] = []

  if (keuze.pagina_per_groep) {
    for (const g of groepen) {
      const lijst = (g.registraties as RegistratieCtx[]) ?? []
      for (let i = 0; i < lijst.length; i += n) {
        brokken.push({
          registraties: lijst.slice(i, i + n),
          groep_naam: String(g.naam ?? ''),
          eerste_van_groep: i === 0,
        })
      }
    }
  } else {
    for (let i = 0; i < registraties.length; i += n) {
      brokken.push({ registraties: registraties.slice(i, i + n), groep_naam: '', eerste_van_groep: false })
    }
  }

  return brokken.map((brok, i) => {
    const laatste = i === brokken.length - 1
    return {
      ...brok,
      pagina_nummer: i + 1,
      aantal_paginas: brokken.length,
      eerste: i === 0,
      laatste,
      niet_laatste: !laatste,
      // Terugval voor wie liever één tag gebruikt dan een conditie met een
      // handmatige breuk erin. Moet in Word de enige tekst in zijn alinea zijn.
      paginabreuk: laatste ? '' : PAGINABREUK_XML,
    }
  })
}
