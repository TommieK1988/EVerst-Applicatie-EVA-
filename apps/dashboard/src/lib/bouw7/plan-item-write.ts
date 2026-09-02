'use server'

/**
 * EVA-planning terugschrijven naar Bouw7 (`POST/DELETE /plan-item` op Heimdall).
 *
 * Zie WRITE-ENDPOINTS.md §5b voor de gecaptureerde endpoints en de uitgevraagde
 * schemavalidatie. Kort:
 *   - `POST /plan-item` zonder `id` → aanmaken (201), mét `id` → wijzigen (200)
 *   - `DELETE /plan-item` met `{ id }` in de **body** (niet in de URL)
 *
 * MAPPING — bewust één EVA-planitem = één Bouw7 plan-item met één medewerker.
 * Bouw7 kan meerdere medewerkers in één item (`employees[]`), en zijn eigen UI maakt ze
 * ook zo. Toch spiegelen we 1-op-1: een EVA-planitem is per medewerker gepland en kan per
 * medewerker verschuiven, gekopieerd en verwijderd worden. Zouden we groeperen, dan moet
 * elke verplaatsing van één medewerker de groep splitsen en elke verwijdering de rest
 * herschrijven — precies het soort operatie dat bij gelijktijdige wijzigingen stil data
 * wist. De prijs is cosmetisch: drie collega's op dezelfde dag geven in Bouw7 drie balken
 * in plaats van één met drie namen; in de medewerkerplanning ziet dat er hetzelfde uit.
 *
 * FAIL-SOFT: een mislukte write laat de EVA-planning ongemoeid staan en logt alleen. De
 * planning is in EVA leidend; Bouw7 loopt dan één wijziging achter tot de volgende write.
 */

import { createAdminClient } from '@everts/database/server'
import { getBouw7ClientOfNull } from './config'
import type { Bouw7Client } from './client'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

/** Offset-suffix ("+02:00") voor Europe/Amsterdam, zomertijd-bewust — zie sync-planning.ts. */
function nlOffsetSuffix(d: Date): string {
  const naam = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Amsterdam', timeZoneName: 'longOffset' })
    .formatToParts(d)
    .find(p => p.type === 'timeZoneName')?.value // "GMT+02:00"
  const offset = naam?.replace('GMT', '')
  return offset && offset.length > 0 ? offset : '+01:00'
}

/**
 * Postgres-timestamptz naar ISO8601 mét expliciete tijdzone, in Nederlandse kloktijd.
 *
 * Heimdall weigert "2026-09-10 07:00:00" (de vorm die de Bouw7-UI-endpoints en de
 * Apollo-search juist wél gebruiken) met "This value is not a valid datetime", en
 * epoch-seconden ook. Een offset is verplicht. We schrijven NL-kloktijd omdat Bouw7 de
 * planning daarin toont; het blijft hetzelfde moment.
 */
function naarBouw7Datum(ts: string): string {
  const d = new Date(ts)
  const delen = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Amsterdam',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(d)
  const g = (t: string) => delen.find(p => p.type === t)?.value ?? '00'
  // en-CA levert 24-uurs "24" voor middernacht; Bouw7 wil "00".
  const uur = g('hour') === '24' ? '00' : g('hour')
  return `${g('year')}-${g('month')}-${g('day')}T${uur}:${g('minute')}:${g('second')}${nlOffsetSuffix(d)}`
}

/** Het EVA-planitem met alles wat de Bouw7-body nodig heeft. */
type ItemContext = {
  itemId:         string
  bouw7Id:        number | null
  projectId:      number
  employeeId:     number
  titel:          string
  omschrijving:   string | null
  startDate:      string
  endDate:        string
  hours:          number
  securityCodeId: number | null
  /** Naam van de projectleider van het dossier — bepaalt de kleur van de balk in Bouw7. */
  projectleider:  { voornaam: string | null; volledigeNaam: string } | null
}

/**
 * Haal één planitem op met dossier-, medewerker- en activiteitgegevens. Geeft `null` als
 * het item niet terugschrijfbaar is: geen Bouw7-dossier, geen Bouw7-medewerker, of een rij
 * die uit Bouw7 zelf komt (`bron='bouw7'` schrijven we nooit terug — dan zouden lees- en
 * schrijfsync elkaar aan het werk houden).
 */
async function laadContext(itemId: string): Promise<ItemContext | null> {
  const { data } = await db()
    .from('planning_items')
    .select(`
      id, bouw7_id, bron, start_dt, eind_dt, uren,
      medewerkers!medewerker_id ( bouw7_id ),
      planning_activiteiten!activiteit_id (
        titel, omschrijving, bouw7_security_code_id,
        dossiers!dossier_id (
          bouw7_id,
          projectleider:medewerkers!project_manager_id ( voornaam, tussenvoegsel, achternaam )
        )
      )
    `)
    .eq('id', itemId)
    .maybeSingle()

  if (!data || data.bron !== 'eva') return null

  const act = data.planning_activiteiten
  const pl = act?.dossiers?.projectleider ?? null
  const projectId  = Number(act?.dossiers?.bouw7_id)
  const employeeId = Number(data.medewerkers?.bouw7_id)
  if (!projectId || !employeeId) return null

  return {
    itemId:         data.id,
    bouw7Id:        data.bouw7_id ? Number(data.bouw7_id) : null,
    projectId,
    employeeId,
    titel:          (act?.titel ?? '').trim() || 'Planning',
    omschrijving:   act?.omschrijving ?? null,
    startDate:      naarBouw7Datum(data.start_dt),
    endDate:        naarBouw7Datum(data.eind_dt),
    hours:          Number(data.uren) || 0,
    securityCodeId: act?.bouw7_security_code_id ?? null,
    projectleider:  pl ? {
      voornaam:      (pl.voornaam ?? '').trim() || null,
      volledigeNaam: [pl.voornaam, pl.tussenvoegsel, pl.achternaam].filter(Boolean).join(' ').trim(),
    } : null,
  }
}

/**
 * De `securityPlanningLink` van een bewakingscode binnen een project.
 *
 * LET OP: dit is **niet** de bewakingscode-projectkoppeling uit
 * `/search/project-security-links` — dat is een andere entiteit met een eigen id-reeks
 * (4.0xx.xxx tegenover 41x.xxx). De planning-link komt alleen voor op bestaande
 * plan-items, dus we leiden hem af uit wat er al in het project gepland staat. Heeft het
 * project nog geen plan-item op die code, dan blijft de link onbekend en gaat het item
 * zónder taak/bewakingscode naar Bouw7 — het landt wél, alleen ongecodeerd.
 */
async function zoekPlanningLink(
  client: Bouw7Client,
  projectId: number,
  securityCodeId: number | null,
): Promise<number | null> {
  if (!securityCodeId) return null
  try {
    const res = await client.getApollo<{ items?: {
      securityPlanningLink?: { id: number; securityCode?: { id: number } | null } | null
    }[] }>('/search/plan-items', `project.id = ${projectId} limit 200`)
    for (const it of res.items ?? []) {
      const link = it.securityPlanningLink
      if (link?.id && link.securityCode?.id === securityCodeId) return link.id
    }
  } catch (e) {
    console.error('[plan-item-write] planning-link zoeken mislukt:', e)
  }
  return null
}


/* ── Balkkleur = projectleider ─────────────────────────────────────────────
 * Bouw7 kent één globale kleurenlegenda voor de planning (`GET /plan-item-colors`),
 * en bij Everts staat in elk label de **voornaam van een projectleider**: Marco, Chris,
 * Tom, Marga, Richard, Justin. De planborden worden daarop gelezen — aan de kleur van
 * een balk zie je van wie het werk is. Een EVA-planitem dat zonder kleur binnenkomt valt
 * daarom visueel buiten die indeling.
 *
 * We schrijven dus de hex uit de legenda die hoort bij de projectleider van het dossier.
 * De legenda is Bouw7's eigen waarheid en niet `medewerkers.kleur` in EVA: die twee zijn
 * naar het oog op elkaar afgestemd maar wijken per kanaal af (#2478ff tegenover #2E9AFE),
 * en een net-niet-gelijke hex zet de balk buiten de legenda in plaats van erin.
 *
 * Geen legenda-regel voor deze projectleider (niet elke projectleider heeft er een), geen
 * projectleider op het dossier, of de lijst niet op te halen → dan gaat `color` **niet**
 * mee in de body. Weglaten is bij deze upsert geen leegmaken: een bestaande kleur blijft
 * staan. Dat is bewust — een handmatig in Bouw7 gezette kleur wissen is schadelijker dan
 * hem laten staan.
 */

type Bouw7PlanItemKleur = { id: number; color?: string | null; label?: string | null }

const KLEUREN_TTL_MS = 10 * 60_000

let kleurenCache: { lijst: Bouw7PlanItemKleur[]; opgehaaldOp: number } | null = null
/** Lopende ophaal, zodat gelijktijdige writes er een delen i.p.v. er N afvuren. */
let kleurenInFlight: Promise<Bouw7PlanItemKleur[]> | null = null

/**
 * De kleurenlegenda van Bouw7, kort gecachet. Het is stamdata die hooguit een paar keer
 * per jaar verandert, terwijl een planner in één sleepbeweging tientallen items wegschrijft.
 */
async function haalKleuren(client: Bouw7Client): Promise<Bouw7PlanItemKleur[]> {
  if (kleurenCache && Date.now() - kleurenCache.opgehaaldOp < KLEUREN_TTL_MS) return kleurenCache.lijst
  if (!kleurenInFlight) {
    kleurenInFlight = client
      .get<Bouw7PlanItemKleur[]>('/plan-item-colors')
      .then(lijst => {
        const veilig = Array.isArray(lijst) ? lijst : []
        kleurenCache = { lijst: veilig, opgehaaldOp: Date.now() }
        return veilig
      })
      .catch(e => {
        console.error('[plan-item-write] kleurenlegenda ophalen mislukt:', e)
        return []
      })
      .finally(() => { kleurenInFlight = null })
  }
  return kleurenInFlight
}

const normaliseer = (s: string): string => s.toLowerCase().replace(/\s+/g, ' ').trim()

/**
 * De hex uit de legenda voor deze projectleider, of `null`.
 *
 * De labels zijn voornamen ("Chris"), maar dat is een gewoonte en geen garantie — daarom
 * eerst op voornaam, dan op volledige naam, en als laatste op een label dat als heel woord
 * in de volledige naam voorkomt (zodat een later toegevoegd "Chris Glas" ook raak is).
 * Nooit op deel-van-een-woord: "Mar" zou dan zowel Marco als Marga treffen.
 */
function kiesKleur(
  kleuren: Bouw7PlanItemKleur[],
  projectleider: { voornaam: string | null; volledigeNaam: string } | null,
): string | null {
  if (!projectleider) return null
  const voornaam = projectleider.voornaam ? normaliseer(projectleider.voornaam) : null
  const volledig = normaliseer(projectleider.volledigeNaam)
  if (!voornaam && !volledig) return null

  const bruikbaar = kleuren.filter(k => k.color && k.label)
  const woorden = new Set(volledig.split(' '))

  const treffer =
    (voornaam ? bruikbaar.find(k => normaliseer(k.label!) === voornaam) : undefined) ??
    bruikbaar.find(k => normaliseer(k.label!) === volledig) ??
    bruikbaar.find(k => woorden.has(normaliseer(k.label!)))

  return treffer?.color ?? null
}

/**
 * Schrijf één EVA-planitem naar Bouw7 (aanmaken of bijwerken) en bewaar de Bouw7-id.
 *
 * Die id in `planning_items.bouw7_id` doet dubbel werk: hij maakt de volgende write een
 * update in plaats van een tweede item, én hij is het merkteken waaraan de lees-sync ziet
 * dat dit Bouw7 plan-item van EVA komt en dus niet nóg een keer als bron='bouw7'-rij
 * geïmporteerd moet worden (zie `evaEigenPlanItemIds`).
 */
export async function schrijfPlanItemNaarBouw7(itemId: string): Promise<void> {
  try {
    const ctx = await laadContext(itemId)
    if (!ctx) return

    const client = await getBouw7ClientOfNull()
    if (!client) return

    const linkId = await zoekPlanningLink(client, ctx.projectId, ctx.securityCodeId)
    const kleur  = kiesKleur(await haalKleuren(client), ctx.projectleider)

    const body: Record<string, unknown> = {
      ...(ctx.bouw7Id ? { id: ctx.bouw7Id } : {}),
      name:      ctx.titel,
      project:   { id: ctx.projectId },
      startDate: ctx.startDate,
      endDate:   ctx.endDate,
      hours:     ctx.hours,
      requisite: 1,
      employees: [{ id: ctx.employeeId }],
      ...(ctx.omschrijving ? { notes: ctx.omschrijving } : {}),
      ...(kleur ? { color: kleur } : {}),
      ...(linkId ? { securityPlanningLink: { id: linkId } } : {}),
    }

    const res = await client.post<{ id?: number }>('/plan-item', body)
    const nieuweId = res?.id ?? ctx.bouw7Id
    if (!nieuweId) return

    await db()
      .from('planning_items')
      .update({ bouw7_id: String(nieuweId), bouw7_laatst_sync: new Date().toISOString() })
      .eq('id', itemId)
  } catch (e) {
    console.error('[plan-item-write] wegschrijven planitem mislukt:', e)
  }
}


/**
 * Herkleur de hele planning van één dossier in Bouw7 naar de kleur van zijn (nieuwe)
 * projectleider. Aanroepen na een rolwissel op het dossier.
 *
 * WAAROM ALLE PLAN-ITEMS EN NIET ALLEEN DE EVA-EIGEN: van de planning staat het overgrote
 * deel in Bouw7 zelf (bij het schrijven hiervan 1210 van de 1230 planitems). Zou de herkleuring
 * zich tot de EVA-items beperken, dan bleef een project na een rolwissel in Bouw7 vrijwel
 * volledig in de oude kleur staan — precies het beeld dat de planners op kleur lezen. De kleur
 * is bij Everts geen vrije opmaakkeuze maar de aanduiding van de projectleider, dus die hoort
 * over het hele project mee te bewegen.
 *
 * De write is een **partiële upsert**: `POST /plan-item` met alleen `{ id, color }`. Getest op
 * een tijdelijk item met notities, medewerker, afdeling, bewakingscode-link, `isAllDay` en uren:
 * na de call was álles onveranderd behalve de kleur (zie WRITE-ENDPOINTS.md §5b). Er is dus geen
 * read-modify-write nodig, en daarmee ook geen risico dat we een veld dat we niet begrijpen
 * terugschrijven.
 *
 * FAIL-SOFT en niet-blokkerend voor de rolwissel zelf: mislukt een item, dan blijft die balk in
 * de oude kleur staan en gaat de rest gewoon door.
 */
export async function herkleurPlanningInBouw7(dossierId: string): Promise<{
  /** Aantal plan-items dat een nieuwe kleur kreeg. */
  bijgewerkt: number
  /** Al de goede kleur — niet aangeraakt. */
  ongewijzigd: number
  mislukt: number
  /** De doelkleur, of null wanneer er niets te herkleuren viel (geen legenda-regel/PL/koppeling). */
  kleur: string | null
}> {
  const leeg = { bijgewerkt: 0, ongewijzigd: 0, mislukt: 0, kleur: null }
  try {
    const { data: dossier } = await db()
      .from('dossiers')
      .select('bouw7_id, projectleider:medewerkers!project_manager_id ( voornaam, tussenvoegsel, achternaam )')
      .eq('id', dossierId)
      .maybeSingle()

    const projectId = Number(dossier?.bouw7_id)
    if (!projectId) return leeg

    const client = await getBouw7ClientOfNull()
    if (!client) return leeg

    const pl = dossier?.projectleider ?? null
    const kleur = kiesKleur(await haalKleuren(client), pl ? {
      voornaam:      (pl.voornaam ?? '').trim() || null,
      volledigeNaam: [pl.voornaam, pl.tussenvoegsel, pl.achternaam].filter(Boolean).join(' ').trim(),
    } : null)
    // Geen kleur bekend → niets doen. Bewust niet leegmaken: de oude kleur laten staan is minder
    // schadelijk dan een project kleurloos maken omdat de nieuwe projectleider geen legenda-regel heeft.
    if (!kleur) return leeg

    const items = await client.getApolloAll<{ id: number; color?: string | null }>(
      '/search/plan-items', `project.id = ${projectId}`,
    )
    const teDoen = items.filter(i => (i.color ?? '').toUpperCase() !== kleur.toUpperCase())

    let mislukt = 0
    // In kleine parallelle groepen: een groot project heeft al gauw tachtig balken, en die
    // stuk voor stuk achter elkaar wegschrijven maakt het opslaan van een rol onnodig traag.
    const GROEP = 5
    for (let i = 0; i < teDoen.length; i += GROEP) {
      await Promise.all(teDoen.slice(i, i + GROEP).map(async it => {
        try {
          await client.post('/plan-item', { id: it.id, color: kleur })
        } catch (e) {
          mislukt++
          console.error('[plan-item-write] herkleuren planitem mislukt:', it.id, e)
        }
      }))
    }

    return {
      bijgewerkt:  teDoen.length - mislukt,
      ongewijzigd: items.length - teDoen.length,
      mislukt,
      kleur,
    }
  } catch (e) {
    console.error('[plan-item-write] herkleuren planning mislukt:', e)
    return leeg
  }
}

/**
 * Verwijder het bijbehorende Bouw7 plan-item. Aanroepen vóór de EVA-rij weg is, want
 * daarna is de `bouw7_id` niet meer op te halen.
 */
export async function verwijderPlanItemInBouw7(bouw7Id: string | null): Promise<void> {
  if (!bouw7Id) return
  try {
    const client = await getBouw7ClientOfNull()
    if (!client) return
    await client.del('/plan-item', { id: Number(bouw7Id) })
  } catch (e) {
    console.error('[plan-item-write] verwijderen planitem mislukt:', e)
  }
}

/**
 * Verwijder de Bouw7 plan-items van één fase (bewakingscode-hoofdstuk) of van één activiteit
 * binnen een project.
 *
 * Waarom niet gewoon de ids uit de EVA-planitems? Omdat die niet compleet zijn. De lees-sync
 * maakt per plan-item één EVA-planitem **per toegewezen medewerker**; een Bouw7 plan-item
 * zonder toegewezen medewerker levert dus géén EVA-rij op en zijn id staat nergens in EVA.
 * Zulke items zouden na het verwijderen van de fase in Bouw7 achterblijven en de fase bij de
 * eerstvolgende sync gewoon terugbouwen. Daarom halen we de plan-items van het project op en
 * snoeien we op hoofdstuk — dezelfde sleutel (`chapter:<id>`) waarmee de sync de fase maakt.
 *
 * Wat níet gebeurt: de bewakingscode en het hoofdstuk zelf blijven staan, net als de koppeling
 * van die code aan het project. Hoofdstukken zijn globale Bouw7-stamdata; alleen de *planning*
 * eronder wordt opgeruimd.
 *
 * `beschermdeIds` zijn plan-items die aan een andere EVA-activiteit hangen. Een in EVA gemaakte
 * activiteit kan in fase B staan terwijl haar Bouw7-item de bewakingscode van fase A draagt;
 * die mag de snoei niet meenemen.
 *
 * De Apollo-call staat hier bewust inline in plaats van via `fetchPlanItems` uit sync-planning:
 * die module importeert op haar beurt uit dit bestand, en een importcyclus is het niet waard
 * voor drie regels.
 */
export async function verwijderPlanningInBouw7(opts: {
  projectBouw7Id: string | number | null
  /** `chapter:<id>` / `chapter:algemeen` — snoeit alles onder dat hoofdstuk (fase). */
  faseKey?:       string | null
  /** `group:<faseKey>:<titel>` — snoeit alleen de plan-items van één activiteit. */
  activiteitKey?: string | null
  planItemIds:    string[]
  beschermdeIds:  string[]
}): Promise<{ verwijderd: number; mislukt: number }> {
  const beschermd = new Set(opts.beschermdeIds)
  const teVerwijderen = new Set(opts.planItemIds.filter(id => !beschermd.has(id)))
  let mislukt = 0

  try {
    const client = await getBouw7ClientOfNull()
    if (!client) return { verwijderd: 0, mislukt: 0 }

    if (opts.projectBouw7Id && (opts.faseKey || opts.activiteitKey)) {
      const items = await client.getApolloAll<{
        id: number
        name?: string | null
        department?: { name?: string | null } | null
        securityPlanningLink?: { securityCode?: { chapter?: { id: number } | null } | null } | null
      }>('/search/plan-items', `project.id = ${Number(opts.projectBouw7Id)}`)

      for (const pi of items) {
        // Zelfde sleutels als sync-planning ze maakt; wijkt dat af, dan snoeit dit niets in
        // plaats van het verkeerde — de sleutels moeten dus samen wijzigen.
        const chap    = pi.securityPlanningLink?.securityCode?.chapter?.id
        const faseKey = chap ? `chapter:${chap}` : 'chapter:algemeen'
        // Zonder hoofdstuk is het een crewblok; die krijgen de afdelingsnaam als titel.
        const titel = chap
          ? (pi.name?.trim() || 'Taak')
          : (pi.department?.name?.trim() || pi.name?.trim() || 'Planning')
        const activiteitKey = `group:${faseKey}:${titel.toLowerCase()}`

        const raak = opts.faseKey ? faseKey === opts.faseKey : activiteitKey === opts.activiteitKey
        if (!raak) continue
        const id = String(pi.id)
        if (!beschermd.has(id)) teVerwijderen.add(id)
      }
    }

    for (const id of teVerwijderen) {
      try {
        await client.del('/plan-item', { id: Number(id) })
      } catch (e) {
        mislukt++
        console.error('[plan-item-write] verwijderen fase-planitem mislukt:', id, e)
      }
    }
  } catch (e) {
    console.error('[plan-item-write] fase-planning opruimen in Bouw7 mislukt:', e)
    return { verwijderd: 0, mislukt: teVerwijderen.size }
  }

  return { verwijderd: teVerwijderen.size - mislukt, mislukt }
}

/**
 * De Bouw7 plan-item-ids die door EVA zijn aangemaakt, voor één dossier.
 *
 * De lees-sync moet deze overslaan. Zonder die filter komt elk door EVA aangemaakt item
 * via de volgende sync terug als bron='bouw7'-rij náást het origineel: de gebruiker ziet
 * zijn planning dan dubbel, en de herbouw ruimt de EVA-rij niet op omdat die bron='eva' is.
 */
export async function evaEigenPlanItemIds(dossierId: string): Promise<Set<number>> {
  const { data } = await db()
    .from('planning_items')
    .select('bouw7_id, planning_activiteiten!activiteit_id ( dossier_id )')
    .eq('bron', 'eva')
    .not('bouw7_id', 'is', null)

  const ids = new Set<number>()
  for (const r of (data ?? []) as { bouw7_id: string; planning_activiteiten?: { dossier_id?: string } }[]) {
    if (r.planning_activiteiten?.dossier_id !== dossierId) continue
    const n = Number(r.bouw7_id)
    if (Number.isFinite(n)) ids.add(n)
  }
  return ids
}
