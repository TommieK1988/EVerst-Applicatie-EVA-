'use server'

import { createAdminClient } from '@everts/database/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import type { RechtenModule, RechtenSet, RechtenDocument } from '@everts/database/platform-types'
import { RECHTEN_MODULES, FUNCTIE_INDEX, alsPlatteSet } from '@everts/database/rechten'
import { vereisBeheerder, GeenToegangError } from '@/lib/auth/rechten'
import { schrijfPlatteDesktopSet } from '@/lib/auth/rechten-opslag'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

type ActionResult = { ok: true } | { ok: false; error: string }

export async function getGebruikers() {
  try {
    await vereisBeheerder()
  } catch (e) {
    if (e instanceof GeenToegangError) return { ok: false as const, error: e.message }
    throw e
  }
  const { data, error } = await db()
    .from('medewerkers')
    .select('id, voornaam, tussenvoegsel, achternaam, email, afdeling, gebruiker_type, rechten_override, o365_email, auth_user_id, actief')
    .neq('gebruiker_type', 'geen')
    .eq('actief', true)
    .order('achternaam')

  if (error) return { ok: false as const, error: error.message }
  return { ok: true as const, data: data ?? [] }
}

export async function getAfdelingenMetRechten() {
  try {
    await vereisBeheerder()
  } catch (e) {
    if (e instanceof GeenToegangError) return { ok: false as const, error: e.message }
    throw e
  }
  const { data, error } = await db()
    .from('medewerker_afdelingen')
    .select('id, naam, volgorde, actief, rechten, standaard_rechten')
    .eq('actief', true)
    .order('volgorde')
    .order('naam')

  if (error) return { ok: false as const, error: error.message }
  return { ok: true as const, data: data ?? [] }
}

const MODULE_KEYS = RECHTEN_MODULES.map(m => m.key) as [RechtenModule, ...RechtenModule[]]

const rechtenSetSchema = z.record(
  z.enum(MODULE_KEYS),
  z.enum(['lezen', 'schrijven', 'beheren']).nullable()
)

export async function updateAfdelingRechten(
  afdeling_id: string,
  rechten: RechtenSet
): Promise<ActionResult> {
  try {
    await vereisBeheerder()
  } catch (e) {
    if (e instanceof GeenToegangError) return { ok: false, error: e.message }
    throw e
  }

  const parsed = rechtenSetSchema.safeParse(rechten)
  if (!parsed.success) return { ok: false, error: 'Ongeldige rechten' }

  // Deze matrix kent alleen de platte desktopset. De mobiele kant blijft staan en
  // de platte spiegel loopt mee voor de SQL-lezers. Zie lib/auth/rechten-opslag.ts.
  const { data: rij } = await db()
    .from('medewerker_afdelingen')
    .select('rechten, standaard_rechten').eq('id', afdeling_id).maybeSingle()
  const opslag = schrijfPlatteDesktopSet(rij?.rechten, rij?.standaard_rechten, parsed.data)

  const { error } = await db()
    .from('medewerker_afdelingen')
    .update({ rechten: opslag.rechten, standaard_rechten: opslag.plat })
    .eq('id', afdeling_id)

  if (error) return { ok: false, error: error.message }
  revalidatePath('/instellingen/gebruikers')
  revalidatePath('/medewerkers')
  return { ok: true }
}

// ── Rechten v2: beide kanalen ────────────────────────────────────────────────

const FUNCTIE_KEYS = Object.keys(FUNCTIE_INDEX) as [string, ...string[]]

const kanaalSchema = z.object({
  modules: z.record(z.enum(MODULE_KEYS), z.enum(['lezen', 'schrijven', 'beheren']).nullable()),
  functies: z.record(z.enum(FUNCTIE_KEYS), z.boolean()),
})

const documentSchema = z.object({
  versie: z.literal(2),
  desktop: kanaalSchema,
  mobiel: kanaalSchema,
})

/** Schrijft de v2-vorm én de platte spiegel. Zie lib/auth/rechten-opslag.ts. */
function metSpiegel(doc: RechtenDocument) {
  return { rechten: doc, plat: alsPlatteSet(doc.desktop) }
}

export async function updateAfdelingRechtenDocument(
  afdeling_id: string,
  document: RechtenDocument,
): Promise<ActionResult> {
  try {
    await vereisBeheerder()
  } catch (e) {
    if (e instanceof GeenToegangError) return { ok: false, error: e.message }
    throw e
  }

  const parsed = documentSchema.safeParse(document)
  if (!parsed.success) return { ok: false, error: 'Ongeldige rechten' }

  const opslag = metSpiegel(parsed.data as RechtenDocument)
  const { error } = await db()
    .from('medewerker_afdelingen')
    .update({ rechten: opslag.rechten, standaard_rechten: opslag.plat })
    .eq('id', afdeling_id)

  if (error) return { ok: false, error: error.message }
  revalidatePath('/instellingen/gebruikers')
  revalidatePath('/medewerkers')
  return { ok: true }
}

export async function updateGebruikerRechtenDocument(
  medewerker_id: string,
  document: RechtenDocument,
): Promise<ActionResult> {
  let ik
  try {
    ({ medewerker: ik } = await vereisBeheerder())
  } catch (e) {
    if (e instanceof GeenToegangError) return { ok: false, error: e.message }
    throw e
  }

  const parsed = documentSchema.safeParse(document)
  if (!parsed.success) return { ok: false, error: 'Ongeldige rechten' }
  const doc = parsed.data as RechtenDocument

  // Een beheerder die zichzelf `instellingen` afneemt of `rechten_beheren` op uit
  // zet, kan dat daarna niet meer terugdraaien: hij komt het scherm niet meer op.
  // De matrix zet die velden al op slot; dit is de gate erachter, want de action
  // is ook als kale RPC aanroepbaar.
  if (medewerker_id === ik.id) {
    const raaktZichzelf =
      doc.desktop.modules.instellingen !== undefined ||
      doc.desktop.functies['instellingen.rechten_beheren'] === false
    if (raaktZichzelf) {
      return { ok: false, error: 'Je kunt je eigen beheerrechten niet wijzigen. Laat een andere beheerder dat doen.' }
    }
  }

  const opslag = metSpiegel(doc)
  const { error } = await db()
    .from('medewerkers')
    .update({ rechten: opslag.rechten, rechten_override: opslag.plat })
    .eq('id', medewerker_id)

  if (error) return { ok: false, error: error.message }
  revalidatePath('/instellingen/gebruikers')
  revalidatePath(`/medewerkers/${medewerker_id}`)
  return { ok: true }
}

/** De v2-rechten van één gebruiker plus die van zijn afdeling, voor de editor. */
export async function getGebruikerRechten(medewerker_id: string) {
  try {
    await vereisBeheerder()
  } catch (e) {
    if (e instanceof GeenToegangError) return { ok: false as const, error: e.message }
    throw e
  }
  const { data, error } = await db()
    .from('medewerkers')
    .select('id, voornaam, tussenvoegsel, achternaam, afdeling, afdeling_id, rechten, rechten_override')
    .eq('id', medewerker_id)
    .maybeSingle()
  if (error) return { ok: false as const, error: error.message }
  if (!data) return { ok: false as const, error: 'Medewerker niet gevonden' }

  let afdeling = null
  if (data.afdeling_id) {
    const { data: a } = await db()
      .from('medewerker_afdelingen')
      .select('rechten, standaard_rechten').eq('id', data.afdeling_id).maybeSingle()
    afdeling = a ?? null
  }
  return { ok: true as const, data: { medewerker: data, afdeling } }
}
