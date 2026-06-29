'use server'

import { createAdminClient } from '@everts/database/server'
import { revalidatePath } from 'next/cache'
import { getDossierUren, getDossierInkoop, bouw7VoorDossier } from './actions'

/** Standaardopslag op overige (niet-uren) kosten bij regie-facturatie.
 *  Module-lokaal: een 'use server'-bestand mag geen non-async waarden exporteren. */
const REGIE_OPSLAG_PCT = 25

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
 * met defaults: uren → afgesproken verkooptarief per uursoort (relatie), overige
 * kosten → +25% opslag. Eerder opgeslagen overrides (regie_factuurregels) winnen.
 */
export async function getServicedeskRegie(dossierId: string): Promise<ServicedeskRegieData> {
  const supabase = createAdminClient() as any
  const { data: dossier } = await supabase
    .from('dossiers')
    .select('klant_id')
    .eq('id', dossierId)
    .single()

  const [uren, inkoop, tarieven, opgeslagenRes] = await Promise.all([
    getDossierUren(dossierId),
    getDossierInkoop(dossierId),
    verkooptarievenVoorRelatie(dossier?.klant_id ?? null),
    supabase.from('regie_factuurregels').select('*').eq('dossier_id', dossierId),
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
      uitgesloten: opgesl?.uitgesloten ?? false,
      status: (opgesl?.status as 'concept' | 'gefactureerd') ?? 'concept',
      bouw7InvoiceId: opgesl?.bouw7_invoice_id ?? null,
      tariefUitRelatie,
    })
  }

  // Overige geboekte kosten → +25% opslag.
  for (const k of inkoop.geboekteKosten) {
    const sleutel = `kost:${k.bronId}`
    const opgesl = opgeslagen.get(sleutel)
    const opslagPct = opgesl?.opslag_pct ?? REGIE_OPSLAG_PCT
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
  const uitgezetteOpdrachten = Math.round(uitgezetBasis * (1 + REGIE_OPSLAG_PCT / 100) * 100) / 100
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
 * Pusht de niet-uitgesloten, nog niet gefactureerde regie-regels als CONCEPT-verkoopfactuur
 * naar Bouw7 (POST /invoice). Fiscaal gevoelig (oplopende factuurnummers) — eerst op een
 * proefproject testen. Het exacte Invoice-body-schema moet tegen de live API bevestigd worden;
 * de payload hieronder is conservatief opgezet en faalt netjes (geen status-update bij fout).
 */
export async function maakRegieFactuurInBouw7(
  dossierId: string,
): Promise<{ ok: true; invoiceId: string; aantal: number } | { ok: false; error: string }> {
  const ctx = await bouw7VoorDossier(dossierId)
  if (!ctx) return { ok: false, error: 'Dossier niet aan Bouw7 gekoppeld.' }
  const { client, bouw7Id } = ctx

  const supabase = createAdminClient() as any
  const { data: dossier } = await supabase
    .from('dossiers')
    .select('klant:relaties(bouw7_id)')
    .eq('id', dossierId)
    .single()
  const contactBouw7Id = dossier?.klant?.bouw7_id
  if (!contactBouw7Id) return { ok: false, error: 'Geen Bouw7-relatie aan dossier gekoppeld.' }

  const regie = await getServicedeskRegie(dossierId)
  const teFactureren = regie.regels.filter(r => !r.uitgesloten && r.status !== 'gefactureerd')
  if (teFactureren.length === 0) return { ok: false, error: 'Geen te factureren regels.' }

  const vandaag = new Date().toISOString().slice(0, 10)
  const body = {
    contact: { id: Number(contactBouw7Id) },
    project: { id: Number(bouw7Id) },
    invoiceDate: vandaag,
    // Concept: geen status meegeven, of de Bouw7-default. Regels per geboekte post.
    lines: teFactureren.map(r => ({
      description: r.omschrijving ?? '',
      quantity: r.aantal ?? 1,
      unitPrice: r.aantal ? Math.round((r.verkoopBedrag / r.aantal) * 100) / 100 : r.verkoopBedrag,
      ...(r.bewakingscode ? { projectSecurityLink: { code: r.bewakingscode } } : {}),
    })),
  }

  let invoiceId: string
  try {
    const res = await client.post<{ id?: number | string }>('/invoice', body)
    invoiceId = String(res?.id ?? '')
    if (!invoiceId) return { ok: false, error: 'Bouw7 gaf geen factuur-id terug.' }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Push naar Bouw7 mislukt.' }
  }

  // Markeer de meegestuurde regels als gefactureerd (upsert per bron-sleutel).
  for (const r of teFactureren) {
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
      bouw7_invoice_id: invoiceId,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'dossier_id,bron_type,bron_bouw7_id' })
  }

  revalidatePath(`/servicedesk/${dossierId}/financieel`)
  return { ok: true, invoiceId, aantal: teFactureren.length }
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
