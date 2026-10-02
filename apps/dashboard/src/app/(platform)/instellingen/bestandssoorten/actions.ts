'use server'

/**
 * Beheer van de bestandssoorten (kolom "Soort" in de Bestanden-tab).
 *
 * Elke action begint met `vereisBeheerder()`: de page-guard alleen is niet genoeg,
 * een server action is ook als kale RPC aanroepbaar en deze schrijven met de
 * service role.
 */

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@everts/database/server'
import { vereisBeheerder } from '@/lib/auth/rechten'
import { splitsLijst, type BestandSoortDef } from '@/lib/dossiers/bestand-soort'

const PAD = '/instellingen/bestandssoorten'

type Resultaat = { ok: true } | { ok: false; error: string }

export type SoortInvoer = { naam: string; trefwoorden: string; extensies: string }

export async function getBestandSoorten(): Promise<BestandSoortDef[]> {
  await vereisBeheerder()
  const { data } = await createAdminClient()
    .from('bestand_soorten')
    .select('*')
    .order('volgorde')
    .order('naam')
    .limit(500)
  return data ?? []
}

function fout(e: { message: string; code?: string } | null): Resultaat {
  if (!e) return { ok: true }
  if (e.code === '23505') return { ok: false, error: 'Er bestaat al een soort met die naam.' }
  return { ok: false, error: e.message }
}

export async function maakBestandSoort(invoer: SoortInvoer): Promise<Resultaat> {
  await vereisBeheerder()
  const naam = invoer.naam.trim()
  if (!naam) return { ok: false, error: 'Geef de soort een naam.' }

  const db = createAdminClient()
  // Nieuwe soorten achteraan: de volgorde is ook de voorrang bij het herkennen.
  const { data: laatste } = await db
    .from('bestand_soorten').select('volgorde').order('volgorde', { ascending: false }).limit(1).maybeSingle()

  const { error } = await db.from('bestand_soorten').insert({
    naam,
    trefwoorden: splitsLijst(invoer.trefwoorden),
    extensies: splitsLijst(invoer.extensies),
    volgorde: (laatste?.volgorde ?? 0) + 10,
  })
  revalidatePath(PAD)
  return fout(error)
}

export async function werkBestandSoortBij(id: string, invoer: SoortInvoer): Promise<Resultaat> {
  await vereisBeheerder()
  const naam = invoer.naam.trim()
  if (!naam) return { ok: false, error: 'Geef de soort een naam.' }

  const { error } = await createAdminClient()
    .from('bestand_soorten')
    .update({ naam, trefwoorden: splitsLijst(invoer.trefwoorden), extensies: splitsLijst(invoer.extensies) })
    .eq('id', id)
  revalidatePath(PAD)
  return fout(error)
}

/**
 * Uitzetten in plaats van verwijderen: bestanden waarop de soort handmatig is gekozen
 * houden hem dan, en uitzetten is terug te draaien.
 */
export async function zetBestandSoortActief(id: string, actief: boolean): Promise<Resultaat> {
  await vereisBeheerder()
  const { error } = await createAdminClient().from('bestand_soorten').update({ actief }).eq('id', id)
  revalidatePath(PAD)
  return fout(error)
}

/** Zet de volgorde in één keer opnieuw, in stappen van 10. */
export async function ordenBestandSoorten(ids: string[]): Promise<Resultaat> {
  await vereisBeheerder()
  const db = createAdminClient()
  const resultaten = await Promise.all(
    ids.map((id, i) => db.from('bestand_soorten').update({ volgorde: (i + 1) * 10 }).eq('id', id)),
  )
  revalidatePath(PAD)
  return fout(resultaten.find(r => r.error)?.error ?? null)
}
