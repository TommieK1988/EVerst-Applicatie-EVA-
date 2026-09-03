'use server'

import { createAdminClient } from '@everts/database/server'
import { revalidatePath } from 'next/cache'
import { createHash } from 'node:crypto'
import { getDossierUren, getDossierInkoop, bouw7VoorDossier } from './actions'
import { assertDossierBewerkbaar } from './guards'
import { vereisRecht } from '@/lib/auth/rechten'
import { maakConceptVerkoopfactuur } from '@/lib/bouw7/verkoopfactuur'
import { getFactureerbareCodes, getCodeInstellingen } from './facturatie-codes'

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
 * Eén regel zoals de klant hem op de factuur ziet. Standaard één regel per bewakingscode; met
 * `uitsplitsen` aan komen uren en kosten van die code als aparte regels.
 */
export type FactuurRegelVoorstel = {
  sleutel: string
  bewakingscode: string
  omschrijving: string
  soort: 'uren' | 'kosten' | 'samen'
  aantal: number
  eenheid: string | null
  stukprijs: number
  bedrag: number
  aantalBoekingen: number
  /** Btw-tarief voor déze regel; leeg = het tarief dat voor de hele factuur is gekozen. */
  btwTariefBouw7Id: number | null
}

/** Eén bewakingscode met alles wat het popup-scherm nodig heeft om hem aan te passen. */
export type CodeRegelView = {
  bewakingscode: string
  bron: 'stelpost' | 'meerwerk'
  /** De tekst die op de factuur komt (aangepast, of de naam van de post). */
  omschrijving: string
  /** Kostprijs van wat er op deze code is geboekt. */
  inkoop: number
  /** Verkoopwaarde volgens de berekening: uren maal tarief, kosten maal opslag. */
  berekend: number
  /** Handmatig vastgezet bedrag; leeg = `berekend` telt. */
  bedragOverride: number | null
  /** Wat er werkelijk op de factuur komt. */
  bedrag: number
  /** Eigen opslag op de kosten van deze code; leeg = de bedrijfsstandaard. */
  opslagPct: number | null
  uitsplitsen: boolean
  btwTariefBouw7Id: number | null
  meefactureren: boolean
  urenBedrag: number
  kostenBedrag: number
  urenAantal: number
  /** Boekingen die nog te factureren zijn. */
  aantalBoekingen: number
  /** Boekingen op deze code die al op een factuur staan. */
  aantalGefactureerd: number
  /** Bestaat de code ook in Bouw7? Zo niet, dan kan er niets op geboekt worden. */
  inBouw7: boolean
  /**
   * Alles op deze code is al gefactureerd en er is niets bijgekomen. Dan mag er niets meer aan
   * veranderen: wat op een verstuurde factuur staat ligt vast, en een aangepast bedrag zou
   * suggereren dat die factuur is meegewijzigd.
   */
  vergrendeld: boolean
}

export type RegieVoorstel = {
  regels: FactuurRegelVoorstel[]
  /** Alle nacalculatie-codes van dit dossier, ook de uitgevinkte — het popup-scherm toont ze alle. */
  codes: CodeRegelView[]
  totaal: number
  alGefactureerd: number
  /** Codes die bewust buiten de factuur blijven, met de reden. Zichtbaar maken is het punt. */
  buitenBeschouwing: { bewakingscode: string; omschrijving: string; reden: string }[]
}

/**
 * Bouwt het factuurvoorstel voor het nacalculatiewerk van een dossier.
 *
 * Alleen bewakingscodes die op nacalculatie afrekenen komen erin (zie `getFactureerbareCodes`);
 * al het overige werk zit in de aanneemsom en is via de termijnen al gefactureerd. Elke code wordt
 * een eigen factuurregel, zodat op de factuur terug te zien is wat waarvoor in rekening wordt
 * gebracht — en zodat je per post kunt corrigeren.
 */
export async function getRegieFactuurvoorstel(dossierId: string): Promise<RegieVoorstel> {
  const [codes, instellingen] = await Promise.all([
    getFactureerbareCodes(dossierId),
    getCodeInstellingen(dossierId),
  ])
  const instelling = new Map(instellingen.map(i => [i.bewakingscode, i]))

  const buitenBeschouwing = codes
    .filter(c => c.alleenVerschil)
    .map(c => ({
      bewakingscode: c.bewakingscode,
      omschrijving: c.omschrijving,
      reden: 'Zit in de aanneemsom — alleen het verschil wordt verrekend, via een meerwerkregel.',
    }))

  const teFactureren = codes.filter(c => !c.alleenVerschil)
  if (teFactureren.length === 0) {
    return { regels: [], codes: [], totaal: 0, alGefactureerd: 0, buitenBeschouwing }
  }

  // Eigen opslagpercentages meegeven, zodat de verkoopwaarde per code met het juiste percentage
  // wordt gerekend. Voorrang: het popup-scherm, dan de stelpost zelf, dan de bedrijfsstandaard.
  const opslagPerCode: Record<string, number> = {}
  for (const c of teFactureren) {
    const eigen = instelling.get(c.bewakingscode)?.opslag_pct ?? c.opslagPct
    if (eigen != null) opslagPerCode[c.bewakingscode] = Number(eigen)
  }

  const regie = await getServicedeskRegie(dossierId, { opslagPerCode })
  const relevant = new Set(teFactureren.map(c => c.bewakingscode))
  const opCode = regie.regels.filter(r => r.bewakingscode && relevant.has(r.bewakingscode))
  const mee = opCode.filter(r => !r.uitgesloten && r.status !== 'gefactureerd')
  const gefactureerd = opCode.filter(r => r.status === 'gefactureerd')
  const alGefactureerd = gefactureerd.length

  const views: CodeRegelView[] = []
  const regels: FactuurRegelVoorstel[] = []

  for (const c of teFactureren) {
    const inst = instelling.get(c.bewakingscode)
    const eigen = mee.filter(r => r.bewakingscode === c.bewakingscode)
    const eerderGefactureerd = gefactureerd.filter(r => r.bewakingscode === c.bewakingscode).length
    // Niets meer open én er is al gefactureerd: deze post is klaar en gaat op slot.
    const vergrendeld = eerderGefactureerd > 0 && eigen.length === 0
    const uren = eigen.filter(r => r.bronType === 'uur')
    const kosten = eigen.filter(r => r.bronType === 'kost')

    const urenBedrag = rond(uren.reduce((s, r) => s + (r.verkoopBedrag || 0), 0))
    const kostenBedrag = rond(kosten.reduce((s, r) => s + (r.verkoopBedrag || 0), 0))
    const urenAantal = rond(uren.reduce((s, r) => s + (r.aantal ?? 0), 0))
    const inkoop = rond(eigen.reduce((s, r) => s + (r.inkoopBedrag || 0), 0))
    const berekend = rond(urenBedrag + kostenBedrag)

    const override = inst?.bedrag_excl_btw != null ? Number(inst.bedrag_excl_btw) : null
    const bedrag = override ?? berekend
    const omschrijving = (inst?.omschrijving ?? '').trim() || c.omschrijving
    const meefactureren = inst?.meefactureren ?? true
    const uitsplitsen = inst?.uitsplitsen ?? false
    const btwTariefBouw7Id = inst?.btw_tarief_bouw7_id ?? null

    views.push({
      bewakingscode: c.bewakingscode,
      bron: c.bron,
      omschrijving,
      inkoop,
      berekend,
      bedragOverride: override,
      bedrag,
      opslagPct: inst?.opslag_pct != null ? Number(inst.opslag_pct) : c.opslagPct,
      uitsplitsen,
      btwTariefBouw7Id,
      meefactureren,
      urenBedrag,
      kostenBedrag,
      urenAantal,
      aantalBoekingen: eigen.length,
      aantalGefactureerd: eerderGefactureerd,
      inBouw7: c.inBouw7,
      vergrendeld,
    })

    // Geen openstaande boekingen = niets te factureren, ook niet als er een handmatig bedrag staat.
    // Zonder deze regel zou een vastgezet bedrag bij elke volgende factuur opnieuw meegaan.
    if (eigen.length === 0) continue
    if (!meefactureren || bedrag === 0) continue

    if (uitsplitsen && override == null && urenBedrag !== 0 && kostenBedrag !== 0) {
      // Uitsplitsen kan alleen zinnig als het bedrag niet handmatig is vastgezet: een vast bedrag
      // valt niet over twee regels te verdelen zonder te gaan gokken.
      regels.push({
        sleutel: c.bewakingscode + ':uren', bewakingscode: c.bewakingscode,
        omschrijving: omschrijving + ' — arbeid', soort: 'uren',
        aantal: urenAantal || 1, eenheid: urenAantal ? 'uur' : null,
        stukprijs: urenAantal ? rond(urenBedrag / urenAantal) : urenBedrag,
        bedrag: urenBedrag, aantalBoekingen: uren.length, btwTariefBouw7Id,
      })
      regels.push({
        sleutel: c.bewakingscode + ':kosten', bewakingscode: c.bewakingscode,
        omschrijving: omschrijving + ' — materiaal en overige kosten', soort: 'kosten',
        aantal: 1, eenheid: 'post', stukprijs: kostenBedrag,
        bedrag: kostenBedrag, aantalBoekingen: kosten.length, btwTariefBouw7Id,
      })
    } else {
      regels.push({
        sleutel: c.bewakingscode, bewakingscode: c.bewakingscode,
        omschrijving, soort: 'samen',
        aantal: 1, eenheid: 'post', stukprijs: bedrag,
        bedrag, aantalBoekingen: eigen.length, btwTariefBouw7Id,
      })
    }
  }

  return {
    regels,
    codes: views,
    totaal: rond(regels.reduce((s, r) => s + r.bedrag, 0)),
    alGefactureerd,
    buitenBeschouwing,
  }
}

/** Slaat de aanpassingen van één bewakingscode uit het popup-scherm op. */
export async function bewaarCodeInstelling(
  dossierId: string,
  bewakingscode: string,
  patch: {
    omschrijving?: string | null
    opslag_pct?: number | null
    bedrag_excl_btw?: number | null
    uitsplitsen?: boolean
    btw_tarief_bouw7_id?: number | null
    meefactureren?: boolean
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  await vereisRecht('financieel', 'schrijven')
  await assertDossierBewerkbaar(dossierId)

  // Wat al gefactureerd is ligt vast. De controle staat hier en niet alleen in het scherm: een
  // verouderd geopend tabblad mag een verstuurde factuur niet alsnog van omschrijving of bedrag
  // kunnen laten veranderen.
  const huidig = await getRegieFactuurvoorstel(dossierId)
  const code = huidig.codes.find(c => c.bewakingscode === bewakingscode)
  if (code?.vergrendeld) {
    return {
      ok: false,
      error: `"${code.omschrijving}" is al volledig gefactureerd en kan niet meer worden gewijzigd. `
        + 'Corrigeren gaat via een creditnota in Bouw7.',
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any

  const { data: bestaand } = await supabase
    .from('factuur_regelinstellingen')
    .select('*')
    .eq('dossier_id', dossierId)
    .eq('bewakingscode', bewakingscode)
    .maybeSingle()

  const rij = {
    dossier_id: dossierId,
    bewakingscode,
    omschrijving: patch.omschrijving !== undefined ? (patch.omschrijving?.trim() || null) : bestaand?.omschrijving ?? null,
    opslag_pct: patch.opslag_pct !== undefined ? patch.opslag_pct : bestaand?.opslag_pct ?? null,
    bedrag_excl_btw: patch.bedrag_excl_btw !== undefined ? patch.bedrag_excl_btw : bestaand?.bedrag_excl_btw ?? null,
    uitsplitsen: patch.uitsplitsen !== undefined ? patch.uitsplitsen : bestaand?.uitsplitsen ?? false,
    btw_tarief_bouw7_id: patch.btw_tarief_bouw7_id !== undefined ? patch.btw_tarief_bouw7_id : bestaand?.btw_tarief_bouw7_id ?? null,
    meefactureren: patch.meefactureren !== undefined ? patch.meefactureren : bestaand?.meefactureren ?? true,
    updated_at: new Date().toISOString(),
  }

  const { error } = await supabase
    .from('factuur_regelinstellingen')
    .upsert(rij, { onConflict: 'dossier_id,bewakingscode' })
  if (error) return { ok: false, error: error.message }

  revalidatePath('/opdrachten/' + dossierId + '/verkoop')
  revalidatePath('/servicedesk/' + dossierId + '/financieel')
  return { ok: true }
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
  opties: { btwTariefBouw7Id: number },
): Promise<{ ok: true; invoiceId: number; aantal: number; totaal: number } | { ok: false; error: string; invoiceId?: number }> {
  await vereisRecht('financieel', 'schrijven')
  await assertDossierBewerkbaar(dossierId)

  const ctx = await bouw7VoorDossier(dossierId)
  if (!ctx) return { ok: false, error: 'Dit dossier is niet aan een Bouw7-project gekoppeld.' }

  if (!Number.isFinite(opties.btwTariefBouw7Id)) {
    return { ok: false, error: 'Kies eerst een btw-tarief voor deze factuur.' }
  }

  // Het voorstel wordt hier server-side opnieuw opgebouwd; wat de client meestuurde is alleen de
  // btw-keuze. Zo kan een verouderd scherm nooit iets factureren wat inmiddels anders ligt.
  const voorstel = await getRegieFactuurvoorstel(dossierId)
  if (voorstel.regels.length === 0) return { ok: false, error: 'Er is niets te factureren.' }

  // Sleutel over de inhoud: dezelfde regels met dezelfde bedragen leveren dezelfde sleutel op, dus
  // een tweede klik vindt de bestaande conceptfactuur terug in plaats van een duplicaat te maken.
  const basis = dossierId + '|regie|' + voorstel.regels
    .map(r => r.sleutel + ':' + Math.round(r.bedrag * 100)).join(',')
  const sleutel = createHash('sha1').update(basis).digest('hex').slice(0, 16)

  const res = await maakConceptVerkoopfactuur({
    projectId: Number(ctx.bouw7Id),
    idempotentieSleutel: sleutel,
    omschrijving: 'Nacalculatie regiewerk en stelposten',
    regels: voorstel.regels.map(r => ({
      omschrijving: r.omschrijving,
      aantal: r.aantal,
      eenheid: r.eenheid,
      stukprijs: r.stukprijs,
      // Btw per regel wint van de factuurbrede keuze; zo kan arbeid op 9% en materiaal op 21%.
      vatTariffId: r.btwTariefBouw7Id ?? opties.btwTariefBouw7Id,
    })),
  })
  if (!res.ok) return res

  // Pas nu afboeken, en alleen de boekingen die daadwerkelijk op deze factuur staan. Alles
  // wegstrepen zou kosten op codes die in de aanneemsom zitten als gefactureerd markeren, terwijl
  // die hier nooit op een factuur komen.
  const gefactureerdeCodes = new Set(voorstel.regels.map(r => r.bewakingscode))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  const regie = await getServicedeskRegie(dossierId)
  const mee = regie.regels.filter(r =>
    !r.uitgesloten && r.status !== 'gefactureerd'
    && r.bewakingscode && gefactureerdeCodes.has(r.bewakingscode))
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

  revalidatePath('/servicedesk/' + dossierId + '/financieel')
  revalidatePath('/opdrachten/' + dossierId + '/verkoop')
  return { ok: true, invoiceId: res.invoiceId, aantal: voorstel.regels.length, totaal: res.totaalExclBtw }
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
