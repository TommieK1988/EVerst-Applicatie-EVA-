'use server'

/**
 * Bestellingen → echte inkoopdocumenten in Bouw7.
 *
 * Een "bestelling" is een bundel werkbegroting-componenten van één leverancier. Deze module
 * maakt daar het formele document van: een **inkooporder** (materiaal/materieel) of een
 * **onderaannemerscontract** (onderaanneming), altijd in **concept** — versturen naar de
 * leverancier gebeurt in Bouw7 zelf.
 *
 * Belangrijkste ontwerpregel: het contract maakt **geen eigen regels** aan, maar koppelt de
 * bestelregels die de werkbegroting-push (`stuurWerkbegrotingBestelregelsBouw7`) al in Bouw7
 * heeft gezet, via `contractTerms[].contractOrderLines`. Zou het contract eigen regels
 * aanmaken, dan telden dezelfde kosten twee keer mee in de verwachte kosten per bewakingscode.
 * Gevolg: een component zónder `bouw7_line_id` kan niet besteld worden — eerst de bestelregels
 * pushen. Dat wordt als blokkade gemeld, niet stilzwijgend overgeslagen.
 *
 * Arbeid doet niet mee: eigen uren koop je niet in.
 */

import { createAdminClient } from '@everts/database/server'
import { revalidatePath } from 'next/cache'
import type { WerkbegrotingBestelling } from '@/lib/everts-calc/types'
import {
  schrijfBouw7Contract, verwijderBouw7Contract, verwijderBouw7ContractLeverbonnen,
  zetBouw7ContractStatus, roepBouw7ContractAf, getAfroepStatusId, leesBouw7Contract, PURCHASE_TYPE,
  type ContractSoort, type ContractTermijn,
} from '@/lib/bouw7/contracten'
import { getCurrentMedewerker } from '@/lib/auth/rechten'
import {
  syncWerkbegrotingNaarSupabase, syncBestellingenNaarSupabase,
  previewWerkbegrotingBestelregelsBouw7, type WerkbegrotingPayload,
} from './werkbegroting'

/** Componenttype → documentsoort. `arbeid` ontbreekt bewust: eigen uren worden niet ingekocht. */
const SOORT_PER_TYPE: Record<'onderaanneming' | 'materieel', ContractSoort> = {
  onderaanneming: 'oa_contract',
  materieel: 'inkooporder',
}

const soortLabel = (s: ContractSoort) => (s === 'oa_contract' ? 'OA-contract' : 'Inkooporder')

/**
 * Naam die als ondertekenaar van de afroep in Bouw7 komt te staan. De ingelogde medewerker, zodat
 * daar zichtbaar is wie de handeling verrichtte — niet een anonieme systeemnaam.
 */
async function bepaalSignee(): Promise<string> {
  const m = await getCurrentMedewerker().catch(() => null)
  const naam = [m?.voornaam, m?.tussenvoegsel, m?.achternaam].filter(Boolean).join(' ').trim()
  return naam || 'EVA'
}

/**
 * Roep de contracttermijnen af zodat Bouw7 de leverbon aanmaakt, en leg het resultaat vast.
 *
 * Zonder bon kan Bouw7 een inkoopfactuur niet aan dit contract koppelen — dat is precies waar de
 * bon voor dient. De bon is niet los aan te maken (zie `lib/bouw7/contracten.ts`): hij ontstaat
 * door af te roepen, en afroepen mag niet op een concept. Dus eerst de status uit concept halen.
 *
 * Mislukt het, dan blijft het contract gewoon staan en melden we alleen de bon als fout. De
 * contract-koppeling mag hier nooit gewist worden: een volgende poging zou dan een tweede contract
 * aanmaken en de kosten verdubbelen.
 */
async function voerAfroepUit(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  bestellingId: string,
  soort: ContractSoort,
  contractId: number,
  signee: string,
): Promise<{ bonnummer: string | null; bonAantal: number; fout: string | null }> {
  let bonId: number | null = null
  let bonnummer: string | null = null
  let bonAantal = 0
  let fout: string | null = null

  const afroepStatus = await getAfroepStatusId(soort).catch(() => null)
  if (afroepStatus == null) {
    fout = 'Kon de afroep-status van Bouw7 niet bepalen.'
  } else {
    const statusRes = await zetBouw7ContractStatus(soort, contractId, afroepStatus)
    if (!statusRes.ok) {
      fout = `Status doorzetten mislukt: ${statusRes.error}`
    } else {
      const afroep = await roepBouw7ContractAf(soort, contractId, signee)
      if (afroep.ok) { bonId = afroep.bonId; bonnummer = afroep.bonnummer; bonAantal = afroep.bonAantal }
      else fout = `Afroepen mislukt: ${afroep.error}`
    }
  }

  const nu = new Date().toISOString()
  await db.from('werkbegroting_bestellingen')
    .update({
      bouw7_leverbon_id: bonId,
      bouw7_bonnummer: bonnummer,
      bouw7_afroep_op: bonId != null ? nu : null,
      bouw7_sync_status: fout ? 'fout' : 'ok',
      bouw7_sync_fout: fout,
    })
    .eq('id', bestellingId)

  return { bonnummer, bonAantal, fout }
}

export type VoorstelRegel = {
  componentId: string
  omschrijving: string
  aantal: number
  prijs: number
  bedrag: number
  eenheid: string
  code: string
  pslId: number | null
  bouw7LineId: number | null
  geaccordeerd: boolean
}

export type BestellingVoorstel = {
  /** Stabiele sleutel (relatie × soort × bewakingscode) zodat de UI selecties kan onthouden. */
  sleutel: string
  relatieId: string | null
  relatieNaam: string
  relatieBouw7Id: number | null
  soort: ContractSoort
  soortLabel: string
  /** Bewakingscode waar dit hele voorstel op landt. Eén order = één code = één leverbon. */
  code: string
  codeNaam: string | null
  /** Winkelbudget: wordt als één samengevatte regel besteld i.p.v. per artikel. */
  isWinkel: boolean
  regels: VoorstelRegel[]
  totaal: number
  /** Redenen waarom deze bestelling (nog) niet aangemaakt kan worden. */
  blokkades: string[]
}

export type VoorstellenResultaat =
  | { ok: true; voorstellen: BestellingVoorstel[] }
  | { ok: false; error: string }

/**
 * Stel per leverancier/onderaannemer een concept-bestelling voor uit de componenten die nog
 * niet in een naar Bouw7 gepushte bestelling zitten. Puur lezend.
 */
export async function stelBestellingenVoor(
  dossierId: string,
  payload: WerkbegrotingPayload,
): Promise<VoorstellenResultaat> {
  const plan = await previewWerkbegrotingBestelregelsBouw7(dossierId, payload)
  if (!plan.ok) return { ok: false, error: plan.error }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any

  // Componenten die al in een bestelling zitten die in Bouw7 staat, niet opnieuw aanbieden.
  const { data: bestaande } = await db
    .from('werkbegroting_bestellingen')
    .select('id, bouw7_contract_id, werkbegroting_bestelling_regels(component_id)')
    .eq('werkbegroting_id', payload.wb.id)
  const alBesteld = new Set<string>()
  for (const b of (bestaande ?? []) as { bouw7_contract_id: number | null; werkbegroting_bestelling_regels: { component_id: string }[] }[]) {
    if (b.bouw7_contract_id == null) continue
    for (const j of b.werkbegroting_bestelling_regels ?? []) alBesteld.add(j.component_id)
  }

  const { berekenWerkbegrotingStatus } = await import('@/lib/goedkeuring/werkbegroting-status')
  const status = await berekenWerkbegrotingStatus(payload.wb.id).catch(() => ({ regels: [] as { regel_id: string; goedgekeurd: boolean }[] }))
  const goedgekeurd = new Map(status.regels.map(r => [r.regel_id, r.goedgekeurd]))

  const compById = new Map(payload.componenten.map(c => [c.id, c]))
  const planById = new Map(plan.regels.map(r => [r.componentId, r]))

  // Relatienamen + Bouw7-koppeling in één keer ophalen.
  const relatieIds = [...new Set(payload.componenten.map(c => c.relatie_id).filter((v): v is string => !!v))]
  const relaties = new Map<string, { naam: string; bouw7Id: number | null }>()
  if (relatieIds.length > 0) {
    const { data } = await db.from('relaties').select('id, naam, bouw7_id').in('id', relatieIds)
    for (const r of (data ?? []) as { id: string; naam: string; bouw7_id: string | null }[]) {
      const nummer = r.bouw7_id != null ? Number(r.bouw7_id) : NaN
      relaties.set(r.id, { naam: r.naam, bouw7Id: Number.isFinite(nummer) ? nummer : null })
    }
  }

  const groepen = new Map<string, BestellingVoorstel>()
  for (const comp of payload.componenten) {
    if (comp.is_verwijderd) continue
    if (comp.type === 'arbeid') continue
    if (alBesteld.has(comp.id)) continue

    const soort = SOORT_PER_TYPE[comp.type as 'onderaanneming' | 'materieel']
    if (!soort) continue

    const p = planById.get(comp.id)
    if (!p || p.bedrag === 0) continue

    const relatieId = comp.relatie_id ?? null
    const relatie = relatieId ? relaties.get(relatieId) : undefined
    const naamFallback = comp.type === 'onderaanneming' ? comp.aannemersnaam : comp.leverancier_naam

    // Groeperen op relatie × soort × bewakingscode. De code is bepalend: een leverbon draagt
    // precies één bewakingscode, dus een order die meerdere codes zou omvatten kan niet met één
    // bon worden afgeroepen en de kosten zouden op de verkeerde code landen.
    const sleutel = `${relatieId ?? 'onbekend'}|${soort}|${p.code || 'geen-code'}|${comp.is_winkel ? 'winkel' : 'regulier'}`
    let groep = groepen.get(sleutel)
    if (!groep) {
      groep = {
        sleutel, relatieId,
        relatieNaam: relatie?.naam ?? naamFallback?.trim() ?? 'Onbekende leverancier',
        relatieBouw7Id: relatie?.bouw7Id ?? null,
        soort, soortLabel: soortLabel(soort),
        code: p.code, codeNaam: p.codeNaam ?? null,
        isWinkel: !!comp.is_winkel,
        regels: [], totaal: 0, blokkades: [],
      }
      groepen.set(sleutel, groep)
    }

    groep.regels.push({
      componentId: comp.id,
      omschrijving: p.omschrijving || (comp.omschrijving ?? ''),
      aantal: p.aantal, prijs: p.prijs, bedrag: p.bedrag, eenheid: p.eenheid,
      code: p.code, pslId: p.pslId, bouw7LineId: p.bouw7LineId,
      geaccordeerd: goedgekeurd.get(comp.werkbegroting_regel_id) === true,
    })
    groep.totaal += p.bedrag
    void compById
  }

  // Blokkades per groep bepalen.
  for (const groep of groepen.values()) {
    if (groep.relatieBouw7Id == null) {
      groep.blokkades.push(
        groep.relatieId == null
          ? 'Geen relatie gekozen bij deze regels — kies een leverancier in de werkbegroting.'
          : `${groep.relatieNaam} is niet gekoppeld aan Bouw7.`,
      )
    }
    const zonderRegel = groep.regels.filter(r => r.bouw7LineId == null).length
    if (zonderRegel > 0) {
      groep.blokkades.push(`${zonderRegel} regel(s) staan nog niet in Bouw7 — stuur eerst "Bestelregels naar Bouw7".`)
    }
    if (!groep.code) {
      groep.blokkades.push('Geen bewakingscode op deze regels — vul de kostengroep in de werkbegroting in.')
    }
    const nietGeaccordeerd = groep.regels.filter(r => !r.geaccordeerd).length
    if (nietGeaccordeerd > 0) {
      groep.blokkades.push(`${nietGeaccordeerd} regel(s) zijn nog niet geaccordeerd.`)
    }
  }

  const voorstellen = [...groepen.values()].sort((a, b) => b.totaal - a.totaal)
  return { ok: true, voorstellen }
}

export type MaakBestellingResultaat =
  | { ok: true; contractId: number; nummer: string | null; soort: ContractSoort }
  | { ok: false; reden: 'niet_goedgekeurd' | 'verouderd' | 'fout'; error: string; regels?: string[] }

/**
 * Maak (of werk bij) het Bouw7-document als **concept** — nog niet verstuurd, nog geen leverbon.
 *
 * Eén action voor beide gevallen — een voorstel dat de gebruiker accepteert en een handmatig
 * samengestelde bestelling — zodat er maar één plek is waar de poortwachters draaien. Het
 * daadwerkelijk versturen (mail + afroep + leverbon) gebeurt in `verstuurBestelling`.
 */
export async function maakBestellingInBouw7(
  dossierId: string,
  bestelling: WerkbegrotingBestelling,
  payload: WerkbegrotingPayload,
): Promise<MaakBestellingResultaat> {
  const { hashComponentenSet } = await import('@/lib/everts-calc/goedkeuring-hash')
  const { controleerBestellingGates } = await import('@/lib/everts-calc/bestelling-gates')

  const sync = await syncWerkbegrotingNaarSupabase(payload)
  if (!sync.gelukt) return { ok: false, reden: 'fout', error: `Synchroniseren mislukt: ${sync.fout}` }

  const bestellingSync = await syncBestellingenNaarSupabase([bestelling])
  if (!bestellingSync.gelukt) return { ok: false, reden: 'fout', error: `Bestelling opslaan mislukt: ${bestellingSync.fout}` }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any
  const componentIds = new Set(bestelling.component_ids)

  // Hash vastleggen vóór de gate-controle: de bestelling wordt hier per definitie op de
  // huidige stand van de werkbegroting klaargezet.
  const gekozen = payload.componenten.filter(c => componentIds.has(c.id) && !c.is_verwijderd)
  const hash = await hashComponentenSet(gekozen)
  await db.from('werkbegroting_bestellingen')
    .update({ componenten_hash: hash, klaargezet_op: new Date().toISOString() })
    .eq('id', bestelling.id)

  const gate = await controleerBestellingGates({
    bestellingId: bestelling.id,
    werkbegrotingId: bestelling.werkbegroting_id,
    componentenHash: hash,
    componentIds,
    componenten: payload.componenten,
    regels: payload.regels,
  })
  if (!gate.ok) return gate

  // Een verstuurde order is definitief (er hangt een leverbon aan en Bouw7 kan er kosten op
  // boeken). Wijzigen gaat via een nieuwe bestelregel + nieuwe goedkeuring, niet door dit
  // document te overschrijven. Een aangemaakt-maar-nog-niet-verstuurd concept mag wél opnieuw
  // (upsert op het bestaande contract), zodat een gewijzigde omschrijving/bedrag nog meekan.
  const { data: rij } = await db
    .from('werkbegroting_bestellingen')
    .select('bouw7_contract_id, verstuurd_op')
    .eq('id', bestelling.id)
    .maybeSingle()
  const bestaandContractId: number | null = rij?.bouw7_contract_id ?? null

  if (rij?.verstuurd_op != null) {
    return {
      ok: false, reden: 'fout',
      error: 'Deze bestelling is al naar de leverancier verstuurd en kan niet meer gewijzigd worden. Maak een nieuwe bestelregel aan en laat die opnieuw accorderen.',
    }
  }

  const plan = await previewWerkbegrotingBestelregelsBouw7(dossierId, payload)
  if (!plan.ok) return { ok: false, reden: 'fout', error: plan.error }
  const planById = new Map(plan.regels.map(r => [r.componentId, r]))

  // Soort afleiden uit de componenten; gemengd is niet toegestaan (één document = één soort).
  const soorten = new Set(gate.componenten.map(c => SOORT_PER_TYPE[c.type as 'onderaanneming' | 'materieel']).filter(Boolean))
  if (soorten.size === 0) return { ok: false, reden: 'fout', error: 'Deze bestelling bevat geen inkoopbare regels (arbeid wordt niet ingekocht).' }
  if (soorten.size > 1) {
    return { ok: false, reden: 'fout', error: 'Deze bestelling mengt onderaanneming met materiaal — splits hem in twee bestellingen.' }
  }
  const soort = [...soorten][0] as ContractSoort

  // Relatie → Bouw7-contact.
  const relatieId = bestelling.relatie_id ?? gate.componenten.find(c => c.relatie_id)?.relatie_id ?? null
  if (!relatieId) return { ok: false, reden: 'fout', error: 'Geen leverancier gekoppeld aan deze bestelling.' }
  const { data: relatie } = await db.from('relaties').select('naam, bouw7_id').eq('id', relatieId).maybeSingle()
  const relatieBouw7Id = relatie?.bouw7_id != null ? Number(relatie.bouw7_id) : NaN
  if (!Number.isFinite(relatieBouw7Id)) {
    return { ok: false, reden: 'fout', error: `${relatie?.naam ?? 'De leverancier'} is niet gekoppeld aan Bouw7 — synchroniseer eerst de relaties.` }
  }

  // Winkelbudget: geen artikelregels maar één bedrag. De onderliggende bestelregels blijven
  // bestaan en worden allemaal aan die ene termijn gekoppeld, zodat ze niet dubbel tellen.
  const isWinkel = gate.componenten.every(c => c.is_winkel)

  const termijnen: ContractTermijn[] = []
  let totaal = 0
  for (const [i, comp] of gate.componenten.entries()) {
    const p = planById.get(comp.id)
    if (!p) return { ok: false, reden: 'verouderd', error: 'Een besteld component staat niet meer in de werkbegroting-planning.' }
    if (p.bouw7LineId == null) {
      return {
        ok: false, reden: 'fout',
        error: 'Niet alle regels staan al als bestelregel in Bouw7. Stuur eerst "Bestelregels naar Bouw7" en probeer het opnieuw.',
      }
    }
    if (isWinkel) { totaal += p.bedrag; continue }
    termijnen.push({
      nummer: String(i + 1),
      omschrijving: p.omschrijving || 'Werkzaamheden',
      eenheid: p.eenheid || 'post',
      aantal: String(p.aantal),
      stukprijs: p.prijs.toFixed(2),
      subtotaal: p.bedrag.toFixed(2),
      pslId: p.pslId ?? undefined,
      bestelregelIds: [p.bouw7LineId],
    })
    totaal += p.bedrag
  }

  if (isWinkel) {
    const eerste = planById.get(gate.componenten[0].id)
    termijnen.push({
      nummer: '1',
      omschrijving: bestelling.omschrijving || 'Winkelbudget',
      eenheid: 'post',
      aantal: '1',
      stukprijs: totaal.toFixed(2),
      subtotaal: totaal.toFixed(2),
      pslId: eerste?.pslId ?? undefined,
      bestelregelIds: gate.componenten
        .map(c => planById.get(c.id)?.bouw7LineId)
        .filter((id): id is number => id != null),
    })
  }

  const projectId = Number(plan.bouw7Id)
  if (!Number.isFinite(projectId)) return { ok: false, reden: 'fout', error: 'Dit dossier heeft geen geldig Bouw7-project.' }

  const res = await schrijfBouw7Contract({
    soort,
    projectId,
    relatieBouw7Id,
    naam: bestelling.omschrijving,
    omschrijving: bestelling.omschrijving,
    bedrag: totaal.toFixed(2),
    termijnen,
    bouw7ContractId: bestaandContractId,
    leverDatum: bestelling.levering_datum ?? null,
    leverTekst: bestelling.levering_tekst ?? null,
    betaalafspraak: bestelling.betaalafspraak ?? null,
    interneNotitie: bestelling.interne_notitie ?? null,
    purchaseType: soort === 'inkooporder' ? PURCHASE_TYPE.materiaal : undefined,
  })

  const nu = new Date().toISOString()
  if (!res.ok) {
    await db.from('werkbegroting_bestellingen')
      .update({ soort, bouw7_sync_status: 'fout', bouw7_sync_fout: res.error, bouw7_gesynct_op: nu })
      .eq('id', bestelling.id)
    return { ok: false, reden: 'fout', error: res.error }
  }

  // Contract staat als CONCEPT in Bouw7. Géén status-wissel en géén afroep hier: de leverbon
  // ontstaat pas bij "Versturen naar leverancier" (zie verstuurBestelling). Zo klopt de volgorde
  // met Bouw7 — je roept pas af als de order echt de deur uit gaat — en verschijnt er niet
  // administratief een levering vóór de order verstuurd is.
  await db.from('werkbegroting_bestellingen')
    .update({
      soort,
      bouw7_contract_id: res.contractId,
      bouw7_nummer: res.nummer,
      bouw7_sync_status: 'ok',
      bouw7_sync_fout: null,
      bouw7_gesynct_op: nu,
    })
    .eq('id', bestelling.id)

  revalidatePath(`/dossiers/${dossierId}`)
  return { ok: true, contractId: res.contractId, nummer: res.nummer, soort }
}

export type TrekInResultaat = { ok: true } | { ok: false; error: string }

/**
 * Trek een aangemaakte bestelling weer in: verwijdert eerst de leverbon en dan het contract in
 * Bouw7, en zet de EVA-bestelling terug op concept. De bestelregels blijven bestaan — die zijn
 * eigendom van de werkbegroting-push en worden door het verwijderen van het contract vanzelf
 * losgekoppeld.
 *
 * Volgorde is dwingend: een bestelregel die aan een contracttermijn hangt is niet verwijderbaar,
 * en een bon die blijft staan telt door als kosten op de bewakingscode.
 */
export async function trekBestellingIn(dossierId: string, bestellingId: string): Promise<TrekInResultaat> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any
  const { data: rij } = await db
    .from('werkbegroting_bestellingen')
    .select('id, soort, bouw7_contract_id, bouw7_leverbon_id, relatie_id')
    .eq('id', bestellingId)
    .maybeSingle()
  if (!rij) return { ok: false, error: 'Bestelling niet gevonden.' }
  if (rij.bouw7_contract_id == null) return { ok: false, error: 'Deze bestelling staat niet in Bouw7.' }

  const { data: dossier } = await db.from('dossiers').select('bouw7_id').eq('id', dossierId).maybeSingle()
  const projectId = dossier?.bouw7_id != null ? Number(dossier.bouw7_id) : NaN
  const { data: relatie } = rij.relatie_id
    ? await db.from('relaties').select('bouw7_id').eq('id', rij.relatie_id).maybeSingle()
    : { data: null }
  const relatieBouw7Id = relatie?.bouw7_id != null ? Number(relatie.bouw7_id) : NaN
  if (!Number.isFinite(projectId) || !Number.isFinite(relatieBouw7Id)) {
    return { ok: false, error: 'Kan het contract niet intrekken: project- of leveranciers-koppeling ontbreekt.' }
  }

  const soort = (rij.soort ?? 'inkooporder') as ContractSoort

  // Eerst de leverbon(nen): die dragen de kosten en zouden anders als losse post op de
  // bewakingscode blijven staan zonder order erbij. Er kunnen er meerdere zijn (één per regel).
  // Zit er al een inkoopfactuur op, dan weigert Bouw7 het verwijderen — dan stoppen we hier.
  if (rij.bouw7_leverbon_id != null) {
    const bonRes = await verwijderBouw7ContractLeverbonnen(soort, Number(rij.bouw7_contract_id))
    if (!bonRes.ok) {
      return {
        ok: false,
        error: `De leverbon(nen) kunnen niet verwijderd worden (${bonRes.error}).`,
      }
    }
  }

  const res = await verwijderBouw7Contract(
    soort,
    Number(rij.bouw7_contract_id),
    { projectId, relatieBouw7Id, bedrag: '0.00' },
  )
  if (!res.ok) return { ok: false, error: res.error }

  await db.from('werkbegroting_bestellingen')
    .update({
      status: 'concept', verzonden_op: null,
      verstuurd_op: null, verstuurd_door: null, verstuurd_naar: null,
      bouw7_contract_id: null, bouw7_nummer: null,
      bouw7_leverbon_id: null, bouw7_bonnummer: null, bouw7_afroep_op: null,
      bouw7_sync_status: null, bouw7_sync_fout: null,
      bouw7_gesynct_op: new Date().toISOString(),
    })
    .eq('id', bestellingId)

  revalidatePath(`/dossiers/${dossierId}`)
  return { ok: true }
}

// ─── Versturen naar de leverancier ────────────────────────────────────────────
//
// EVA maakt zelf een order-/contract-PDF (Bouw7 levert er geen die op te halen is) en mailt die
// via Outlook namens de ingelogde medewerker. Pas ná een geslaagde mail wordt afgeroepen
// (status uit concept + leverbon per regel) — zo klopt de volgorde met Bouw7: je roept pas af als
// de order echt de deur uit is.

/** Datum als dd-mm-jjjj voor op de PDF. */
function nlDatum(iso: string): string {
  const d = iso.slice(0, 10).split('-')
  return d.length === 3 ? `${d[2]}-${d[1]}-${d[0]}` : iso
}

export type BestellingMailConcept = {
  to: string
  onderwerp: string
  bericht: string
  /** Leeg als de leverancier geen e-mailadres heeft — dan moet de gebruiker het invullen. */
  heeftAdres: boolean
}

/** Prefill voor het verzendvenster: ontvanger, onderwerp en berichttekst. Puur lezend. */
export async function getBestellingMailConcept(bestellingId: string): Promise<BestellingMailConcept> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any
  const { data: b } = await db
    .from('werkbegroting_bestellingen')
    .select('soort, bouw7_nummer, omschrijving, relatie_id, werkbegroting_id')
    .eq('id', bestellingId)
    .maybeSingle()
  const soort = (b?.soort ?? 'inkooporder') as ContractSoort
  const { data: relatie } = b?.relatie_id
    ? await db.from('relaties').select('naam, email').eq('id', b.relatie_id).maybeSingle()
    : { data: null }

  const soortWoord = soort === 'oa_contract' ? 'opdracht' : 'inkooporder'
  const nummer = b?.bouw7_nummer ?? ''
  const onderwerp = `${soort === 'oa_contract' ? 'Opdracht' : 'Inkooporder'} ${nummer}`.trim()
  // Platte tekst met echte regeleinden; de HTML-opmaak gebeurt bij het versturen
  // (bouwBestellingMailHtml). De naam van de afzender staat er bewust niet onder: die komt
  // uit de Outlook-handtekening.
  const bericht =
    `Beste ${relatie?.naam ?? 'relatie'},\n\n` +
    `Hierbij ontvangt u onze ${soortWoord}${nummer ? ` ${nummer}` : ''}. ` +
    `De volledige omschrijving staat in de bijgevoegde pdf.\n\n` +
    `Wilt u de ${soortWoord} bevestigen? Vermeld bij facturatie het ` +
    `${soort === 'oa_contract' ? 'opdrachtnummer' : 'ordernummer'}, dan verwerken wij uw factuur vlot.\n\n` +
    `Met vriendelijke groet,`

  return { to: relatie?.email ?? '', onderwerp, bericht, heeftAdres: !!relatie?.email }
}

export type VerstuurBestellingResultaat =
  | { ok: true; bonnummer: string | null; bonAantal: number; bonWaarschuwing: string | null }
  | { ok: false; error: string }

type VerstuurInput = { to: string; cc?: string; onderwerp: string; bericht: string }

/**
 * Verstuur de order/het contract naar de leverancier: PDF genereren → mailen via Outlook →
 * afroepen (status + leverbon per regel) → verstuurd vastleggen → in SharePoint archiveren.
 */
export async function verstuurBestelling(
  dossierId: string,
  bestellingId: string,
  input: VerstuurInput,
): Promise<VerstuurBestellingResultaat> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any

  const { data: rij } = await db
    .from('werkbegroting_bestellingen')
    .select('id, soort, bouw7_contract_id, bouw7_nummer, bouw7_leverbon_id, verstuurd_op, relatie_id, betaalafspraak, levering_datum, levering_tekst, interne_notitie')
    .eq('id', bestellingId)
    .maybeSingle()
  if (!rij) return { ok: false, error: 'Bestelling niet gevonden.' }
  if (rij.bouw7_contract_id == null) return { ok: false, error: 'Maak de bestelling eerst aan in Bouw7.' }

  const soort = (rij.soort ?? 'inkooporder') as ContractSoort
  const medewerker = await getCurrentMedewerker()
  if (!medewerker) return { ok: false, error: 'Geen ingelogde medewerker gevonden om namens te versturen.' }
  const afzender = [medewerker.voornaam, medewerker.tussenvoegsel, medewerker.achternaam].filter(Boolean).join(' ').trim() || 'Everts'

  // Herstelpad: al gemaild, maar de afroep (leverbon) is toen mislukt → alleen die overdoen,
  // NIET opnieuw mailen (dubbelverzend voorkomen).
  if (rij.verstuurd_op != null) {
    if (rij.bouw7_leverbon_id != null) {
      return { ok: false, error: 'Deze bestelling is al verstuurd.' }
    }
    const afroep = await voerAfroepUit(db, bestellingId, soort, Number(rij.bouw7_contract_id), afzender)
    revalidatePath(`/dossiers/${dossierId}`)
    return { ok: true, bonnummer: afroep.bonnummer, bonAantal: afroep.bonAantal, bonWaarschuwing: afroep.fout }
  }

  const ontvangers = input.to.split(/[;,]/).map(s => s.trim()).filter(Boolean)
  if (ontvangers.length === 0) return { ok: false, error: 'Vul een e-mailadres van de leverancier in.' }

  // Contractinhoud uit Bouw7 lezen — dat is de bron van waarheid voor wat er op de PDF komt.
  const contract = await leesBouw7Contract(soort, Number(rij.bouw7_contract_id)).catch(() => null)
  if (!contract) return { ok: false, error: 'Kon het contract niet uit Bouw7 lezen.' }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const termijnen = (contract.contractTerms as any[] | undefined) ?? []
  const regels = termijnen.map(t => ({
    omschrijving: String(t.description ?? ''),
    aantal: String(t.amount ?? '1'),
    eenheid: String(t.unit ?? ''),
    stukprijs: Number(t.unitPrice ?? 0),
    bedrag: Number(t.subTotal ?? 0),
  }))
  const totaal = Number(contract.cost ?? regels.reduce((s, r) => s + r.bedrag, 0))

  // Leverancier + dossiergegevens voor de PDF.
  const { data: relatie } = rij.relatie_id
    ? await db.from('relaties').select('naam, adres_straat, adres_postcode, adres_plaats').eq('id', rij.relatie_id).maybeSingle()
    : { data: null }
  const { data: dossier } = await db
    .from('dossiers')
    .select('dossiernummer, titel, werkadres_straat, werkadres_huisnummer, werkadres_postcode, werkadres_plaats')
    .eq('id', dossierId)
    .maybeSingle()
  const werkadres = [
    [dossier?.werkadres_straat, dossier?.werkadres_huisnummer].filter(Boolean).join(' '),
    [dossier?.werkadres_postcode, dossier?.werkadres_plaats].filter(Boolean).join(' '),
  ].filter(Boolean).join(', ') || null

  // Briefpapier van de standaard offerte-layout (best-effort; geen briefpapier → eigen tekstkop).
  const { data: layout } = await db.from('quote_layouts').select('briefpapier_pdf_url').eq('is_standaard', true).maybeSingle()
  const { fetchBriefpapier } = await import('@/lib/everts-calc/briefpapier')
  const briefpapier = await fetchBriefpapier(layout?.briefpapier_pdf_url ?? null)

  const nu = new Date().toISOString()
  const { genereerBestellingPdf } = await import('@/lib/bouw7/bestelling-pdf')
  let pdf: Uint8Array
  try {
    pdf = await genereerBestellingPdf({
      soort: soort === 'oa_contract' ? 'oa_contract' : 'inkooporder',
      documentnummer: rij.bouw7_nummer ?? '',
      datum: nlDatum(nu),
      leverancier: {
        naam: relatie?.naam ?? '',
        adres: relatie?.adres_straat ?? null,
        postcodePlaats: [relatie?.adres_postcode, relatie?.adres_plaats].filter(Boolean).join(' ') || null,
      },
      project: { nummer: dossier?.dossiernummer ?? null, naam: dossier?.titel ?? null, werkadres },
      regels,
      totaal,
      isWinkel: false,
      leverdatum: rij.levering_datum ? nlDatum(rij.levering_datum) : (rij.levering_tekst ?? null),
      betaalafspraak: rij.betaalafspraak ?? null,
      notitie: rij.interne_notitie ?? null,
      afzender,
    }, briefpapier)
  } catch (e) {
    return { ok: false, error: `Kon de order-PDF niet maken: ${e instanceof Error ? e.message : 'onbekende fout'}` }
  }

  const bestandsnaam = `${soort === 'oa_contract' ? 'Opdracht' : 'Inkooporder'} ${rij.bouw7_nummer ?? ''}`.trim().replace(/[\\/:*?"<>|#%]/g, '-') + '.pdf'
  // Opmaak van de mail: alinea's + een gegevensblok met dezelfde kern als de PDF. Outlook
  // negeert `white-space:pre-wrap`, dus regeleinden moeten als echte <p>/<br> in de HTML.
  const { bouwBestellingMailHtml } = await import('@/lib/bouw7/bestelling-mail')
  const bodyHtml = bouwBestellingMailHtml({
    soort: soort === 'oa_contract' ? 'oa_contract' : 'inkooporder',
    bericht: input.bericht,
    nummer: rij.bouw7_nummer ?? null,
    project: [dossier?.dossiernummer, dossier?.titel].filter(Boolean).join(' — ') || null,
    werkadres,
    leverdatum: rij.levering_datum ? nlDatum(rij.levering_datum) : (rij.levering_tekst ?? null),
    betaalafspraak: rij.betaalafspraak ?? null,
    totaal,
  })

  // Mailen via Outlook namens de medewerker. Pas ná succes gaan we verder.
  try {
    const { verstuurMailNamensMedewerker } = await import('@/lib/o365/mail')
    await verstuurMailNamensMedewerker(medewerker.id, {
      to: ontvangers,
      cc: (input.cc ?? '').split(/[;,]/).map(s => s.trim()).filter(Boolean),
      subject: input.onderwerp || bestandsnaam.replace(/\.pdf$/, ''),
      bodyHtml,
      attachments: [{ naam: bestandsnaam, contentType: 'application/pdf', inhoud: pdf }],
    })
  } catch (e) {
    return { ok: false, error: `Mail versturen mislukt: ${e instanceof Error ? e.message : 'onbekende fout'}` }
  }

  // Mail is uit → vastleggen als verstuurd (dubbelverzend geblokkeerd), en pas nu afroepen.
  await db.from('werkbegroting_bestellingen')
    .update({ verstuurd_op: nu, verstuurd_door: medewerker.id, verstuurd_naar: ontvangers.join(', '), status: 'verzonden' })
    .eq('id', bestellingId)

  const afroep = await voerAfroepUit(db, bestellingId, soort, Number(rij.bouw7_contract_id), afzender)

  // Archiveren in SharePoint — best-effort, mag het versturen niet laten falen.
  try {
    const { uploadBuffersNaarDossierMap } = await import('@/lib/o365/dossier-map')
    await uploadBuffersNaarDossierMap(dossierId, [{ naam: bestandsnaam, contentType: 'application/pdf', bytes: pdf }])
  } catch { /* stil */ }

  revalidatePath(`/dossiers/${dossierId}`)
  return { ok: true, bonnummer: afroep.bonnummer, bonAantal: afroep.bonAantal, bonWaarschuwing: afroep.fout }
}
