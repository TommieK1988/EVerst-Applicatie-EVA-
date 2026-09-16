import 'server-only'
import { createAdminClient } from '@everts/database/server'
import { haalAlleRijen } from '@/lib/supabase/paginate'

/**
 * Houdt de bewakingskaart gelijk met de actielijst van het dossier.
 *
 * ── WAAROM DIT BESTAAT ────────────────────────────────────────────────────────
 * Bij livegang toonde de bewaking 82 van de 194 open offertes als "nog niet beoordeeld",
 * terwijl daar een openstaande actie stond met een deadline en een toegewezen collega — en in
 * 71 gevallen was die deadline al verstreken. De kaart keek alleen naar `commercie_bewaking`,
 * en die tabel was nieuw en dus leeg. Daarmee werd de lege staat van een nieuwe tabel als
 * waarheid gepresenteerd terwijl het antwoord al in `tasks` stond.
 *
 * ── WELKE ACTIE TELT ──────────────────────────────────────────────────────────
 * Elke openstaande actie mét deadline op een dossier in de offertefase. Bewust géén filter op
 * de titel: van de 132 openstaande acties op open offertes bleek er geen één operationeel — het
 * zijn nabel-, aanpas- en belafspraken. Een filter op 'offerte nabellen%' liet er vijf vallen
 * die wél commercieel waren ("Raymond Arends bellen", "Offerte aanpassen na afkeuring").
 *
 * Mocht er ooit tóch operationeel werk in de offertefase opduiken, dan is de schade beperkt:
 * de kaart toont dat de stap uit de actielijst komt (`stap_bron = 'actie'`), dus hij doet zich
 * niet voor als een commerciële beslissing. Zodra iemand een uitkomst vastlegt wordt de stap
 * 'handmatig' en blijft hij daarna met rust.
 *
 * ── IDEMPOTENT ────────────────────────────────────────────────────────────────
 * Vaker draaien verandert niets aan het resultaat. Daarom kan dit zowel als eenmalige
 * inhaalslag als vanuit de cron en na het aanmaken van een actie draaien.
 */

export type NabelSyncResultaat = {
  bekeken: number
  gezet: number
  bijgewerkt: number
  leeggemaakt: number
  overgeslagenHandmatig: number
  zonderActiehouder: number
}

type DossierRij = {
  id: string
  calculator_id: string | null
  project_manager_id: string | null
}

type TaakRij = {
  id: string
  titel: string
  deadline: string | null
  dossier_id: string | null
  lijst_id: string | null
  task_assignees: { user_id: string }[] | null
}

type KaartRij = {
  id: string
  dossier_id: string | null
  stap_soort: string | null
  stap_bron: string | null
  taak_id: string | null
  stap_datum: string | null
  stap_tekst: string | null
  actiehouder_id: string | null
  eigenaar_id: string | null
}

/** In blokken; een `.in()` over honderden uuid's wordt een URL die PostgREST weigert. */
const BLOK = 150

function blokken<T>(lijst: T[]): T[][] {
  const uit: T[][] = []
  for (let i = 0; i < lijst.length; i += BLOK) uit.push(lijst.slice(i, i + BLOK))
  return uit
}

export async function synchroniseerBewakingUitActies(
  opts?: { dossierIds?: string[] },
): Promise<NabelSyncResultaat> {
  const res: NabelSyncResultaat = {
    bekeken: 0, gezet: 0, bijgewerkt: 0, leeggemaakt: 0,
    overgeslagenHandmatig: 0, zonderActiehouder: 0,
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any

  // ── 1. De dossiers in de offertefase ────────────────────────────────────────
  const dossiers: DossierRij[] = await haalAlleRijen<DossierRij>((van, tot) => {
    let q = supabase.from('dossiers')
      .select('id, calculator_id, project_manager_id')
      .eq('hoofdstatus', 'offerte')
      .or('offerte_substatus.is.null,offerte_substatus.not.in.(verloren,vervallen)')
      .or('gearchiveerd.is.null,gearchiveerd.eq.false')
    if (opts?.dossierIds?.length) q = q.in('id', opts.dossierIds)
    return q.order('id').range(van, tot)
  })
  if (dossiers.length === 0) return res
  res.bekeken = dossiers.length

  const dossierIds = dossiers.map(d => d.id)
  const dossierPerId = new Map(dossiers.map(d => [d.id, d]))

  // ── 2. Actielijsten van die dossiers (het tweede koppelpad naar een taak) ───
  const lijstNaarDossier = new Map<string, string>()
  for (const blok of blokken(dossierIds)) {
    const { data } = await supabase.from('task_lists').select('id, dossier_id').in('dossier_id', blok)
    for (const l of (data ?? []) as { id: string; dossier_id: string }[]) {
      lijstNaarDossier.set(l.id, l.dossier_id)
    }
  }

  // ── 3. Openstaande acties met een deadline ──────────────────────────────────
  // Twee losse queries in plaats van één `.or()`: een taak hangt óf direct aan het dossier,
  // óf via een actielijst. Samengevoegd in één `.or()` wordt dat een onleesbaar filter dat bij
  // honderden ids ook nog eens over de URL-grens gaat.
  const taken: TaakRij[] = []
  const selectTaak = 'id,titel,deadline,dossier_id,lijst_id,task_assignees(user_id)'

  for (const blok of blokken(dossierIds)) {
    const { data } = await supabase.from('tasks').select(selectTaak)
      .in('dossier_id', blok)
      .not('deadline', 'is', null)
      .is('parent_task_id', null)
      .not('status', 'in', '("gereed","vervallen")')
    taken.push(...((data ?? []) as TaakRij[]))
  }
  const lijstIds = [...lijstNaarDossier.keys()]
  for (const blok of blokken(lijstIds)) {
    const { data } = await supabase.from('tasks').select(selectTaak)
      .in('lijst_id', blok)
      .not('deadline', 'is', null)
      .is('parent_task_id', null)
      .not('status', 'in', '("gereed","vervallen")')
    taken.push(...((data ?? []) as TaakRij[]))
  }

  /** Per dossier de meest urgente openstaande actie (vroegste deadline). */
  const actiePerDossier = new Map<string, TaakRij>()
  for (const t of taken) {
    const dossierId = t.dossier_id ?? (t.lijst_id ? lijstNaarDossier.get(t.lijst_id) : null)
    if (!dossierId || !dossierPerId.has(dossierId) || !t.deadline) continue
    const huidig = actiePerDossier.get(dossierId)
    if (!huidig || (huidig.deadline ?? '') > t.deadline) actiePerDossier.set(dossierId, t)
  }

  // ── 4. auth_user_id → medewerker ────────────────────────────────────────────
  // `task_assignees.user_id` is een auth-gebruiker; `commercie_bewaking.actiehouder_id`
  // verwijst naar `medewerkers`. Zonder deze vertaling valt elke actiehouder weg.
  const authIds = [...new Set(taken.flatMap(t => (t.task_assignees ?? []).map(a => a.user_id)))]
  const authNaarMedewerker = new Map<string, string>()
  for (const blok of blokken(authIds)) {
    const { data } = await supabase.from('medewerkers').select('id, auth_user_id').in('auth_user_id', blok)
    for (const m of (data ?? []) as { id: string; auth_user_id: string }[]) {
      authNaarMedewerker.set(m.auth_user_id, m.id)
    }
  }

  // ── 5. Bestaande kaarten ────────────────────────────────────────────────────
  const kaarten = new Map<string, KaartRij>()
  for (const blok of blokken(dossierIds)) {
    const { data } = await supabase.from('commercie_bewaking')
      .select('id,dossier_id,stap_soort,stap_bron,taak_id,stap_datum,stap_tekst,actiehouder_id,eigenaar_id')
      .in('dossier_id', blok)
    for (const k of (data ?? []) as KaartRij[]) if (k.dossier_id) kaarten.set(k.dossier_id, k)
  }

  // ── 6. Per dossier bepalen ──────────────────────────────────────────────────
  for (const dossier of dossiers) {
    const kaart = kaarten.get(dossier.id)
    const actie = actiePerDossier.get(dossier.id)

    // Een menselijke beslissing wint altijd. Wie een uitkomst heeft vastgelegd, wil niet dat
    // een openstaande taak die stap de volgende ochtend weer overschrijft.
    if (kaart?.stap_soort && kaart.stap_bron !== 'actie') {
      res.overgeslagenHandmatig++
      continue
    }

    // Geen actie meer (afgevinkt of vervallen): de afgeleide stap moet weg, anders blijft de
    // kaart een afspraak tonen die niemand meer heeft staan.
    if (!actie) {
      if (kaart?.stap_soort && kaart.stap_bron === 'actie') {
        await supabase.from('commercie_bewaking').update({
          stap_soort: null, stap_tekst: null, stap_datum: null, wacht_op: null,
          taak_id: null, stap_bron: 'handmatig',
        }).eq('id', kaart.id)
        res.leeggemaakt++
      }
      continue
    }

    // Actiehouder: de toegewezen collega, anders de calculator, anders de projectleider.
    // Zonder iemand kan de stap niet worden vastgelegd — de database eist een houder, en een
    // stap zonder houder is precies het soort afspraak dat blijft liggen.
    const authId = (actie.task_assignees ?? [])[0]?.user_id
    const actiehouder =
      (authId ? authNaarMedewerker.get(authId) : null)
      ?? dossier.calculator_id
      ?? dossier.project_manager_id
      ?? null
    if (!actiehouder) { res.zonderActiehouder++; continue }

    const velden = {
      stap_soort: 'actie' as const,
      stap_tekst: actie.titel,
      stap_datum: actie.deadline!.slice(0, 10),
      wacht_op: null,
      actiehouder_id: actiehouder,
      taak_id: actie.id,
      stap_bron: 'actie' as const,
      // Eigenaar niet overschrijven; wel invullen als hij nog leeg is.
      ...(kaart?.eigenaar_id ? {} : { eigenaar_id: dossier.calculator_id ?? actiehouder }),
    }

    if (!kaart) {
      await supabase.from('commercie_bewaking').insert({ dossier_id: dossier.id, soort: 'offerte', ...velden })
      res.gezet++
      continue
    }

    const ongewijzigd =
      kaart.taak_id === actie.id
      && kaart.stap_datum === velden.stap_datum
      && kaart.stap_tekst === velden.stap_tekst
      && kaart.actiehouder_id === actiehouder
    if (ongewijzigd) continue

    await supabase.from('commercie_bewaking').update(velden).eq('id', kaart.id)
    if (kaart.stap_soort) res.bijgewerkt++
    else res.gezet++
  }

  return res
}
