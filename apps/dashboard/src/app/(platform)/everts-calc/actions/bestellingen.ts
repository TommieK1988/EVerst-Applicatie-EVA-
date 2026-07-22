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
  schrijfBouw7Contract, verwijderBouw7Contract, verwijderBouw7Leverbon,
  zetBouw7ContractStatus, roepBouw7ContractAf, getAfroepStatusId, PURCHASE_TYPE,
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
): Promise<{ bonnummer: string | null; fout: string | null }> {
  let bonId: number | null = null
  let bonnummer: string | null = null
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
      if (afroep.ok) { bonId = afroep.bonId; bonnummer = afroep.bonnummer }
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

  return { bonnummer, fout }
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
  | {
      ok: true; contractId: number; nummer: string | null; soort: ContractSoort
      /** Leverbon die Bouw7 bij het afroepen aanmaakte, bv. "20261.00357OA002B001". */
      bonnummer: string | null
      /** Contract staat er, maar de leverbon is niet gelukt — de factuur kan dan niet matchen. */
      bonWaarschuwing: string | null
    }
  | { ok: false; reden: 'niet_goedgekeurd' | 'verouderd' | 'fout'; error: string; regels?: string[] }

/**
 * Zet een bestelling klaar én maak (of werk bij) het bijbehorende Bouw7-document.
 *
 * Eén action voor beide gevallen — een voorstel dat de gebruiker accepteert en een handmatig
 * samengestelde bestelling — zodat er maar één plek is waar de poortwachters draaien.
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

  const signee = await bepaalSignee()

  // Een verstuurde order is definitief: er hangt een leverbon aan en Bouw7 kan er kosten op
  // boeken. Wijzigen gaat via een nieuwe bestelregel + nieuwe goedkeuring, niet door dit
  // document te overschrijven.
  const { data: rij } = await db
    .from('werkbegroting_bestellingen')
    .select('bouw7_contract_id, bouw7_leverbon_id')
    .eq('id', bestelling.id)
    .maybeSingle()
  const bestaandContractId: number | null = rij?.bouw7_contract_id ?? null
  const bestaandeBonId: number | null = rij?.bouw7_leverbon_id ?? null

  if (bestaandContractId != null && bestaandeBonId != null) {
    return {
      ok: false, reden: 'fout',
      error: 'Deze bestelling staat al in Bouw7 en kan niet meer gewijzigd worden. Maak een nieuwe bestelregel aan en laat die opnieuw accorderen.',
    }
  }

  // Herstelpad: het contract is er wel, maar de afroep (en dus de leverbon) is eerder mislukt.
  // Alleen die stap opnieuw doen — géén tweede contract aanmaken.
  if (bestaandContractId != null) {
    const { data: bestaand } = await db
      .from('werkbegroting_bestellingen')
      .select('soort, bouw7_nummer')
      .eq('id', bestelling.id)
      .maybeSingle()
    const soortBestaand = (bestaand?.soort ?? 'inkooporder') as ContractSoort
    const afroep = await voerAfroepUit(db, bestelling.id, soortBestaand, bestaandContractId, signee)
    revalidatePath(`/dossiers/${dossierId}`)
    return {
      ok: true, contractId: bestaandContractId, nummer: bestaand?.bouw7_nummer ?? null,
      soort: soortBestaand, bonnummer: afroep.bonnummer, bonWaarschuwing: afroep.fout,
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

  // Contract staat er. Vanaf hier is het contract-id het belangrijkste dat EVA moet onthouden:
  // gaat de afroep hierna mis, dan mag een volgende poging géén tweede contract maken.
  await db.from('werkbegroting_bestellingen')
    .update({
      soort,
      status: 'verzonden',
      verzonden_op: nu,
      bouw7_contract_id: res.contractId,
      bouw7_nummer: res.nummer,
      bouw7_sync_status: 'ok',
      bouw7_sync_fout: null,
      bouw7_gesynct_op: nu,
    })
    .eq('id', bestelling.id)

  const afroep = await voerAfroepUit(db, bestelling.id, soort, res.contractId, signee)

  revalidatePath(`/dossiers/${dossierId}`)
  return {
    ok: true, contractId: res.contractId, nummer: res.nummer, soort,
    bonnummer: afroep.bonnummer, bonWaarschuwing: afroep.fout,
  }
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
    .select('id, soort, bouw7_contract_id, bouw7_leverbon_id, bouw7_bonnummer, bouw7_afroep_op, relatie_id')
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

  // Eerst de leverbon: die draagt de kosten en zou anders als losse post op de bewakingscode
  // blijven staan zonder order erbij. Zit er al een inkoopfactuur op, dan weigert Bouw7 het
  // verwijderen — dan stoppen we hier en laten we het contract met rust.
  if (rij.bouw7_leverbon_id != null) {
    const datum = (rij.bouw7_afroep_op ?? new Date().toISOString()).slice(0, 10)
    const bonRes = await verwijderBouw7Leverbon(Number(rij.bouw7_leverbon_id), {
      bonnummer: rij.bouw7_bonnummer ?? '',
      datum,
    })
    if (!bonRes.ok) {
      return {
        ok: false,
        error: `De leverbon kan niet verwijderd worden (${bonRes.error}). Zit er al een inkoopfactuur op, dan moet dit in Bouw7 worden afgehandeld.`,
      }
    }
  }

  const res = await verwijderBouw7Contract(
    (rij.soort ?? 'inkooporder') as ContractSoort,
    Number(rij.bouw7_contract_id),
    { projectId, relatieBouw7Id, bedrag: '0.00' },
  )
  if (!res.ok) return { ok: false, error: res.error }

  await db.from('werkbegroting_bestellingen')
    .update({
      status: 'concept', verzonden_op: null,
      bouw7_contract_id: null, bouw7_nummer: null,
      bouw7_leverbon_id: null, bouw7_bonnummer: null, bouw7_afroep_op: null,
      bouw7_sync_status: null, bouw7_sync_fout: null,
      bouw7_gesynct_op: new Date().toISOString(),
    })
    .eq('id', bestellingId)

  revalidatePath(`/dossiers/${dossierId}`)
  return { ok: true }
}
