'use server'

import { createAdminClient } from '@everts/database/server'
import { getBouw7Client, logSync, type SyncResult, type SyncMode } from './sync'
import { fingerprint } from './fingerprint'
import { isActiefDossier, type DossierActiefVelden } from '@/lib/dossiers/actief'
import type { Bouw7Client, Bouw7PlanItem, Bouw7PlanItemDetail, Bouw7PlanItemEmployee } from './client'

// De gegenereerde Supabase-types lopen achter op de nieuwe bron/bouw7_id-kolommen;
// admin-client als any zoals elders in de planning-module.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

const ALGEMEEN_KEY = 'chapter:algemeen'

/** "2026-02-23 07:00:00" → "2026-02-23" (date-kolom). */
function toDate(dt?: string | null): string | null {
  if (!dt) return null
  return dt.slice(0, 10)
}

/**
 * Offset-suffix (bv. "+02:00") voor Europe/Amsterdam op de gegeven datum, zomertijd-bewust.
 * Bepaald via Intl zodat het klopt ongeacht de servertijdzone (Vercel = UTC, lokaal = NL).
 */
function nlOffsetSuffix(y: number, m: number, d: number): string {
  const utcNoon = new Date(Date.UTC(y, m - 1, d, 12))
  const naam = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Amsterdam', timeZoneName: 'longOffset' })
    .formatToParts(utcNoon)
    .find(p => p.type === 'timeZoneName')?.value // "GMT+02:00"
  const offset = naam?.replace('GMT', '')
  return offset && offset.length > 0 ? offset : '+01:00'
}

/**
 * "2026-02-23 07:00:00" → "2026-02-23T07:00:00+01:00" (timestamptz-kolom).
 * Bouw7-tijden zijn Nederlandse kloktijden zónder tijdzone-aanduiding. Zonder expliciete offset
 * interpreteert Postgres (UTC op Supabase) ze als UTC, waardoor alles in de UI 1–2 uur opschoof
 * ("werkdag start om 02:00"). De NL-offset verankeren houdt 07:00 NL ook echt 07:00 NL.
 */
function toTimestamp(dt?: string | null): string | null {
  if (!dt) return null
  const datum = dt.slice(0, 10)
  const tijd  = dt.slice(11, 19) || '00:00:00'
  const [y, m, d] = datum.split('-').map(Number)
  return `${datum}T${tijd}${nlOffsetSuffix(y, m, d)}`
}

/**
 * Bouw7-einddatums van (hele-dag-)plan-items zijn **dag-inclusief**: een eendaags item heeft
 * start == eind (beide 00:00:00), en een item 18→20 mei met 24 uur beslaat 3 dagen (18+19+20).
 * EVA's planning_items gebruiken een exclusieve eindtijd ([start, eind), constraint eind > start).
 * Hele-dag-einddatums (tijd 00:00:00) krijgen daarom +1 dag; echte eindtijden blijven staan.
 * Zonder deze correctie faalden eendaagse items op de tijdvolgorde-constraint (en ontbraken ze
 * geruisloos in EVA) en waren meerdaagse items één dag te kort.
 */
function eindExclusief(dt?: string | null): string | null {
  if (!dt) return null
  const tijd = dt.slice(11, 19)
  if (tijd && tijd !== '00:00:00') return toTimestamp(dt)
  const [y, m, d] = dt.slice(0, 10).split('-').map(Number)
  const volgende = new Date(Date.UTC(y, m - 1, d + 1))
  const [ny, nm, nd] = volgende.toISOString().slice(0, 10).split('-').map(Number)
  return `${volgende.toISOString().slice(0, 10)}T00:00:00${nlOffsetSuffix(ny, nm, nd)}`
}

/** Vandaag als NL-datum ("YYYY-MM-DD"), servertijdzone-onafhankelijk (en-CA = ISO-datum). */
function nlVandaag(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam' }).format(new Date())
}

/** Standaard werkdag-tijden als een medewerker (nog) geen rooster heeft. */
const DEFAULT_DAGSTART = '07:00:00'
const DEFAULT_DAGEIND  = '16:00:00'

/**
 * Hele-dag-plan-item: Bouw7 zet start én eind op 00:00:00 (of `isAllDay`). Alleen deze items
 * krijgen roostertijden; items met een echte kloktijd (07:00 e.d.) blijven ongemoeid.
 */
function isHeleDag(pi: Bouw7PlanItem): boolean {
  if (pi.isAllDay) return true
  const st = (pi.startDate ?? '').slice(11, 19)
  const et = (pi.endDate ?? '').slice(11, 19)
  return (!st || st === '00:00:00') && (!et || et === '00:00:00')
}

/** Plan-items van één Bouw7-project (alle pagina's, via Apollo-search). */
export async function fetchPlanItems(projectId: string, client?: Bouw7Client): Promise<Bouw7PlanItem[]> {
  const c = client ?? (await getBouw7Client())
  return c.getApolloAll<Bouw7PlanItem>('/search/plan-items', `project.id = ${projectId}`)
}

/** Aantal plan-item-details dat tegelijk wordt opgehaald. */
const DETAIL_BATCH = 10

/**
 * Haal per plan-item het Heimdall-detail (`/plan-item/{id}`) op — de enige plek waar de
 * toegewezen `employees[]` staan; de Apollo-search levert die niet. Gebatcht (Promise.allSettled),
 * net als de Athena-/offerte-calls in syncProjects. Geeft een map plan-item-id → detail plus het
 * aantal mislukte calls, zodat de aanroeper een rebuild op onvolledige data kan afbreken
 * (anders zouden toewijzingen stilletjes verdwijnen bij een haperende API).
 */
export async function fetchPlanItemDetails(
  ids: number[],
  client: Bouw7Client,
): Promise<{ map: Map<number, Bouw7PlanItemDetail>; mislukt: number }> {
  const map = new Map<number, Bouw7PlanItemDetail>()
  const gefaald: number[] = []
  for (let i = 0; i < ids.length; i += DETAIL_BATCH) {
    const batch = ids.slice(i, i + DETAIL_BATCH)
    const results = await Promise.allSettled(
      batch.map(id => client.get<Bouw7PlanItemDetail>(`/plan-item/${id}`)),
    )
    results.forEach((r, j) => {
      if (r.status === 'fulfilled' && r.value) map.set(batch[j], r.value)
      else gefaald.push(batch[j])
    })
  }
  // Eén rustige (sequentiële) herkansing — vangt throttling door de parallelle batches.
  let mislukt = 0
  for (const id of gefaald) {
    try {
      const det = await client.get<Bouw7PlanItemDetail>(`/plan-item/${id}`)
      if (det) map.set(id, det)
      else mislukt++
    } catch {
      mislukt++
    }
  }
  return { map, mislukt }
}

/** Een plan-item zonder bewakingscode + met dezelfde naam als het project = crewblok. */
function isCrewblok(pi: Bouw7PlanItem): boolean {
  return !pi.securityPlanningLink?.securityCode?.chapter?.id
}

/** Stabiele fase-sleutel (bouw7_id) per plan-item. */
function faseKeyVan(pi: Bouw7PlanItem): string {
  const chap = pi.securityPlanningLink?.securityCode?.chapter
  return chap?.id ? `chapter:${chap.id}` : ALGEMEEN_KEY
}

/**
 * Synchroniseer de Bouw7-planning (plan-items) van één dossier naar EVA.
 *
 * Mapping: bewakingscode-chapter → planning_fasen (Hoofdtaak), plan-item →
 * planning_activiteiten (Taak), toegewezen medewerkers (uit het detail-endpoint) →
 * planning_items (per medewerker).
 * Rijen met bron='bouw7' worden volledig herbouwd; bron='eva'-rijen blijven ongemoeid.
 */
export async function syncDossierPlanning(
  dossierId: string,
  opts?: { mode?: SyncMode; client?: Bouw7Client; planItems?: Bouw7PlanItem[]; silent?: boolean },
): Promise<SyncResult> {
  const mode: SyncMode = opts?.mode ?? 'incremental'
  const start = Date.now()
  const result: SyncResult = { nieuw: 0, bijgewerkt: 0, fouten: 0, overgeslagen: 0 }
  const supabase = db()

  try {
    const { data: dossier } = await supabase
      .from('dossiers')
      .select('id, bouw7_id, bouw7_planning_hash')
      .eq('id', dossierId)
      .single()

    const bouw7Id = dossier?.bouw7_id
    if (!bouw7Id) return result // dossier zonder Bouw7-koppeling → niets te syncen

    const client = opts?.client ?? (await getBouw7Client())
    const planItems = opts?.planItems ?? (await fetchPlanItems(String(bouw7Id), client))

    // Planning-fingerprint uit de goedkope Apollo-lijst (id/updatedAt/uren/datums/naam/chapter/remark).
    // Is die gelijk aan de opgeslagen hash → de dure /plan-item/{id} detail-calls + rebuild overslaan.
    // KANTTEKENING: de medewerker-TOEWIJZINGEN zitten alléén in het detail-endpoint en bumpen
    // updatedAt níet (geverifieerd tegen de live API — Apollo kent geen employees-veld). Een pure
    // toewijzingswissel is dus onzichtbaar voor deze hash; `req` (requisite, benodigd aantal) vangt
    // een deel. De dagelijkse cron in mode 'full' negeert de hash en herbouwt alles — daarmee zijn
    // toewijzingen maximaal één dag verouderd. Verwijder de hash-skip niet "voor de zekerheid":
    // dat zou elke incrementele run honderden detail-calls per dossier terugbrengen.
    const planningHash = fingerprint(
      planItems
        .map(pi => ({
          id:  pi.id,
          upd: pi.updatedAt ?? null,
          h:   pi.hours ?? null,
          s:   pi.startDate ?? null,
          e:   pi.endDate ?? null,
          nm:  pi.name ?? null,
          ch:  pi.securityPlanningLink?.securityCode?.chapter?.id ?? null,
          sc:  pi.securityPlanningLink?.securityCode?.id ?? null,
          rm:  pi.remark ?? null,
          dep: pi.department?.name ?? null,
          req: pi.requisite ?? null,
        }))
        .sort((a, b) => a.id - b.id),
    )
    if (mode !== 'full' && dossier.bouw7_planning_hash === planningHash) {
      result.overgeslagen = 1
      return result
    }

    // De toegewezen medewerkers staan alleen in het detail-endpoint, niet in de search-response.
    const { map: detailMap, mislukt: detailsMislukt } = await fetchPlanItemDetails(planItems.map(pi => pi.id), client)
    if (detailsMislukt > 0) {
      // Onvolledige details → rebuild afbreken en hash NIET opslaan; volgende run probeert opnieuw.
      // Doorgaan zou bestaande (correcte) planitems wissen zonder vervanging.
      result.fouten++
      result.foutMelding = `${detailsMislukt} plan-item-details niet opgehaald; rebuild overgeslagen`
      return result
    }
    const nu = new Date().toISOString()

    // ── 1. Fasen (Hoofdtaken) ────────────────────────────────────────
    // Verzamel benodigde fasen uit de bewakingscode-chapters; crewblokken → "Algemeen".
    const benodigdeFasen = new Map<string, { naam: string; volgorde: number }>()
    let volg = 0
    for (const pi of planItems) {
      const key = faseKeyVan(pi)
      if (benodigdeFasen.has(key)) continue
      if (key === ALGEMEEN_KEY) {
        benodigdeFasen.set(key, { naam: 'Algemeen', volgorde: 999 })
      } else {
        const chap = pi.securityPlanningLink!.securityCode!.chapter!
        benodigdeFasen.set(key, { naam: chap.name?.trim() || `Hoofdtaak ${chap.id}`, volgorde: volg++ })
      }
    }

    // Bestaande Bouw7-fasen van dit dossier ophalen.
    const { data: bestaandeFasen } = await supabase
      .from('planning_fasen')
      .select('id, bouw7_id, naam, volgorde')
      .eq('dossier_id', dossierId)
      .eq('bron', 'bouw7')

    const faseMap = new Map<string, string>() // bouw7_id → fase uuid
    for (const f of (bestaandeFasen ?? []) as { id: string; bouw7_id: string }[]) {
      faseMap.set(f.bouw7_id, f.id)
    }

    // Insert ontbrekende fasen, update naam/volgorde van bestaande.
    const nieuweFaseRows: Record<string, unknown>[] = []
    for (const [key, def] of benodigdeFasen) {
      if (faseMap.has(key)) {
        await supabase
          .from('planning_fasen')
          .update({ naam: def.naam, volgorde: def.volgorde, bouw7_laatst_sync: nu })
          .eq('id', faseMap.get(key))
      } else {
        nieuweFaseRows.push({
          dossier_id: dossierId,
          naam: def.naam,
          volgorde: def.volgorde,
          bron: 'bouw7',
          bouw7_id: key,
          bouw7_laatst_sync: nu,
        })
      }
    }
    if (nieuweFaseRows.length > 0) {
      const { data: ingevoegd } = await supabase
        .from('planning_fasen')
        .insert(nieuweFaseRows)
        .select('id, bouw7_id')
      for (const f of (ingevoegd ?? []) as { id: string; bouw7_id: string }[]) faseMap.set(f.bouw7_id, f.id)
    }

    // Stale Bouw7-fasen opruimen (chapters die niet meer voorkomen).
    const staleFaseIds = ((bestaandeFasen ?? []) as { id: string; bouw7_id: string }[])
      .filter(f => !benodigdeFasen.has(f.bouw7_id))
      .map(f => f.id)
    if (staleFaseIds.length > 0) {
      await supabase.from('planning_fasen').delete().in('id', staleFaseIds)
    }

    // ── 2. Medewerker-stubs voor toegewezen medewerkers ───────────────
    // De toewijzingen komen uit de plan-item-details (Apollo-search levert ze niet).
    const empMap = await resolveMedewerkers(supabase, [...detailMap.values()], nu)

    // Roosters van de toegewezen medewerkers ophalen. Toekomstige hele-dag-items krijgen
    // hun roostertijden (bv. 07:30–16:15) i.p.v. 00:00 — anders "start werkdag om middernacht".
    // Historische hele-dag-items blijven bewust op 00:00 (geen roostertijd terugprojecteren).
    const vandaagNL = nlVandaag()
    const medIds = [...new Set(empMap.values())]
    type RoosterVenster = { vanaf: string; tot: string | null; dagstart: string; dageind: string }
    const roosterPerMed = new Map<string, RoosterVenster[]>()
    if (medIds.length > 0) {
      const { data: roosterRows } = await supabase
        .from('medewerker_roosters')
        .select('medewerker_id, geldig_vanaf, geldig_tot, dagstart, dageind')
        .in('medewerker_id', medIds)
      for (const r of (roosterRows ?? []) as (RoosterVenster & { medewerker_id: string; geldig_vanaf: string; geldig_tot: string | null })[]) {
        const arr = roosterPerMed.get(r.medewerker_id) ?? []
        arr.push({ vanaf: r.geldig_vanaf, tot: r.geldig_tot, dagstart: r.dagstart, dageind: r.dageind })
        roosterPerMed.set(r.medewerker_id, arr)
      }
    }
    // Actieve roostertijden van een medewerker op een datum (laatst-ingegane venster wint).
    const roostertijden = (medId: string, datum: string): { start: string; eind: string } => {
      const actief = (roosterPerMed.get(medId) ?? [])
        .filter(r => r.vanaf <= datum && (r.tot === null || r.tot >= datum))
        .sort((a, b) => b.vanaf.localeCompare(a.vanaf))[0]
      return { start: actief?.dagstart ?? DEFAULT_DAGSTART, eind: actief?.dageind ?? DEFAULT_DAGEIND }
    }

    // ── 3. Activiteiten (Taken) volledig herbouwen ────────────────────
    // Bestaande Bouw7-activiteiten verwijderen → planning_items cascaden mee.
    await supabase
      .from('planning_activiteiten')
      .delete()
      .eq('dossier_id', dossierId)
      .eq('bron', 'bouw7')

    // Titel van een plan-item bepalen (crewblok → afdeling, anders naam).
    const titelVan = (pi: Bouw7PlanItem): string =>
      isCrewblok(pi)
        ? (pi.department?.name?.trim() || pi.name?.trim() || 'Planning')
        : (pi.name?.trim() || 'Taak')

    // Plan-items met dezelfde naam bínnen dezelfde fase samenvoegen tot één activiteit.
    // Zonder deze groepering wordt elk Bouw7 plan-item een aparte activiteit — wat bij
    // veel gelijknamige plan-items (elk met één medewerker/datum) een onbruikbaar lange
    // lijst oplevert. De onderliggende planitems houden hun eigen medewerker/datums/uren.
    type Groep = { faseKey: string; titel: string; items: Bouw7PlanItem[] }
    const groepen = new Map<string, Groep>()
    for (const pi of planItems) {
      const faseKey = faseKeyVan(pi)
      const titel = titelVan(pi)
      const key = `${faseKey}::${titel.toLowerCase()}`
      const g = groepen.get(key)
      if (g) g.items.push(pi)
      else groepen.set(key, { faseKey, titel, items: [pi] })
    }

    // Sorteer op vroegste start (dan titel) zodat de volgorde stabiel en chronologisch is.
    const vroegsteStart = (g: Groep): string =>
      g.items.map(pi => pi.startDate).filter(Boolean).sort()[0] ?? '￿'
    const gesorteerdeGroepen = [...groepen.values()].sort(
      (a, b) => vroegsteStart(a).localeCompare(vroegsteStart(b)) || a.titel.localeCompare(b.titel),
    )

    let activiteitVolg = 0
    for (const groep of gesorteerdeGroepen) {
      const { faseKey, titel, items } = groep
      const eerste = items[0]
      const crew = isCrewblok(eerste)

      // Datums spannen de hele groep; uren zijn de som over de plan-items.
      const starts = items.map(pi => pi.startDate).filter(Boolean).sort()
      const ends = items.map(pi => pi.endDate).filter(Boolean).sort()
      const gewensteStart = starts[0] ?? null
      const deadline = ends[ends.length - 1] ?? null
      const urenTotaal = items.reduce((sum, pi) => sum + (pi.hours ?? 0), 0)

      // Eerste niet-lege opmerking (search-veld `remark`, anders detail-`notes`).
      const remark =
        items.map(pi => (pi.remark ?? detailMap.get(pi.id)?.notes)?.trim() || null).find(Boolean) ?? null
      const omschrijving = crew ? (eerste.project?.name ?? remark) : remark

      // Bewakingscode uit het eerste plan-item (groep zit binnen één fase).
      const secCode = eerste.securityPlanningLink?.securityCode ?? null

      const { data: act, error: actErr } = await supabase
        .from('planning_activiteiten')
        .insert({
          dossier_id: dossierId,
          fase_id: faseMap.get(faseKey) ?? null,
          titel,
          omschrijving,
          bewakingscode: secCode?.code?.trim() || null,
          bouw7_security_code_id: secCode?.id ?? null,
          geschatte_uren: urenTotaal || null,
          gewenste_start: toDate(gewensteStart),
          deadline: toDate(deadline),
          status: 'gepland',
          volgorde: activiteitVolg++,
          bron: 'bouw7',
          bouw7_id: `group:${faseKey}:${titel.toLowerCase()}`,
          bouw7_laatst_sync: nu,
        })
        .select('id')
        .single()

      if (actErr || !act) {
        result.fouten++
        continue
      }
      result.nieuw++

      // ── 4. Planitems per plan-item × toegewezen medewerker ──────────
      // Elk planitem behoudt de eigen datums/uren van zijn plan-item.
      const itemRows: Record<string, unknown>[] = []
      for (const pi of items) {
        // Rijen die de CHECK/NOT NULL-constraints van planning_items zouden schenden
        // (start/eind niet null, eind_dt > start_dt, uren > 0) vooraf overslaan. Cruciaal
        // sinds de samenvoeging: alle medewerkers van één activiteit gaan in ÉÉN batch-insert,
        // en Postgres maakt die atomair — dus één ongeldige rij (bv. een plan-item zonder uren)
        // zou anders de hele batch laten mislukken en álle planitems van die activiteit wissen.
        const start = toTimestamp(pi.startDate)
        const eind = eindExclusief(pi.endDate)
        const uren = pi.hours ?? 0
        if (!start || !eind || eind <= start || uren <= 0) {
          result.overgeslagen = (result.overgeslagen ?? 0) + 1
          continue
        }
        // Toekomstig hele-dag-item → roostertijden (per medewerker, want roosters verschillen).
        const heleDagToekomst = isHeleDag(pi) && (pi.startDate?.slice(0, 10) ?? '') >= vandaagNL
        const emps = detailMap.get(pi.id)?.employees ?? []
        for (const emp of emps) {
          const medewerkerId = empMap.get(String(emp.id))
          if (!medewerkerId) {
            result.fouten++
            continue
          }
          let itemStart = start
          let itemEind = eind
          if (heleDagToekomst && pi.startDate && pi.endDate) {
            const { start: ds, eind: de } = roostertijden(medewerkerId, pi.startDate.slice(0, 10))
            const rs = toTimestamp(`${pi.startDate.slice(0, 10)} ${ds}`)
            const re = toTimestamp(`${pi.endDate.slice(0, 10)} ${de}`)
            // Alleen overnemen als het een geldig interval blijft (eind > start).
            if (rs && re && re > rs) { itemStart = rs; itemEind = re }
          }
          itemRows.push({
            activiteit_id: act.id,
            medewerker_id: medewerkerId,
            start_dt: itemStart,
            eind_dt: itemEind,
            uren,
            bron: 'bouw7',
            bouw7_id: `${pi.id}:${emp.id}`,
            bouw7_laatst_sync: nu,
          })
        }
      }
      if (itemRows.length > 0) {
        const { error: itemErr } = await supabase.from('planning_items').insert(itemRows)
        if (itemErr) {
          // Bv. FK-fout doordat een gelijktijdige sync de activiteit al wiste — telt als fout
          // zodat de hash hieronder niet wordt opgeslagen en de volgende run herstelt.
          result.fouten++
          result.foutMelding = itemErr.message
        }
      }
    }

    // Sla de nieuwe planning-fingerprint op zodat een volgende incrementele sync dit dossier
    // overslaat — maar alléén bij een foutloze rebuild. Bij fouten (bv. twee gelijktijdige syncs
    // die elkaars rijen wissen) blijft de oude hash staan, zodat de volgende run dit dossier
    // opnieuw opbouwt in plaats van een half leeggeraakte planning te bevriezen.
    if (result.fouten === 0) {
      await supabase.from('dossiers').update({ bouw7_planning_hash: planningHash }).eq('id', dossierId)
    }

    return result
  } catch (e: unknown) {
    result.fouten++
    result.foutMelding = e instanceof Error ? e.message : 'Planning-sync mislukt'
    return result
  } finally {
    // Bij bulk-sync (syncAllPlanning) logt de aanroeper een samenvatting; per-dossier loggen zou de
    // sync_log overspoelen. Een losse aanroep (ververs-knop) logt wél.
    if (!opts?.silent) await logSync('planning', 'in', result, Date.now() - start)
  }
}

/**
 * Zorg dat elke aan een plan-item toegewezen medewerker een EVA-record heeft.
 * Onbekende medewerkers krijgen een stub (zoals syncProjects voor rollen doet).
 * Geeft een map terug van Bouw7-employee-id → EVA medewerker-uuid.
 *
 * NB: de detail-employees gebruiken `firstName`/`lastName` (niet `givenName`/`familyName`).
 */
async function resolveMedewerkers(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  details: Bouw7PlanItemDetail[],
  nu: string,
): Promise<Map<string, string>> {
  const empMap = new Map<string, string>()
  const alleEmps = new Map<string, Bouw7PlanItemEmployee>()
  for (const det of details) {
    for (const emp of det.employees ?? []) {
      if (emp?.id) alleEmps.set(String(emp.id), emp)
    }
  }
  if (alleEmps.size === 0) return empMap

  const ids = [...alleEmps.keys()]
  const { data: bestaand } = await supabase
    .from('medewerkers')
    .select('id, bouw7_id')
    .in('bouw7_id', ids)
  for (const m of (bestaand ?? []) as { id: string; bouw7_id: string }[]) empMap.set(m.bouw7_id, m.id)

  const stubs = ids
    .filter(id => !empMap.has(id))
    .map(id => {
      const emp = alleEmps.get(id)!
      return {
        voornaam: emp.firstName ?? '',
        achternaam: emp.lastName ?? '',
        extern: false,
        actief: true,
        bouw7_id: id,
        bouw7_laatst_sync: nu,
        bouw7_sync_status: 'synced',
      }
    })
  if (stubs.length > 0) {
    // medewerkers heeft een volledige unique constraint op bouw7_id → upsert mag.
    await supabase.from('medewerkers').upsert(stubs, { onConflict: 'bouw7_id' })
    const { data: med2 } = await supabase
      .from('medewerkers')
      .select('id, bouw7_id')
      .in('bouw7_id', stubs.map(s => s.bouw7_id))
    for (const m of (med2 ?? []) as { id: string; bouw7_id: string }[]) empMap.set(m.bouw7_id, m.id)
  }
  return empMap
}

/**
 * Synchroniseer de planning van alle dossiers met een Bouw7-koppeling.
 * Bedoeld om mee te liften op de volledige sync (runFullSync).
 */
export async function syncAllPlanning(opts?: { mode?: SyncMode }): Promise<SyncResult> {
  const mode: SyncMode = opts?.mode ?? 'incremental'
  const start = Date.now()
  const totaal: SyncResult = { nieuw: 0, bijgewerkt: 0, fouten: 0, overgeslagen: 0 }
  const supabase = db()

  try {
    // Scope: planning bestaat in Bouw7 alleen voor dossiers in uitvoering. Aanvraag/offerte-dossiers
    // hebben geen plan-items, dus die slaan we volledig over (geen Apollo-call). Binnen de scope zorgt
    // de planning-hash dat ongewijzigde dossiers de dure detail-calls overslaan.
    // LET OP: 'servicedesk' is GEEN hoofdstatus-enumwaarde (alleen aanvraag/offerte/opdracht) —
    // servicedesk = Bouw7-status "LB.*" of categorie Dagelijks onderhoud/Mutatie, zoals
    // getDossiersVoorServicedesk. De oude `.in('hoofdstatus', [...,'servicedesk'])` gaf een stille
    // enum-fout waardoor deze bulk-sync maandenlang níets synchroniseerde.
    // Afgeronde dossiers (opdracht financieel_afgesloten, servicedesk financieel_gereed, gearchiveerd)
    // filteren we hieronder met isActiefDossier — hun planning wijzigt niet meer, dus de Apollo-/detail-
    // calls zijn verspild. De statusvelden halen we mee zodat die canonieke helper kan beslissen.
    const { data: dossiers, error: dossierErr } = await supabase
      .from('dossiers')
      .select('id, hoofdstatus, aanvraag_substatus, offerte_substatus, opdracht_substatus, servicedesk_substatus, gearchiveerd')
      .not('bouw7_id', 'is', null)
      .or('hoofdstatus.eq.opdracht,bouw7_projectstatus_naam.ilike.LB.%,bouw7_categorie_naam.in.(Dagelijks onderhoud,Mutatie)')

    // Een query-fout mag nooit meer stil tot "0 dossiers" leiden.
    if (dossierErr) {
      totaal.fouten++
      totaal.foutMelding = `Dossier-scope query mislukt: ${dossierErr.message}`
      return totaal
    }

    // Eén gedeelde client → niet per dossier opnieuw inloggen bij Bouw7.
    const client = await getBouw7Client()

    const meldingen: string[] = []
    for (const d of (dossiers ?? []) as (DossierActiefVelden & { id: string })[]) {
      // Afgesloten/vervallen/gearchiveerd → planning is bevroren, sla over (geen Bouw7-calls).
      if (!isActiefDossier(d)) {
        totaal.overgeslagen = (totaal.overgeslagen ?? 0) + 1
        continue
      }
      const r = await syncDossierPlanning(d.id, { mode, client, silent: true })
      totaal.nieuw += r.nieuw
      totaal.bijgewerkt += r.bijgewerkt
      totaal.fouten += r.fouten
      totaal.overgeslagen = (totaal.overgeslagen ?? 0) + (r.overgeslagen ?? 0)
      // Eerste paar per-dossier foutmeldingen bewaren voor de samenvattende sync_log-regel,
      // anders is "115 fouten" achteraf niet te herleiden.
      if (r.fouten > 0 && r.foutMelding && meldingen.length < 3) {
        meldingen.push(`${d.id.slice(0, 8)}: ${r.foutMelding}`)
      }
    }
    if (meldingen.length > 0) totaal.foutMelding = meldingen.join(' | ')
    return totaal
  } catch (e: unknown) {
    totaal.fouten++
    totaal.foutMelding = e instanceof Error ? e.message : 'Planning-bulk-sync mislukt'
    return totaal
  } finally {
    // Per-dossier sync is stil; hier één samenvattende regel.
    await logSync('planning', 'in', totaal, Date.now() - start)
  }
}
