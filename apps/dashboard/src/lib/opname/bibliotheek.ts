'use server'

/**
 * De opnamebibliotheek: prijslijsten per opdrachtgever, hun onderdelen en hun ruimte-sjabloon.
 *
 * Autorisatie: `opname` is bewust GEEN nieuwe rechten-key. Het beheren van een prijslijst is
 * calculatiewerk en valt onder `everts_calc: 'schrijven'` — dezelfde gate die de receptenbibliotheek
 * al gebruikt. Lezen gaat via `vereisSessie()`, want een opnemer op /m moet de lijst kunnen zien
 * terwijl hij het calculatierecht niet heeft.
 *
 * PostgREST-afkapping: een corporatie-prijslijst is makkelijk meer dan 1000 regels. Elke query die
 * onderdelen ophaalt loopt daarom via `haalAlleRijen()` met een stabiele `.order()`. Dit is exact
 * het scenario waarvoor die helper geschreven is.
 */

import { createAdminClient } from '@everts/database/server'
import { revalidatePath } from 'next/cache'
import type {
  OpnameNorm,
  OpnameOnderdeel,
  OpnameOnderdeelKeuze,
  OpnamePrijslijst,
  OpnamePrijslijstStatus,
  OpnameRuimte,
} from '@everts/database/opname-types'
import { vereisRecht, vereisSessie } from '@/lib/auth/rechten'
import { haalAlleRijen } from '@/lib/supabase/paginate'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

/**
 * Kopie van een rij zonder de opgegeven kolommen.
 *
 * Bij het kopiëren van een prijslijst moeten `id` en de tijdstempels weg: de kopie krijgt eigen
 * waarden. Destructureren met wegwerpvariabelen (`{ id: _id, ...rest }`) doet hetzelfde, maar dan
 * klaagt de linter over ongebruikte variabelen — en die waarschuwing verdient het niet weggedrukt
 * te worden met een uitzondering.
 */
function zonderSleutels<T extends Record<string, unknown>>(rij: T, sleutels: string[]): Partial<T> {
  const uit: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(rij)) if (!sleutels.includes(k)) uit[k] = v
  return uit as Partial<T>
}

/** Alles wat de mobiele kiezer nodig heeft, in één keer op te halen en lokaal te bewaren. */
export type OpnameBibliotheek = {
  prijslijst: OpnamePrijslijst
  onderdelen: OpnameOnderdeelKeuze[]
  ruimtes: OpnameRuimte[]
}

const KEUZE_KOLOMMEN =
  'id, code, hoofdgroep, subgroep, omschrijving, toelichting, eenheid, prijs_soort, verkoop_pe, foto_verplicht, toelichting_verplicht, standaard_aantal, aantal_stap'

/* ─────────────────────────────── Lezen ───────────────────────────────────── */

/** Alle prijslijsten van één opdrachtgever, nieuwste jaargang eerst. */
export async function getPrijslijsten(relatieId: string): Promise<OpnamePrijslijst[]> {
  await vereisSessie()
  const { data, error } = await db()
    .from('opname_prijslijsten')
    .select('*')
    .eq('relatie_id', relatieId)
    .order('geldig_vanaf', { ascending: false, nullsFirst: false })
    .order('naam')
  if (error) throw new Error(`Prijslijsten ophalen mislukt: ${error.message}`)
  return (data ?? []) as OpnamePrijslijst[]
}

/**
 * De prijslijst die vandaag geldt voor deze opdrachtgever, of null.
 *
 * Bij meerdere actieve lijsten wint de meest recente `geldig_vanaf`. Dat is bewust mild: een
 * beheerder die vergeet de oude op 'vervallen' te zetten krijgt zo nog steeds de nieuwe.
 */
export async function getActievePrijslijst(relatieId: string): Promise<OpnamePrijslijst | null> {
  await vereisSessie()
  const vandaag = new Date().toISOString().slice(0, 10)
  const { data, error } = await db()
    .from('opname_prijslijsten')
    .select('*')
    .eq('relatie_id', relatieId)
    .eq('status', 'actief')
    .or(`geldig_vanaf.is.null,geldig_vanaf.lte.${vandaag}`)
    .or(`geldig_tot.is.null,geldig_tot.gte.${vandaag}`)
    .order('geldig_vanaf', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`Actieve prijslijst ophalen mislukt: ${error.message}`)
  return (data as OpnamePrijslijst | null) ?? null
}

/** Alle onderdelen van een prijslijst — gepagineerd, want dit zijn er meer dan 1000. */
export async function getOnderdelen(
  prijslijstId: string,
  alleenActief = true,
): Promise<OpnameOnderdeel[]> {
  await vereisSessie()
  const supabase = db()
  return haalAlleRijen<OpnameOnderdeel>((van, tot) => {
    let q = supabase
      .from('opname_onderdelen')
      .select('*')
      .eq('prijslijst_id', prijslijstId)
    if (alleenActief) q = q.eq('actief', true)
    return q.order('code').range(van, tot)
  })
}

/**
 * De bibliotheek zoals de mobiele kiezer hem gebruikt: smalle kolommen, alleen actieve onderdelen.
 * Deze lijst gaat in zijn geheel naar de telefoon en wordt daar lokaal gefilterd, dus elke kolom
 * die je hier toevoegt reist mee over 4G.
 */
export async function getBibliotheek(prijslijstId: string): Promise<OpnameBibliotheek | null> {
  await vereisSessie()
  const supabase = db()

  const { data: prijslijst, error } = await supabase
    .from('opname_prijslijsten')
    .select('*')
    .eq('id', prijslijstId)
    .maybeSingle()
  if (error) throw new Error(`Prijslijst ophalen mislukt: ${error.message}`)
  if (!prijslijst) return null

  const [onderdelen, ruimtes] = await Promise.all([
    haalAlleRijen<OpnameOnderdeelKeuze>((van, tot) =>
      supabase
        .from('opname_onderdelen')
        .select(KEUZE_KOLOMMEN)
        .eq('prijslijst_id', prijslijstId)
        .eq('actief', true)
        .order('code')
        .range(van, tot),
    ),
    getRuimtes(prijslijstId),
  ])

  return { prijslijst: prijslijst as OpnamePrijslijst, onderdelen, ruimtes }
}

export async function getRuimtes(prijslijstId: string): Promise<OpnameRuimte[]> {
  const { data, error } = await db()
    .from('opname_ruimtes')
    .select('*')
    .eq('prijslijst_id', prijslijstId)
    .eq('actief', true)
    .order('volgorde')
    .order('naam')
  if (error) throw new Error(`Ruimtes ophalen mislukt: ${error.message}`)
  return (data ?? []) as OpnameRuimte[]
}

/**
 * De onderdelen die bij deze opdrachtgever het vaakst zijn gebruikt, laatste twaalf maanden.
 *
 * Op een telefoon scheelt zo'n lijstje meer dan welke zoekverbetering ook: in de praktijk komt de
 * helft van de regels uit dezelfde twintig onderdelen. Bewust begrensd op de eigen prijslijst zodat
 * er nooit een onderdeel van een andere corporatie tussen staat.
 */
export async function getVaakGebruikt(prijslijstId: string, limiet = 12): Promise<string[]> {
  await vereisSessie()
  const grens = new Date()
  grens.setMonth(grens.getMonth() - 12)

  const { data, error } = await db()
    .from('opname_regels')
    .select('onderdeel_id, opname_onderdelen!inner(prijslijst_id)')
    .eq('opname_onderdelen.prijslijst_id', prijslijstId)
    .gte('created_at', grens.toISOString())
    .not('onderdeel_id', 'is', null)
    .order('created_at', { ascending: false })
    // Bewuste bovengrens in plaats van pagineren: dit is een suggestielijstje, geen dataset.
    // De laatste 1000 regels zijn ruim genoeg om de top-12 uit af te leiden.
    .limit(1000)
  if (error) throw new Error(`Veelgebruikte onderdelen ophalen mislukt: ${error.message}`)

  const tellers = new Map<string, number>()
  for (const rij of (data ?? []) as { onderdeel_id: string }[]) {
    tellers.set(rij.onderdeel_id, (tellers.get(rij.onderdeel_id) ?? 0) + 1)
  }
  return Array.from(tellers)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limiet)
    .map(([id]) => id)
}

/* ───────────────────────── Normen uit het recept ─────────────────────────── */

/**
 * Haalt de arbeids- en materiaalnormen van een gekoppeld recept op en bevriest ze.
 *
 * Deze vorm is één-op-één wat `Componentregel` in de calculatie nodig heeft, zodat de import later
 * een pure vertaling is. Dat is met opzet: een prijswijziging in `paint_items` — of de spiegeltrigger
 * die vergrendelde recepten overschrijft vanuit de Schilderwerkbibliotheek — mag een lopende opname
 * nooit met terugwerkende kracht veranderen.
 */
export async function bevriesNormen(paintItemId: string): Promise<OpnameNorm[]> {
  const supabase = db()
  const [{ data: arbeid, error: arbeidFout }, { data: materiaal, error: materiaalFout }] =
    await Promise.all([
      supabase
        .from('paint_labor_norms')
        .select('hours_per_unit, hour_rate, description')
        .eq('item_id', paintItemId)
        .eq('active', true),
      supabase
        .from('paint_material_norms')
        .select('material_name, unit, quantity_per_unit, unit_price, norm_type')
        .eq('item_id', paintItemId)
        .eq('active', true),
    ])
  if (arbeidFout) throw new Error(`Arbeidsnormen ophalen mislukt: ${arbeidFout.message}`)
  if (materiaalFout) throw new Error(`Materiaalnormen ophalen mislukt: ${materiaalFout.message}`)

  const normen: OpnameNorm[] = []
  for (const n of arbeid ?? []) {
    normen.push({
      type: 'arbeid',
      norm_hoeveelheid: Number(n.hours_per_unit) || 0,
      eenheid: 'uur',
      tarief: Number(n.hour_rate) || 0,
      omschrijving: n.description ?? null,
    })
  }
  for (const n of materiaal ?? []) {
    normen.push({
      type: n.norm_type === 'onderaanneming' ? 'onderaanneming' : 'materieel',
      norm_hoeveelheid: Number(n.quantity_per_unit) || 0,
      eenheid: n.unit || 'st',
      tarief: Number(n.unit_price) || 0,
      omschrijving: n.material_name ?? null,
    })
  }
  return normen
}

/* ─────────────────────────────── Beheren ─────────────────────────────────── */

export async function slaPrijslijstOp(
  invoer: Partial<OpnamePrijslijst> & { relatie_id: string; naam: string },
): Promise<OpnamePrijslijst> {
  const { medewerker } = await vereisRecht('everts_calc', 'schrijven')
  const supabase = db()

  const rij = {
    ...invoer,
    created_by: invoer.id ? undefined : medewerker.id,
  }

  const { data, error } = invoer.id
    ? await supabase.from('opname_prijslijsten').update(rij).eq('id', invoer.id).select().single()
    : await supabase.from('opname_prijslijsten').insert(rij).select().single()
  if (error) throw new Error(`Prijslijst opslaan mislukt: ${error.message}`)

  revalidatePath(`/relaties/${invoer.relatie_id}`)
  return data as OpnamePrijslijst
}

export async function zetPrijslijstStatus(
  prijslijstId: string,
  status: OpnamePrijslijstStatus,
): Promise<void> {
  await vereisRecht('everts_calc', 'schrijven')
  const { data, error } = await db()
    .from('opname_prijslijsten')
    .update({ status })
    .eq('id', prijslijstId)
    .select('relatie_id')
    .single()
  if (error) throw new Error(`Status bijwerken mislukt: ${error.message}`)
  revalidatePath(`/relaties/${data.relatie_id}`)
}

/**
 * Kopieert een prijslijst naar een nieuwe jaargang, inclusief onderdelen en ruimtes.
 *
 * De kopie start als concept: prijzen aanpassen gebeurt vóór activeren, en lopende opnames blijven
 * ondertussen aan de oude lijst hangen. Nieuwe ids overal, want de codes zijn alleen binnen één
 * prijslijst uniek.
 */
export async function kopieerPrijslijst(
  prijslijstId: string,
  nieuweJaargang: string,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  await vereisRecht('everts_calc', 'schrijven')
  const supabase = db()

  const { data: bron, error: bronFout } = await supabase
    .from('opname_prijslijsten')
    .select('*')
    .eq('id', prijslijstId)
    .maybeSingle()
  if (bronFout) return { ok: false, error: bronFout.message }
  if (!bron) return { ok: false, error: 'Prijslijst niet gevonden' }

  const { data: kopie, error: kopieFout } = await supabase
    .from('opname_prijslijsten')
    .insert({
      ...zonderSleutels(bron, ['id', 'created_at', 'updated_at']),
      jaargang: nieuweJaargang,
      status: 'concept',
      bron_bestand: null,
    })
    .select('id')
    .single()
  if (kopieFout) return { ok: false, error: `Kopiëren mislukt: ${kopieFout.message}` }

  const onderdelen = await getOnderdelen(prijslijstId, false)
  if (onderdelen.length > 0) {
    const rijen = onderdelen.map(o => ({
      ...zonderSleutels(o, ['id', 'created_at', 'updated_at']),
      prijslijst_id: kopie.id,
    }))
    // In blokken van 500: één insert met 1500 rijen loopt tegen de body-limiet aan.
    for (let i = 0; i < rijen.length; i += 500) {
      const { error } = await supabase.from('opname_onderdelen').insert(rijen.slice(i, i + 500))
      if (error) return { ok: false, error: `Onderdelen kopiëren mislukt: ${error.message}` }
    }
  }

  const ruimtes = await getRuimtes(prijslijstId)
  if (ruimtes.length > 0) {
    const { error } = await supabase.from('opname_ruimtes').insert(
      ruimtes.map(r => ({
        ...zonderSleutels(r, ['id', 'created_at']),
        prijslijst_id: kopie.id,
      })),
    )
    if (error) return { ok: false, error: `Ruimtes kopiëren mislukt: ${error.message}` }
  }

  revalidatePath(`/relaties/${bron.relatie_id}`)
  return { ok: true, id: kopie.id }
}

export async function slaOnderdeelOp(
  invoer: Partial<OpnameOnderdeel> & { prijslijst_id: string; code: string },
): Promise<OpnameOnderdeel> {
  await vereisRecht('everts_calc', 'schrijven')
  const supabase = db()

  const { data, error } = invoer.id
    ? await supabase.from('opname_onderdelen').update(invoer).eq('id', invoer.id).select().single()
    : await supabase.from('opname_onderdelen').insert(invoer).select().single()
  if (error) throw new Error(`Onderdeel opslaan mislukt: ${error.message}`)
  return data as OpnameOnderdeel
}

export async function verwijderOnderdeel(onderdeelId: string): Promise<void> {
  await vereisRecht('everts_calc', 'schrijven')
  // Zacht verwijderen: bestaande opnameregels verwijzen ernaar en hun snapshot moet leesbaar
  // blijven. `actief = false` haalt hem uit de kiezer zonder die historie te breken.
  const { error } = await db()
    .from('opname_onderdelen')
    .update({ actief: false })
    .eq('id', onderdeelId)
  if (error) throw new Error(`Onderdeel verwijderen mislukt: ${error.message}`)
}

export async function slaRuimteOp(
  invoer: Partial<OpnameRuimte> & { prijslijst_id: string; naam: string },
): Promise<OpnameRuimte> {
  await vereisRecht('everts_calc', 'schrijven')
  const supabase = db()
  const { data, error } = invoer.id
    ? await supabase.from('opname_ruimtes').update(invoer).eq('id', invoer.id).select().single()
    : await supabase.from('opname_ruimtes').insert(invoer).select().single()
  if (error) throw new Error(`Ruimte opslaan mislukt: ${error.message}`)
  return data as OpnameRuimte
}

export async function verwijderRuimte(ruimteId: string): Promise<void> {
  await vereisRecht('everts_calc', 'schrijven')
  const { error } = await db().from('opname_ruimtes').update({ actief: false }).eq('id', ruimteId)
  if (error) throw new Error(`Ruimte verwijderen mislukt: ${error.message}`)
}
