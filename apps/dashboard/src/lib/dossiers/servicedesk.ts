'use server'

import { createAdminClient } from '@everts/database/server'
import { revalidatePath } from 'next/cache'
import { createHash } from 'node:crypto'
import { getDossierUren, getDossierInkoop, bouw7VoorDossier } from './actions'
import { assertDossierBewerkbaar } from './guards'
import { vereisRecht } from '@/lib/auth/rechten'
import { maakConceptVerkoopfactuur } from '@/lib/bouw7/verkoopfactuur'
import { ververSnapshotsNaSchrijven } from '@/lib/bouw7/snapshot'
import { getFactureerbareCodes, getCodeInstellingen, getRegelGroepen } from './facturatie-codes'
import {
  aantalEnEenheid, afgeleideOmschrijving, groepeer, groepSleutelVoor, isHandmatigeGroep,
  bedragUitOpslag, bedragUitTarief, isLosseRegel, nieuweHandmatigeSleutel, nieuweLosseSleutel,
  soortVan, tariefEnOpslag, type Groepering,
} from './factuurregel-groepen'

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
  /** Boekingsdatum: het uurlog of de inkoopfactuur. Alleen ter herkenning in het scherm. */
  datum: string | null
  /** Medewerker (uren) of leverancier (kosten) — waar de boeking vandaan komt. */
  herkomst: string | null
  /** Handmatige toewijzing aan een factuurregel; leeg = volg de groepering van de code. */
  groepSleutel: string | null
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
  /** Prijs is handmatig vastgezet; leeg = hij volgt nog de standaardberekening. */
  handmatigePrijs: boolean
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
  groep_sleutel: string | null
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
      datum: u.datum,
      herkomst: u.medewerker,
      groepSleutel: opgesl?.groep_sleutel ?? null,
      aantal: u.uren,
      eenheid: 'uur',
      inkoopBedrag: u.uren * (u.uurtarief ?? 0),
      opslagPct: opgesl?.opslag_pct ?? null,
      verkoopTarief,
      verkoopBedrag,
      handmatigePrijs: opgesl?.verkoop_bedrag != null,
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
      datum: k.datum,
      herkomst: k.leverancier,
      groepSleutel: opgesl?.groep_sleutel ?? null,
      aantal: 1,
      eenheid: 'post',
      inkoopBedrag: k.bedrag,
      opslagPct,
      verkoopTarief: null,
      verkoopBedrag,
      handmatigePrijs: opgesl?.verkoop_bedrag != null,
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

/** Eén regel zoals de klant hem op de factuur ziet: een groep boekingen van één bewakingscode. */
export type FactuurRegelVoorstel = {
  sleutel: string
  bewakingscode: string
  groepSleutel: string
  omschrijving: string
  aantal: number
  eenheid: string | null
  stukprijs: number
  bedrag: number
  aantalBoekingen: number
  /** Btw-tarief voor déze regel; leeg = het tarief dat voor de hele factuur is gekozen. */
  btwTariefBouw7Id: number | null
}

/** Eén geboekte uren- of kostenregel, zoals de tabel in het scherm hem toont. */
export type BoekingView = {
  /** `bronType:bronBouw7Id` — stabiel over herladen heen. */
  sleutel: string
  bronType: 'uur' | 'kost'
  bronBouw7Id: string
  datum: string | null
  omschrijving: string
  herkomst: string | null
  /** Uursoort of kostensoort; hierop bundelt de standaardgroepering. */
  soort: string
  aantal: number | null
  eenheid: string | null
  /** Kostprijs excl. btw. */
  inkoopBedrag: number
  /**
   * Verkooptarief per eenheid, afgeleid uit het verkoopbedrag. Leeg als er geen aantal is om door
   * te delen (kostenposten tellen als één post; dan ís het verkoopbedrag de prijs).
   */
  verkoopTarief: number | null
  /**
   * Opslag op de kostprijs in procenten, óók afgeleid uit het verkoopbedrag. Leeg als de kostprijs
   * nul is: dan bestaat er geen percentage dat naar het verkoopbedrag leidt.
   *
   * Tarief en opslag zijn bewust twee vensters op hetzelfde bedrag en worden altijd samen herleid.
   * Zou er één opgeslagen waarde worden getoond naast een bedrag dat inmiddels ergens anders vandaan
   * komt, dan lees je een tarief van 75 als 75% opslag — en dat is precies het verschil tussen
   * marge en uurprijs.
   */
  opslagPct: number | null
  /** Wat deze boeking bijdraagt aan de factuur; de bron waar tarief en opslag uit volgen. */
  verkoopBedrag: number
  /** Prijs is hier handmatig vastgezet; leeg = hij volgt nog het relatietarief of de bedrijfsopslag. */
  handmatigePrijs: boolean
  uitgesloten: boolean
  /** Staat al op een verstuurde factuur: alleen ter informatie, niet meer te wijzigen. */
  gefactureerd: boolean
  /** De factuurregel waar hij nu in valt. */
  groepSleutel: string
  /** Handmatig toegewezen (true) of gevolgd uit de groepering (false). */
  handmatigToegewezen: boolean
}

/** Eén factuurregel in wording, met de boekingen die erin vallen. */
export type GroepView = {
  groepSleutel: string
  /** De tekst zoals hij op de factuur komt. */
  omschrijving: string
  /** Zelf ingevulde tekst; leeg = afgeleid van de code en het soort werk. */
  eigenOmschrijving: string | null
  /** Som van de boekingen in deze regel. */
  berekend: number
  /** Handmatig vastgezet bedrag; leeg = `berekend` telt. */
  bedragOverride: number | null
  /** Wat er werkelijk op de factuur komt. */
  bedrag: number
  aantal: number
  eenheid: string | null
  btwTariefBouw7Id: number | null
  meefactureren: boolean
  aantalBoekingen: number
  /** Handmatig samengevoegd — die regel blijft staan los van de groeperingskeuze. */
  handmatig: boolean
  /**
   * Losse regel: een post die niet uit een boeking volgt (opstartkosten, voorrijkosten). Hij bestaat
   * alleen als opgeslagen rij en is daarom ook als enige te verwijderen.
   */
  los: boolean
  /** Alleen bij losse regels: staat al op een verstuurde factuur en telt niet meer mee. */
  gefactureerd: boolean
}

/** Eén bewakingscode met alles wat het scherm nodig heeft om zijn factuurregels samen te stellen. */
export type CodeRegelView = {
  bewakingscode: string
  bron: 'stelpost' | 'meerwerk'
  /** De naam van de post; basis voor de tekst van elke factuurregel eronder. */
  omschrijving: string
  /** Kostprijs van wat er op deze code is geboekt. */
  inkoop: number
  /** Verkoopwaarde volgens de berekening: uren maal tarief, kosten maal opslag. */
  berekend: number
  /** Wat er werkelijk op de factuur komt (na vaste bedragen en uitgezette regels). */
  bedrag: number
  /** Eigen opslag op de kosten van deze code; leeg = de bedrijfsstandaard. */
  opslagPct: number | null
  /** Hoe boekingen zonder handmatige toewijzing worden gebundeld. */
  groepering: Groepering
  /** Btw voor de hele code; een factuurregel mag er alsnog van afwijken. */
  btwTariefBouw7Id: number | null
  meefactureren: boolean
  /** De factuurregels die deze code oplevert, in factuurvolgorde. */
  groepen: GroepView[]
  /** Alle nog te factureren boekingen, plus de al gefactureerde ter informatie. */
  boekingen: BoekingView[]
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
  const [codes, instellingen, groepen] = await Promise.all([
    getFactureerbareCodes(dossierId),
    getCodeInstellingen(dossierId),
    getRegelGroepen(dossierId),
  ])
  const instelling = new Map(instellingen.map(i => [i.bewakingscode, i]))
  const groep = new Map(groepen.map(g => [`${g.bewakingscode}|${g.groep_sleutel}`, g]))

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
    const eerderGefactureerd = gefactureerd.filter(r => r.bewakingscode === c.bewakingscode)
    // Niets meer open én er is al gefactureerd: deze post is klaar en gaat op slot.
    const vergrendeld = eerderGefactureerd.length > 0 && eigen.length === 0
    const uren = eigen.filter(r => r.bronType === 'uur')
    const kosten = eigen.filter(r => r.bronType === 'kost')

    const urenBedrag = rond(uren.reduce((s, r) => s + (r.verkoopBedrag || 0), 0))
    const kostenBedrag = rond(kosten.reduce((s, r) => s + (r.verkoopBedrag || 0), 0))
    const urenAantal = rond(uren.reduce((s, r) => s + (r.aantal ?? 0), 0))
    const inkoop = rond(eigen.reduce((s, r) => s + (r.inkoopBedrag || 0), 0))
    const berekend = rond(urenBedrag + kostenBedrag)

    const codeOmschrijving = (inst?.omschrijving ?? '').trim() || c.omschrijving
    const meefactureren = inst?.meefactureren ?? true
    const groepering: Groepering = inst?.groepering ?? 'per_soort'
    const codeBtw = inst?.btw_tarief_bouw7_id ?? null

    // Groeperen gebeurt met dezelfde functie als het scherm gebruikt, zodat wat er op het scherm
    // staat en wat er naar Bouw7 gaat niet uit elkaar kunnen lopen.
    const gegroepeerd = groepeer(eigen, groepering)
    const enkeleRegel = gegroepeerd.length === 1

    const groepenView: GroepView[] = gegroepeerd.map(g => {
      const opgeslagenGroep = groep.get(`${c.bewakingscode}|${g.groepSleutel}`)
      const eigenOms = (opgeslagenGroep?.omschrijving ?? '').trim() || null
      const override = opgeslagenGroep?.bedrag_excl_btw != null
        ? Number(opgeslagenGroep.bedrag_excl_btw)
        : null
      const { aantal, eenheid } = aantalEnEenheid(g.boekingen)
      return {
        groepSleutel: g.groepSleutel,
        omschrijving: eigenOms ?? afgeleideOmschrijving(g.groepSleutel, codeOmschrijving, {
          alleenRegel: enkeleRegel,
          boekingOmschrijving: g.boekingen[0]?.omschrijving,
        }),
        eigenOmschrijving: eigenOms,
        berekend: g.berekend,
        bedragOverride: override,
        bedrag: override ?? g.berekend,
        aantal,
        eenheid,
        btwTariefBouw7Id: opgeslagenGroep?.btw_tarief_bouw7_id ?? codeBtw,
        meefactureren: opgeslagenGroep?.meefactureren ?? true,
        aantalBoekingen: g.boekingen.length,
        handmatig: isHandmatigeGroep(g.groepSleutel),
        los: false,
        gefactureerd: false,
      }
    })

    // Losse regels komen er als laatste bij. Ze volgen uit geen enkele boeking, dus `groepeer()`
    // kent ze niet — ze bestaan puur als opgeslagen rij en dragen hun eigen bedrag.
    for (const l of groepen) {
      if (l.bewakingscode !== c.bewakingscode || !isLosseRegel(l.groep_sleutel)) continue
      const bedrag = l.bedrag_excl_btw != null ? Number(l.bedrag_excl_btw) : 0
      groepenView.push({
        groepSleutel: l.groep_sleutel,
        omschrijving: (l.omschrijving ?? '').trim() || 'Losse regel',
        eigenOmschrijving: l.omschrijving,
        berekend: 0,
        bedragOverride: l.bedrag_excl_btw != null ? bedrag : null,
        bedrag,
        aantal: 1,
        eenheid: 'post',
        btwTariefBouw7Id: l.btw_tarief_bouw7_id ?? codeBtw,
        meefactureren: l.meefactureren,
        aantalBoekingen: 0,
        handmatig: false,
        los: true,
        gefactureerd: l.bouw7_invoice_id != null,
      })
    }

    const naarView = (r: RegieFactuurRegel, isGefactureerd: boolean): BoekingView => ({
      sleutel: `${r.bronType}:${r.bronBouw7Id}`,
      bronType: r.bronType,
      bronBouw7Id: r.bronBouw7Id,
      datum: r.datum,
      omschrijving: r.omschrijving ?? (r.bronType === 'uur' ? 'Uren' : 'Kosten'),
      herkomst: r.herkomst,
      soort: soortVan(r),
      aantal: r.aantal,
      eenheid: r.eenheid,
      inkoopBedrag: r.inkoopBedrag,
      ...tariefEnOpslag(r.verkoopBedrag, r.aantal, r.inkoopBedrag),
      verkoopBedrag: r.verkoopBedrag,
      handmatigePrijs: r.handmatigePrijs,
      uitgesloten: r.uitgesloten,
      gefactureerd: isGefactureerd,
      groepSleutel: groepSleutelVoor(r, groepering),
      handmatigToegewezen: r.groepSleutel != null,
    })

    // Uitgesloten boekingen horen in de tabel thuis: uitzetten is een keuze die je terug moet zien
    // en moet kunnen herroepen. Ze tellen alleen niet mee in een groep.
    const uitgeslotenEigen = opCode.filter(r =>
      r.bewakingscode === c.bewakingscode && r.uitgesloten && r.status !== 'gefactureerd')

    views.push({
      bewakingscode: c.bewakingscode,
      bron: c.bron,
      omschrijving: codeOmschrijving,
      inkoop,
      berekend,
      bedrag: rond(groepenView.filter(g => g.meefactureren && !g.gefactureerd).reduce((s, g) => s + g.bedrag, 0)),
      opslagPct: inst?.opslag_pct != null ? Number(inst.opslag_pct) : c.opslagPct,
      groepering,
      btwTariefBouw7Id: codeBtw,
      meefactureren,
      groepen: groepenView,
      boekingen: [
        ...eigen.map(r => naarView(r, false)),
        ...uitgeslotenEigen.map(r => naarView(r, false)),
        ...eerderGefactureerd.map(r => naarView(r, true)),
      ],
      urenBedrag,
      kostenBedrag,
      urenAantal,
      aantalBoekingen: eigen.length,
      aantalGefactureerd: eerderGefactureerd.length,
      inBouw7: c.inBouw7,
      vergrendeld,
    })

    if (!meefactureren) continue

    for (const g of groepenView) {
      // Een afgeleide groep zonder openstaande boekingen heeft niets te factureren; een losse regel
      // draagt zijn bedrag zelf, maar mag maar één keer mee — daarna is hij afgeboekt op de factuur
      // waar hij op staat. Zonder die controle zou hij elke volgende keer opnieuw meegaan.
      if (!g.los && eigen.length === 0) continue
      if (g.los && g.gefactureerd) continue
      if (!g.meefactureren || g.bedrag === 0) continue
      regels.push({
        sleutel: `${c.bewakingscode}|${g.groepSleutel}`,
        bewakingscode: c.bewakingscode,
        groepSleutel: g.groepSleutel,
        omschrijving: g.omschrijving,
        aantal: g.aantal,
        eenheid: g.eenheid,
        // Stukprijs volgt uit het bedrag, ook als dat handmatig is vastgezet: anders zou de factuur
        // een aantal maal een prijs tonen die niet op het regeltotaal uitkomt.
        stukprijs: g.aantal ? rond(g.bedrag / g.aantal) : g.bedrag,
        bedrag: g.bedrag,
        aantalBoekingen: g.aantalBoekingen,
        btwTariefBouw7Id: g.btwTariefBouw7Id,
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

/**
 * Poortwachter voor elke wijziging aan de factuuropbouw van één code.
 *
 * De controle staat hier en niet alleen in het scherm: een verouderd geopend tabblad mag een
 * verstuurde factuur niet alsnog van omschrijving of bedrag kunnen laten veranderen.
 */
async function vereisBewerkbareCode(
  dossierId: string,
  bewakingscode: string,
): Promise<{ ok: true; code: CodeRegelView | undefined } | { ok: false; error: string }> {
  await vereisRecht('financieel', 'schrijven')
  await assertDossierBewerkbaar(dossierId)
  // Het voorstel gaat mee terug naar de aanroeper. Het opbouwen ervan haalt uren en kosten live uit
  // Bouw7; dat twee keer doen per opgeslagen veld maakt een tabel waarin je regel voor regel werkt
  // merkbaar traag.
  const huidig = await getRegieFactuurvoorstel(dossierId)
  const code = huidig.codes.find(c => c.bewakingscode === bewakingscode)
  if (code?.vergrendeld) {
    return {
      ok: false,
      error: `"${code.omschrijving}" is al volledig gefactureerd en kan niet meer worden gewijzigd. `
        + 'Corrigeren gaat via een creditnota in Bouw7.',
    }
  }
  return { ok: true, code }
}

function herlaadFacturatie(dossierId: string) {
  revalidatePath('/opdrachten/' + dossierId + '/verkoop')
  revalidatePath('/servicedesk/' + dossierId + '/financieel')
}

/** Slaat de instellingen van één bewakingscode op: naam, opslag, groepering, btw, wel/niet mee. */
export async function bewaarCodeInstelling(
  dossierId: string,
  bewakingscode: string,
  patch: {
    omschrijving?: string | null
    opslag_pct?: number | null
    groepering?: Groepering
    btw_tarief_bouw7_id?: number | null
    meefactureren?: boolean
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const toegang = await vereisBewerkbareCode(dossierId, bewakingscode)
  if (!toegang.ok) return toegang

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
    groepering: patch.groepering !== undefined ? patch.groepering : bestaand?.groepering ?? 'per_soort',
    btw_tarief_bouw7_id: patch.btw_tarief_bouw7_id !== undefined ? patch.btw_tarief_bouw7_id : bestaand?.btw_tarief_bouw7_id ?? null,
    meefactureren: patch.meefactureren !== undefined ? patch.meefactureren : bestaand?.meefactureren ?? true,
    updated_at: new Date().toISOString(),
  }

  const { error } = await supabase
    .from('factuur_regelinstellingen')
    .upsert(rij, { onConflict: 'dossier_id,bewakingscode' })
  if (error) return { ok: false, error: error.message }

  herlaadFacturatie(dossierId)
  return { ok: true }
}

/**
 * Slaat een aanpassing van één factuurregel op: eigen tekst, vast bedrag, eigen btw, of uitzetten.
 *
 * Een rij ontstaat pas bij de eerste afwijking. Zolang er niets van gezegd is blijft de regel
 * volledig afgeleid uit de boekingen, en beweegt hij dus mee als er werk bij komt.
 */
export async function bewaarFactuurGroep(
  dossierId: string,
  bewakingscode: string,
  groepSleutel: string,
  patch: {
    omschrijving?: string | null
    bedrag_excl_btw?: number | null
    btw_tarief_bouw7_id?: number | null
    meefactureren?: boolean
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const toegang = await vereisBewerkbareCode(dossierId, bewakingscode)
  if (!toegang.ok) return toegang

  // Een losse regel die al op een verstuurde factuur staat ligt net zo vast als een boeking die
  // is afgeboekt: de omschrijving of het bedrag nu nog wijzigen zou suggereren dat die factuur is
  // meegewijzigd. De code als geheel is dan meestal nog niet vergrendeld, dus dit moet hier apart.
  const alGefactureerd = toegang.code?.groepen.find(g => g.groepSleutel === groepSleutel)?.gefactureerd
  if (alGefactureerd) {
    return {
      ok: false,
      error: 'Deze regel staat al op een factuur en kan niet meer worden gewijzigd. '
        + 'Corrigeren gaat via een creditnota in Bouw7.',
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  const { data: bestaand } = await supabase
    .from('factuur_regelgroepen')
    .select('*')
    .eq('dossier_id', dossierId)
    .eq('bewakingscode', bewakingscode)
    .eq('groep_sleutel', groepSleutel)
    .maybeSingle()

  const rij = {
    dossier_id: dossierId,
    bewakingscode,
    groep_sleutel: groepSleutel,
    omschrijving: patch.omschrijving !== undefined ? (patch.omschrijving?.trim() || null) : bestaand?.omschrijving ?? null,
    bedrag_excl_btw: patch.bedrag_excl_btw !== undefined ? patch.bedrag_excl_btw : bestaand?.bedrag_excl_btw ?? null,
    btw_tarief_bouw7_id: patch.btw_tarief_bouw7_id !== undefined ? patch.btw_tarief_bouw7_id : bestaand?.btw_tarief_bouw7_id ?? null,
    meefactureren: patch.meefactureren !== undefined ? patch.meefactureren : bestaand?.meefactureren ?? true,
    volgorde: bestaand?.volgorde ?? 0,
    updated_at: new Date().toISOString(),
  }

  const { error } = await supabase
    .from('factuur_regelgroepen')
    .upsert(rij, { onConflict: 'dossier_id,bewakingscode,groep_sleutel' })
  if (error) return { ok: false, error: error.message }

  herlaadFacturatie(dossierId)
  return { ok: true }
}

/**
 * Voegt een losse factuurregel toe: een post die niet uit een boeking volgt, zoals opstartkosten of
 * voorrijkosten. Hij hangt aan een bewakingscode omdat de factuur per code wordt opgebouwd, maar
 * heeft verder niets onder zich — het bedrag is wat er staat.
 *
 * De sleutel wordt hier bepaald en niet in het scherm: twee mensen die tegelijk een regel toevoegen
 * mogen elkaars regel niet overschrijven.
 */
export async function voegLosseRegelToe(
  dossierId: string,
  bewakingscode: string,
  regel: { omschrijving: string; bedragExclBtw: number | null },
): Promise<{ ok: true; groepSleutel: string } | { ok: false; error: string }> {
  const toegang = await vereisBewerkbareCode(dossierId, bewakingscode)
  if (!toegang.ok) return toegang
  const omschrijving = regel.omschrijving.trim()
  if (!omschrijving) return { ok: false, error: 'Geef de regel een omschrijving; die komt zo op de factuur.' }

  const sleutel = nieuweLosseSleutel()
  const r = await bewaarFactuurGroep(dossierId, bewakingscode, sleutel, {
    omschrijving,
    bedrag_excl_btw: regel.bedragExclBtw,
  })
  if (!r.ok) return r
  return { ok: true, groepSleutel: sleutel }
}

/**
 * Verwijdert een losse factuurregel. Alleen die: een afgeleide groep verwijderen heeft geen
 * betekenis — hij wordt bij de volgende opbouw gewoon opnieuw uit de boekingen afgeleid, en de rij
 * wissen zou alleen de instellingen weggooien. Een regel die al op een factuur staat blijft staan.
 */
export async function verwijderLosseRegel(
  dossierId: string,
  bewakingscode: string,
  groepSleutel: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const toegang = await vereisBewerkbareCode(dossierId, bewakingscode)
  if (!toegang.ok) return toegang
  if (!isLosseRegel(groepSleutel)) {
    return { ok: false, error: 'Alleen een zelf toegevoegde regel kan worden verwijderd.' }
  }
  const bestaand = toegang.code?.groepen.find(g => g.groepSleutel === groepSleutel)
  if (bestaand?.gefactureerd) {
    return { ok: false, error: 'Deze regel staat al op een factuur en kan niet meer worden verwijderd.' }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  const { error } = await supabase
    .from('factuur_regelgroepen')
    .delete()
    .eq('dossier_id', dossierId)
    .eq('bewakingscode', bewakingscode)
    .eq('groep_sleutel', groepSleutel)
  if (error) return { ok: false, error: error.message }

  herlaadFacturatie(dossierId)
  return { ok: true }
}

/**
 * Voegt de opgegeven boekingen samen tot één factuurregel, of haalt ze juist uit hun handmatige
 * regel (`groepSleutel: null`) zodat ze de groepering van de code weer volgen.
 *
 * De sleutel wordt hier bepaald en niet in het scherm: twee mensen die tegelijk samenvoegen mogen
 * elkaars regel niet overschrijven.
 */
export async function zetBoekingGroep(
  dossierId: string,
  bewakingscode: string,
  boekingen: { bronType: 'uur' | 'kost'; bronBouw7Id: string }[],
  doel: { groepSleutel: string | null; omschrijving?: string | null } | 'nieuw',
): Promise<{ ok: true; groepSleutel: string | null } | { ok: false; error: string }> {
  const toegang = await vereisBewerkbareCode(dossierId, bewakingscode)
  if (!toegang.ok) return toegang
  if (boekingen.length === 0) return { ok: false, error: 'Kies eerst welke boekingen bij elkaar horen.' }

  const sleutel = doel === 'nieuw' ? nieuweHandmatigeSleutel() : doel.groepSleutel
  const omschrijving = doel === 'nieuw' ? null : (doel.omschrijving ?? undefined)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any

  // De boekingen zelf zijn Bouw7-data; EVA bewaart alleen de afwijking. Bestaat er nog geen rij,
  // dan moet de bekende verkoopwaarde mee — anders zou de regel bij het volgende laden terugvallen
  // op de standaardberekening en stilletjes van bedrag veranderen.
  const bekend = new Map((toegang.code?.boekingen ?? []).map(b => [b.sleutel, b]))

  for (const b of boekingen) {
    const bron = bekend.get(`${b.bronType}:${b.bronBouw7Id}`)
    if (!bron) continue
    if (bron.gefactureerd) {
      return { ok: false, error: 'Een boeking die al op een factuur staat kan niet worden verplaatst.' }
    }
    const { error } = await supabase.from('regie_factuurregels').upsert({
      dossier_id: dossierId,
      bron_type: b.bronType,
      bron_bouw7_id: b.bronBouw7Id,
      omschrijving: bron.omschrijving,
      aantal: bron.aantal,
      eenheid: bron.eenheid,
      inkoop_bedrag: bron.inkoopBedrag,
      opslag_pct: bron.opslagPct,
      verkoop_tarief: bron.verkoopTarief,
      verkoop_bedrag: bron.verkoopBedrag,
      bewakingscode,
      uitgesloten: bron.uitgesloten,
      groep_sleutel: sleutel,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'dossier_id,bron_type,bron_bouw7_id' })
    if (error) return { ok: false, error: error.message }
  }

  if (sleutel && omschrijving !== undefined) {
    const r = await bewaarFactuurGroep(dossierId, bewakingscode, sleutel, { omschrijving })
    if (!r.ok) return r
  }

  herlaadFacturatie(dossierId)
  return { ok: true, groepSleutel: sleutel }
}

/**
 * Zet de verkoopprijs van één of meer boekingen: via een opslag op de kostprijs, via een uurtarief,
 * of als hard bedrag. Wat leeg blijft valt terug op de berekening.
 *
 * Meerdere boekingen tegelijk kunnen is geen luxe: het voorstel opbouwen haalt uren en kosten live
 * uit Bouw7, dus een selectie van tien regels stuk voor stuk opslaan zou tien keer dat werk doen.
 */
export async function bewaarBoekingen(
  dossierId: string,
  bewakingscode: string,
  boekingen: { bronType: 'uur' | 'kost'; bronBouw7Id: string }[],
  /**
   * Geef hoogstens één prijsveld mee — welk venster op de prijs de gebruiker ook gebruikte, de
   * andere twee worden hier herleid. `null` wist de handmatige prijs en laat de boeking terugvallen
   * op de standaardberekening (relatietarief of bedrijfsopslag).
   */
  patch: {
    /** Verkoopprijs per eenheid; bedrag = tarief × aantal. */
    verkoopTarief?: number | null
    /** Opslag op de kostprijs in procenten; bedrag = kostprijs × (1 + pct/100). */
    opslagPct?: number | null
    /** Het verkoopbedrag zelf. */
    verkoopBedrag?: number | null
    uitgesloten?: boolean
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const toegang = await vereisBewerkbareCode(dossierId, bewakingscode)
  if (!toegang.ok) return toegang
  if (boekingen.length === 0) return { ok: true }

  const bekend = new Map((toegang.code?.boekingen ?? []).map(b => [b.sleutel, b]))
  const rijen = []

  for (const boeking of boekingen) {
    const bron = bekend.get(`${boeking.bronType}:${boeking.bronBouw7Id}`)
    if (!bron) return { ok: false, error: 'Deze boeking hoort niet (meer) bij deze bewakingscode.' }
    if (bron.gefactureerd) {
      return { ok: false, error: 'Een boeking die al op een factuur staat ligt vast en kan niet worden gewijzigd.' }
    }

    // Welk venster op de prijs de gebruiker ook gebruikte, er komt één bedrag uit; tarief en opslag
    // worden daarna uit dát bedrag herleid. Zo kan er nooit een tarief naast een opslag komen te
    // staan die bij een ander bedrag hoort.
    const wist = patch.verkoopBedrag === null || patch.verkoopTarief === null || patch.opslagPct === null
    let verkoopBedrag: number | null
    if (wist) {
      verkoopBedrag = null
    } else if (patch.verkoopBedrag != null) {
      verkoopBedrag = patch.verkoopBedrag
    } else if (patch.verkoopTarief != null) {
      verkoopBedrag = bedragUitTarief(patch.verkoopTarief, bron.aantal)
    } else if (patch.opslagPct != null) {
      if (bron.inkoopBedrag <= 0) {
        return {
          ok: false,
          error: 'Zonder kostprijs valt er geen opslag op te rekenen. Vul een tarief of een verkoopbedrag in.',
        }
      }
      verkoopBedrag = bedragUitOpslag(bron.inkoopBedrag, patch.opslagPct)
    } else {
      // Alleen aan/uit gezet: laat de prijs staan zoals hij was, inclusief een eerdere terugval.
      verkoopBedrag = bron.handmatigePrijs ? bron.verkoopBedrag : null
    }

    const herleid = verkoopBedrag != null
      ? tariefEnOpslag(verkoopBedrag, bron.aantal, bron.inkoopBedrag)
      : { verkoopTarief: null, opslagPct: null }

    rijen.push({
      dossier_id: dossierId,
      bron_type: boeking.bronType,
      bron_bouw7_id: boeking.bronBouw7Id,
      omschrijving: bron.omschrijving,
      aantal: bron.aantal,
      eenheid: bron.eenheid,
      inkoop_bedrag: bron.inkoopBedrag,
      opslag_pct: herleid.opslagPct,
      verkoop_tarief: herleid.verkoopTarief,
      verkoop_bedrag: verkoopBedrag,
      bewakingscode,
      uitgesloten: patch.uitgesloten !== undefined ? patch.uitgesloten : bron.uitgesloten,
      groep_sleutel: bron.handmatigToegewezen ? bron.groepSleutel : null,
      updated_at: new Date().toISOString(),
    })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  const { error } = await supabase
    .from('regie_factuurregels')
    .upsert(rijen, { onConflict: 'dossier_id,bron_type,bron_bouw7_id' })
  if (error) return { ok: false, error: error.message }

  herlaadFacturatie(dossierId)
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

  // Pas nu afboeken, en alleen de boekingen die daadwerkelijk op deze factuur staan. Dat is nu
  // preciezer dan "alle boekingen van een gefactureerde code": een factuurregel die uitstond, of
  // een post die op nul uitkwam, ging niet mee en mag dus ook niet als gefactureerd gelden — anders
  // verdwijnt hij stilzwijgend van de volgende factuur.
  const opFactuur = new Set(voorstel.regels.map(r => `${r.bewakingscode}|${r.groepSleutel}`))
  const mee = voorstel.codes.flatMap(c =>
    c.boekingen
      .filter(b => !b.uitgesloten && !b.gefactureerd && opFactuur.has(`${c.bewakingscode}|${b.groepSleutel}`))
      .map(b => ({ boeking: b, bewakingscode: c.bewakingscode })))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any

  // Losse regels hebben geen boeking om af te boeken; ze onthouden zelf op welke factuur ze staan.
  // Zonder dit zouden opstart- of voorrijkosten bij elke volgende factuur opnieuw meegaan.
  for (const c of voorstel.codes) {
    for (const g of c.groepen) {
      if (!g.los || g.gefactureerd) continue
      if (!opFactuur.has(`${c.bewakingscode}|${g.groepSleutel}`)) continue
      await supabase
        .from('factuur_regelgroepen')
        .update({
          bouw7_invoice_id: String(res.invoiceId),
          gefactureerd_op: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('dossier_id', dossierId)
        .eq('bewakingscode', c.bewakingscode)
        .eq('groep_sleutel', g.groepSleutel)
    }
  }

  for (const { boeking, bewakingscode } of mee) {
    await supabase.from('regie_factuurregels').upsert({
      dossier_id: dossierId,
      bron_type: boeking.bronType,
      bron_bouw7_id: boeking.bronBouw7Id,
      omschrijving: boeking.omschrijving,
      aantal: boeking.aantal,
      eenheid: boeking.eenheid,
      inkoop_bedrag: boeking.inkoopBedrag,
      opslag_pct: boeking.opslagPct,
      verkoop_tarief: boeking.verkoopTarief,
      verkoop_bedrag: boeking.verkoopBedrag,
      bewakingscode,
      groep_sleutel: boeking.handmatigToegewezen ? boeking.groepSleutel : null,
      status: 'gefactureerd',
      bouw7_invoice_id: String(res.invoiceId),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'dossier_id,bron_type,bron_bouw7_id' })
  }

  // Er staat nu een concept-verkoopfactuur in Bouw7; die hoort meteen op het Verkoop-tab.
  await ververSnapshotsNaSchrijven(dossierId, ['verkoopfacturen'], ['termijnen', 'athena_financial'])
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
