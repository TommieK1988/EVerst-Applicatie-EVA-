'use server'

import { createAdminClient } from '@everts/database/server'
import { revalidatePath } from 'next/cache'
import { createHash } from 'node:crypto'
import { getDossierUren, getDossierInkoop, bouw7VoorDossier } from './actions'
import { assertDossierBewerkbaar } from './guards'
import { vereisRecht } from '@/lib/auth/rechten'
import { maakConceptVerkoopfactuur } from '@/lib/bouw7/verkoopfactuur'

/** Terugval voor de opslag op overige (niet-uren) kosten bij regie-facturatie, als er niets is
 *  ingesteld. Module-lokaal: een 'use server'-bestand mag geen non-async waarden exporteren. */
const REGIE_OPSLAG_STANDAARD = 25

const rond = (n: number): number => Math.round(n * 100) / 100

/**
 * Bedrijfsbrede opslag op geboekte kosten, uit `bedrijfsinstellingen.overige.regie_opslag_pct`.
 * Stond eerder als constante in de code, waardoor 25% overal impliciet meerekende — óók in elk
 * stelpost-verrekensaldo — zonder dat iemand hem kon aanpassen.
 */
async function standaardOpslagPct(supabase: any): Promise<number> {
  const { data } = await supabase.from('bedrijfsinstellingen').select('overige').eq('id', 1).maybeSingle()
  const v = (data?.overige as Record<string, unknown> | null)?.regie_opslag_pct
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v) : NaN
  return Number.isFinite(n) && n >= 0 ? n : REGIE_OPSLAG_STANDAARD
}

/**
 * Opties voor `getServicedeskRegie`. `opslagPerCode` laat een afwijkende opslag toe voor de
 * kosten op één bewakingscode — dat is hoe een stelpost met een eigen opslagpercentage afrekent
 * zonder dat de rest van het dossier meebeweegt.
 */
export type RegieOpties = { opslagPerCode?: Record<string, number> }

export type RegieFactuurRegel = {
  /** Stabiele sleutel: bron_type + bron_bouw7_id. */
  bronType: 'uur' | 'kost'
  bronBouw7Id: string
  omschrijving: string | null
  aantal: number | null
  eenheid: string | null
  /** Kostprijs/inkoopwaarde excl. btw. */
  inkoopBedrag: number
  /** Toegepaste opslag in % (alleen relevant voor kosten; uren rekenen via tarief). */
  opslagPct: number | null
  /** Verkooptarief per eenheid (uren). */
  verkoopTarief: number | null
  /** Verkoopwaarde excl. btw. */
  verkoopBedrag: number
  btwPct: number | null
  bewakingscode: string | null
  /** Uursoort bij een uur-regel ('Gewerkte uren', 'Reisuren'…); bepaalt de groepering. */
  uursoort: string | null
  /** Kostensoort bij een kost-regel ('Materiaal', 'Onderaanneming', 'Inkoop'…). */
  kostensoort: string | null
  uitgesloten: boolean
  status: 'concept' | 'gefactureerd'
  bouw7InvoiceId: string | null
  /** Defaulttarief kwam uit de relatie-uurtarieven (true) of handmatig/onbekend (false). */
  tariefUitRelatie: boolean
}

export type ServicedeskRegieData = {
  beschikbaar: boolean
  regels: RegieFactuurRegel[]
  totalen: { inkoop: number; verkoop: number }
}

type OpgeslagenRegel = {
  bron_type: string
  bron_bouw7_id: string | null
  opslag_pct: number | null
  verkoop_tarief: number | null
  verkoop_bedrag: number | null
  uitgesloten: boolean
  status: string
  bouw7_invoice_id: string | null
}

/** Verkoop-uurtarief per Bouw7 hourType-id voor een relatie (uit relatie_uurtarieven). */
async function verkooptarievenVoorRelatie(klantId: string | null): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  if (!klantId) return map
  const supabase = createAdminClient() as any
  const { data } = await supabase
    .from('relatie_uurtarieven')
    .select('tarief_verkoop, bouw7_hourtype_id, uursoort:planning_uursoorten(bouw7_id)')
    .eq('relatie_id', klantId)
  for (const r of (data ?? []) as any[]) {
    const hourTypeId = r.bouw7_hourtype_id ?? r.uursoort?.bouw7_id
    if (hourTypeId != null && r.tarief_verkoop != null) {
      map.set(String(hourTypeId), Number(r.tarief_verkoop))
    }
  }
  return map
}

/**
 * Bouwt de regie-factuurregels op uit de geboekte uren en kosten (live uit Bouw7),
 * met defaults: uren → afgesproken verkooptarief per uursoort (relatie), overige kosten → de
 * ingestelde opslag. Eerder opgeslagen overrides (regie_factuurregels) winnen altijd.
 */
export async function getServicedeskRegie(
  dossierId: string,
  opties?: RegieOpties,
): Promise<ServicedeskRegieData> {
  const supabase = createAdminClient() as any
  const { data: dossier } = await supabase
    .from('dossiers')
    .select('klant_id')
    .eq('id', dossierId)
    .single()

  const [uren, inkoop, tarieven, opgeslagenRes, standaardOpslag] = await Promise.all([
    getDossierUren(dossierId),
    getDossierInkoop(dossierId),
    verkooptarievenVoorRelatie(dossier?.klant_id ?? null),
    supabase.from('regie_factuurregels').select('*').eq('dossier_id', dossierId),
    standaardOpslagPct(supabase),
  ])

  const opgeslagen = new Map<string, OpgeslagenRegel>()
  for (const r of (opgeslagenRes.data ?? []) as OpgeslagenRegel[]) {
    opgeslagen.set(`${r.bron_type}:${r.bron_bouw7_id}`, r)
  }

  const regels: RegieFactuurRegel[] = []

  // Uren → verkooptarief uit relatie (per uursoort/hourType).
  for (const u of uren.regels) {
    if (u.bouw7Id == null) continue // alleen detailregels met stabiele sleutel
    const sleutel = `uur:${u.bouw7Id}`
    const opgesl = opgeslagen.get(sleutel)
    const relatieTarief = u.hourTypeId != null ? tarieven.get(String(u.hourTypeId)) : undefined
    const tariefUitRelatie = relatieTarief != null
    const verkoopTarief = opgesl?.verkoop_tarief ?? relatieTarief ?? u.uurtarief ?? null
    const verkoopBedrag = opgesl?.verkoop_bedrag ?? (verkoopTarief != null ? u.uren * verkoopTarief : 0)
    regels.push({
      bronType: 'uur',
      bronBouw7Id: String(u.bouw7Id),
      omschrijving: [u.uursoort, u.medewerker].filter(Boolean).join(' — ') || 'Uren',
      aantal: u.uren,
      eenheid: 'uur',
      inkoopBedrag: u.uren * (u.uurtarief ?? 0),
      opslagPct: opgesl?.opslag_pct ?? null,
      verkoopTarief,
      verkoopBedrag,
      btwPct: null,
      bewakingscode: u.code,
      uursoort: u.uursoort ?? null,
      kostensoort: null,
      uitgesloten: opgesl?.uitgesloten ?? false,
      status: (opgesl?.status as 'concept' | 'gefactureerd') ?? 'concept',
      bouw7InvoiceId: opgesl?.bouw7_invoice_id ?? null,
      tariefUitRelatie,
    })
  }

  // Overige geboekte kosten → opslag. Voorrang: handmatige override per regel, dan een opslag die
  // bij de bewakingscode hoort (stelpost met eigen percentage), dan de bedrijfsstandaard.
  for (const k of inkoop.geboekteKosten) {
    const sleutel = `kost:${k.bronId}`
    const opgesl = opgeslagen.get(sleutel)
    const codeOpslag = k.code ? opties?.opslagPerCode?.[k.code] : undefined
    const opslagPct = opgesl?.opslag_pct ?? codeOpslag ?? standaardOpslag
    const verkoopBedrag = opgesl?.verkoop_bedrag ?? Math.round(k.bedrag * (1 + opslagPct / 100) * 100) / 100
    regels.push({
      bronType: 'kost',
      bronBouw7Id: String(k.bronId),
      omschrijving: k.omschrijving ?? k.leverancier ?? 'Kosten',
      aantal: 1,
      eenheid: 'post',
      inkoopBedrag: k.bedrag,
      opslagPct,
      verkoopTarief: null,
      verkoopBedrag,
      btwPct: null,
      bewakingscode: k.code,
      uursoort: null,
      kostensoort: k.typeKosten ?? 'Overige kosten',
      uitgesloten: opgesl?.uitgesloten ?? false,
      status: (opgesl?.status as 'concept' | 'gefactureerd') ?? 'concept',
      bouw7InvoiceId: opgesl?.bouw7_invoice_id ?? null,
      tariefUitRelatie: false,
    })
  }

  const actief = regels.filter(r => !r.uitgesloten)
  const totalen = {
    inkoop: actief.reduce((s, r) => s + (r.inkoopBedrag || 0), 0),
    verkoop: actief.reduce((s, r) => s + (r.verkoopBedrag || 0), 0),
  }

  return { beschikbaar: uren.beschikbaar || inkoop.beschikbaar, regels, totalen }
}

export type MandaatStatus = {
  mandaat: number | null
  geboekteVerkoop: number
  uitgezetteOpdrachten: number
  totaal: number
  overschreden: boolean
}

/**
 * Mandaat-indicator. Vergelijkt (geboekte verkoopwaarde) + (uitgezette opdrachten/orders × 1,25)
 * met het opgegeven mandaat. Geen blokkade — alleen signalering.
 */
export async function getServicedeskMandaat(dossierId: string): Promise<MandaatStatus> {
  const supabase = createAdminClient() as any
  const [{ data: dossier }, regie, inkoop] = await Promise.all([
    supabase.from('dossiers').select('mandaat_bedrag').eq('id', dossierId).single(),
    getServicedeskRegie(dossierId),
    getDossierInkoop(dossierId),
  ])

  const mandaat = dossier?.mandaat_bedrag != null ? Number(dossier.mandaat_bedrag) : null
  const geboekteVerkoop = regie.totalen.verkoop
  // Uitgezette opdrachten: bestelde inkooporders + onderaannemerscontracten, met opslag.
  const uitgezetBasis = (inkoop.totalen.besteld || 0) + (inkoop.totalen.onderaanneming || 0)
  const opslag = await standaardOpslagPct(supabase)
  const uitgezetteOpdrachten = Math.round(uitgezetBasis * (1 + opslag / 100) * 100) / 100
  const totaal = Math.round((geboekteVerkoop + uitgezetteOpdrachten) * 100) / 100
  const overschreden = mandaat != null && totaal > mandaat

  return { mandaat, geboekteVerkoop, uitgezetteOpdrachten, totaal, overschreden }
}

/** Slaat een handmatige override (opslag/verkoopprijs/uitsluiten) op één regie-regel op. */
export async function bewaarRegieRegel(
  dossierId: string,
  regel: {
    bronType: 'uur' | 'kost'
    bronBouw7Id: string
    omschrijving: string | null
    aantal: number | null
    eenheid: string | null
    inkoopBedrag: number
    opslagPct: number | null
    verkoopTarief: number | null
    verkoopBedrag: number
    bewakingscode: string | null
    uitgesloten: boolean
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createAdminClient() as any
  const { error } = await supabase.from('regie_factuurregels').upsert({
    dossier_id: dossierId,
    bron_type: regel.bronType,
    bron_bouw7_id: regel.bronBouw7Id,
    omschrijving: regel.omschrijving,
    aantal: regel.aantal,
    eenheid: regel.eenheid,
    inkoop_bedrag: regel.inkoopBedrag,
    opslag_pct: regel.opslagPct,
    verkoop_tarief: regel.verkoopTarief,
    verkoop_bedrag: regel.verkoopBedrag,
    bewakingscode: regel.bewakingscode,
    uitgesloten: regel.uitgesloten,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'dossier_id,bron_type,bron_bouw7_id' })
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/servicedesk/${dossierId}/financieel`)
  return { ok: true }
}

/** Werkt de servicedesk-instellingen (mandaat / facturatiemethode) bij. */
export async function updateServicedeskInstellingen(
  dossierId: string,
  patch: { mandaat_bedrag?: number | null; facturatiemethode?: 'regie' | 'termijnen' },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createAdminClient() as any
  const velden: Record<string, unknown> = {}
  if ('mandaat_bedrag' in patch) velden.mandaat_bedrag = patch.mandaat_bedrag
  // Een handmatige keuze van de facturatiemethode zet de auto-overschrijf-flag.
  if (patch.facturatiemethode) {
    velden.facturatiemethode = patch.facturatiemethode
    velden.facturatiemethode_handmatig = true
  }
  if (Object.keys(velden).length === 0) return { ok: true }
  const { error } = await supabase.from('dossiers').update(velden).eq('id', dossierId)
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/servicedesk/${dossierId}/informatie`)
  return { ok: true }
}

/**
 * Eén factuurregel zoals de klant hem straks op de factuur ziet — samengevat, niet elke boeking
 * apart. Een factuur met honderden regels leest niemand; de onderbouwing per uur en per bon blijft
 * in EVA staan.
 */
export type RegieFactuurGroep = {
  /** Stabiele sleutel van de groep, ook gebruikt als React-key. */
  sleutel: string
  soort: 'uren' | 'kosten'
  omschrijving: string
  aantal: number
  eenheid: string | null
  stukprijs: number
  bedrag: number
  /** Hoeveel onderliggende boekingen in deze regel zijn samengevat. */
  aantalBoekingen: number
}

export type RegieVoorstel = {
  groepen: RegieFactuurGroep[]
  totaal: number
  /** Aantal regels dat al gefactureerd is en dus buiten het voorstel valt. */
  alGefactureerd: number
}

/**
 * Vat de regie-regels samen tot factuurregels.
 *
 * Uren gaan altijd per uursoort samen, maar wél per tarief apart: twee tarieven binnen één uursoort
 * in één regel persen zou een stukprijs opleveren die niet klopt. Kosten worden standaard per
 * kostensoort gesplitst (materiaal, onderaanneming, inkoop…), met `kostenSamenvoegen` om er één
 * regel van te maken.
 */
export async function getRegieFactuurvoorstel(
  dossierId: string,
  opties?: { kostenSamenvoegen?: boolean; opslagPerCode?: Record<string, number> },
): Promise<RegieVoorstel> {
  const regie = await getServicedeskRegie(dossierId, { opslagPerCode: opties?.opslagPerCode })
  const mee = regie.regels.filter(r => !r.uitgesloten && r.status !== 'gefactureerd')
  const alGefactureerd = regie.regels.filter(r => r.status === 'gefactureerd').length

  const groepen = new Map<string, RegieFactuurGroep>()
  const voegToe = (
    sleutel: string, soort: 'uren' | 'kosten', omschrijving: string,
    aantal: number, eenheid: string | null, bedrag: number,
  ) => {
    const g = groepen.get(sleutel)
      ?? { sleutel, soort, omschrijving, aantal: 0, eenheid, stukprijs: 0, bedrag: 0, aantalBoekingen: 0 }
    g.aantal = rond(g.aantal + aantal)
    g.bedrag = rond(g.bedrag + bedrag)
    g.aantalBoekingen += 1
    groepen.set(sleutel, g)
  }

  for (const r of mee) {
    if (r.bronType === 'uur') {
      const uursoort = r.uursoort ?? 'Uren'
      const tarief = r.verkoopTarief ?? 0
      voegToe(`uur:${uursoort}:${tarief}`, 'uren', uursoort, r.aantal ?? 0, 'uur', r.verkoopBedrag || 0)
    } else {
      const soort = r.kostensoort ?? 'Overige kosten'
      const sleutel = opties?.kostenSamenvoegen ? 'kost:alles' : `kost:${soort}`
      const label = opties?.kostenSamenvoegen ? 'Materiaal, onderaanneming en overige kosten' : soort
      voegToe(sleutel, 'kosten', label, 1, 'post', r.verkoopBedrag || 0)
    }
  }

  const lijst = [...groepen.values()].map(g => ({
    ...g,
    // Bij kosten is "aantal" het aantal samengevatte posten; de factuur toont er één post van.
    aantal: g.soort === 'uren' ? g.aantal : 1,
    stukprijs: g.soort === 'uren' && g.aantal > 0 ? rond(g.bedrag / g.aantal) : g.bedrag,
  }))
  // Uren eerst, dan kosten; binnen een soort alfabetisch, zodat de factuur elke keer gelijk oogt.
  lijst.sort((a, b) => a.soort === b.soort
    ? a.omschrijving.localeCompare(b.omschrijving, 'nl')
    : (a.soort === 'uren' ? -1 : 1))

  return { groepen: lijst, totaal: rond(lijst.reduce((s, g) => s + g.bedrag, 0)), alGefactureerd }
}

/**
 * Zet het regiewerk als één conceptfactuur klaar in Bouw7.
 *
 * De vorige implementatie is in september 2026 vervangen. Die bouwde een `POST /invoice`-body die
 * nooit tegen de live API was bevestigd en aantoonbaar fout was — een `InvoiceDocument` heeft
 * `chapters[].lines[]`, geen platte `lines`, het datumveld heet `date`, en een verkoopfactuurregel
 * kent geen `projectSecurityLink`. Het gevaar zat niet in het falen maar in het slagen: zonder
 * `status` in de body kan Bouw7 een factuur met status 0 (Open) maken, dus mét factuurnummer.
 * Bovendien zette de oude versie álle regels hard op `gefactureerd`, ook zonder bevestiging.
 *
 * Nu loopt alles via `maakConceptVerkoopfactuur`, dat op het skelet uit
 * `GET /project/{id}/invoice/new` bouwt. Regels gaan pas op `gefactureerd` ná de acceptatiecontrole.
 *
 * De selectie wordt hier server-side opnieuw bepaald; wat de client meestuurde is alleen de
 * groeperingskeuze en het btw-tarief.
 */
export async function maakRegieFactuurInBouw7(
  dossierId: string,
  opties: { btwTariefBouw7Id: number; kostenSamenvoegen?: boolean },
): Promise<{ ok: true; invoiceId: number; aantal: number; totaal: number } | { ok: false; error: string; invoiceId?: number }> {
  await vereisRecht('financieel', 'schrijven')
  await assertDossierBewerkbaar(dossierId)

  const ctx = await bouw7VoorDossier(dossierId)
  if (!ctx) return { ok: false, error: 'Dit dossier is niet aan een Bouw7-project gekoppeld.' }

  if (!Number.isFinite(opties.btwTariefBouw7Id)) {
    return { ok: false, error: 'Kies eerst een btw-tarief voor deze factuur.' }
  }

  const voorstel = await getRegieFactuurvoorstel(dossierId, { kostenSamenvoegen: opties.kostenSamenvoegen })
  if (voorstel.groepen.length === 0) return { ok: false, error: 'Er is niets te factureren.' }

  // Sleutel over de inhoud: dezelfde regels met dezelfde bedragen leveren dezelfde sleutel op, dus
  // een tweede klik vindt de bestaande conceptfactuur terug in plaats van een duplicaat te maken.
  const basis = `${dossierId}|regie|` + voorstel.groepen
    .map(g => `${g.sleutel}:${Math.round(g.bedrag * 100)}`).join(',')
  const sleutel = createHash('sha1').update(basis).digest('hex').slice(0, 16)

  const res = await maakConceptVerkoopfactuur({
    projectId: Number(ctx.bouw7Id),
    idempotentieSleutel: sleutel,
    omschrijving: 'Regiewerk',
    regels: voorstel.groepen.map(g => ({
      omschrijving: g.omschrijving,
      aantal: g.aantal,
      eenheid: g.eenheid,
      stukprijs: g.stukprijs,
      vatTariffId: opties.btwTariefBouw7Id,
    })),
  })
  if (!res.ok) return res

  // Pas nu de onderliggende regels afboeken — niet ervoor. Een mislukte push mag geen regels
  // wegstrepen die nog gefactureerd moeten worden.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  const regie = await getServicedeskRegie(dossierId)
  const mee = regie.regels.filter(r => !r.uitgesloten && r.status !== 'gefactureerd')
  for (const r of mee) {
    await supabase.from('regie_factuurregels').upsert({
      dossier_id: dossierId,
      bron_type: r.bronType,
      bron_bouw7_id: r.bronBouw7Id,
      omschrijving: r.omschrijving,
      aantal: r.aantal,
      eenheid: r.eenheid,
      inkoop_bedrag: r.inkoopBedrag,
      opslag_pct: r.opslagPct,
      verkoop_tarief: r.verkoopTarief,
      verkoop_bedrag: r.verkoopBedrag,
      bewakingscode: r.bewakingscode,
      status: 'gefactureerd',
      bouw7_invoice_id: String(res.invoiceId),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'dossier_id,bron_type,bron_bouw7_id' })
  }

  revalidatePath(`/servicedesk/${dossierId}/financieel`)
  revalidatePath(`/opdrachten/${dossierId}/verkoop`)
  return { ok: true, invoiceId: res.invoiceId, aantal: voorstel.groepen.length, totaal: res.totaalExclBtw }
}

export type SubstatusFase = { substatus: string; van: string; tot: string | null; dagen: number }

/** Leest de substatus-historie en berekent de tijd-in-fase (doorlooptijd per fase). */
export async function getDoorlooptijdPerFase(dossierId: string): Promise<SubstatusFase[]> {
  const supabase = createAdminClient() as any
  const { data } = await supabase
    .from('dossier_substatus_historie')
    .select('substatus, gewijzigd_op')
    .eq('dossier_id', dossierId)
    .order('gewijzigd_op', { ascending: true })

  const events = (data ?? []) as { substatus: string; gewijzigd_op: string }[]
  const fases: SubstatusFase[] = []
  for (let i = 0; i < events.length; i++) {
    const van = events[i].gewijzigd_op
    const tot = i + 1 < events.length ? events[i + 1].gewijzigd_op : null
    const eind = tot ? new Date(tot).getTime() : Date.now()
    const dagen = Math.max(0, Math.round((eind - new Date(van).getTime()) / 86_400_000))
    fases.push({ substatus: events[i].substatus, van, tot, dagen })
  }
  return fases
}
