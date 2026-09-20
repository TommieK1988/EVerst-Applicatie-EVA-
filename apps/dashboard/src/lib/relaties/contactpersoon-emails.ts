'use server'

/**
 * Meerdere e-mailadressen per contactpersoon.
 *
 * Iemand heeft vaak meer dan één adres: een persoonlijk adres én de facturenpostbus van zijn
 * kantoor, of tijdelijk een oud en een nieuw adres naast elkaar. Tot nu toe paste er maar één
 * in EVA, en wie naar het andere adres wilde mailen typte het over.
 *
 * **`contactpersonen.email` blijft het primaire adres.** Bouw7 kent er maar één per
 * contactpersoon, en tientallen plekken in EVA lezen die kolom. De lijst hier is een aanvulling:
 * een databasetrigger spiegelt het primaire adres mee, zodat beide kanten altijd kloppen — ook
 * wanneer de Bouw7-sync het adres wijzigt. Een ander adres primair maken doe je daarom door
 * `contactpersonen.email` te schrijven (`zetPrimairEmail`), niet door hier een vlaggetje om te
 * zetten; dan gaat het meteen goed richting Bouw7.
 */

import { createAdminClient } from '@everts/database/server'
import { revalidatePath } from 'next/cache'
import { vereisRecht, GeenToegangError } from '@/lib/auth/rechten'
import { updateContactpersoon } from './contactpersonen-actions'
import type { ContactpersoonEmail } from '@everts/database'

type ActionResult = { ok: true; waarschuwing?: string } | { ok: false; error: string }

// Bewust zonder any-cast: `contactpersoon_emails` staat in `database.types.ts`, dus de
// getypeerde client kent deze tabel gewoon.
const db = () => createAdminClient()

/** Een adres is bruikbaar als er iets vóór en iets ná de @ staat, met een punt in het domein. */
function geldigAdres(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())
}

async function magSchrijven(): Promise<string | null> {
  try {
    await vereisRecht('relaties', 'schrijven')
    return null
  } catch (e) {
    if (e instanceof GeenToegangError) return 'Je hebt geen rechten om contactpersonen te wijzigen.'
    throw e
  }
}

/** Alle adressen van één contactpersoon, primair eerst. */
export async function getContactpersoonEmails(contactpersoonId: string): Promise<ContactpersoonEmail[]> {
  await vereisRecht('relaties', 'lezen')
  const { data } = await db()
    .from('contactpersoon_emails')
    .select('*')
    .eq('contactpersoon_id', contactpersoonId)
    .order('is_primair', { ascending: false })
    .order('created_at', { ascending: true })
  return (data ?? []) as ContactpersoonEmail[]
}

export async function voegContactpersoonEmailToe(
  contactpersoonId: string,
  email: string,
  label?: string | null,
): Promise<ActionResult> {
  const fout = await magSchrijven()
  if (fout) return { ok: false, error: fout }

  const adres = email.trim()
  if (!geldigAdres(adres)) return { ok: false, error: 'Dat is geen geldig e-mailadres.' }

  const supabase = db()
  // Heeft de persoon nog geen enkel adres, dan wordt dit het primaire — dan loopt het via
  // `contactpersonen.email`, zodat het ook in Bouw7 terechtkomt.
  const { data: bestaand } = await supabase
    .from('contactpersoon_emails')
    .select('id')
    .eq('contactpersoon_id', contactpersoonId)
    .limit(1)

  if (!bestaand?.length) return zetPrimairEmail(contactpersoonId, adres, label ?? null)

  const { error } = await supabase
    .from('contactpersoon_emails')
    .insert({ contactpersoon_id: contactpersoonId, email: adres, label: label?.trim() || null })

  if (error) {
    // 23505 = unieke index: dit adres staat al bij deze persoon.
    if (error.code === '23505') return { ok: false, error: 'Dit adres staat al bij deze contactpersoon.' }
    return { ok: false, error: error.message }
  }
  revalidatePath(`/relaties/contactpersonen/${contactpersoonId}`)
  return { ok: true }
}

export async function wijzigContactpersoonEmail(
  id: string,
  patch: { email?: string; label?: string | null; opmerking?: string | null },
): Promise<ActionResult> {
  const fout = await magSchrijven()
  if (fout) return { ok: false, error: fout }

  const supabase = db()
  const { data: rij } = await supabase
    .from('contactpersoon_emails')
    .select('id, contactpersoon_id, email, is_primair')
    .eq('id', id)
    .maybeSingle()
  if (!rij) return { ok: false, error: 'Dit adres bestaat niet (meer).' }

  if (patch.email !== undefined) {
    const adres = patch.email.trim()
    if (!geldigAdres(adres)) return { ok: false, error: 'Dat is geen geldig e-mailadres.' }
    // Het primaire adres wijzig je via de contactpersoon zelf; de trigger trekt deze rij dan bij
    // en Bouw7 krijgt de wijziging via de bestaande write-back.
    if (rij.is_primair) return zetPrimairEmail(rij.contactpersoon_id, adres, patch.label ?? null)
  }

  const { error } = await supabase
    .from('contactpersoon_emails')
    .update({
      ...(patch.email !== undefined ? { email: patch.email.trim() } : {}),
      ...(patch.label !== undefined ? { label: patch.label?.trim() || null } : {}),
      ...(patch.opmerking !== undefined ? { opmerking: patch.opmerking?.trim() || null } : {}),
    })
    .eq('id', id)

  if (error) {
    if (error.code === '23505') return { ok: false, error: 'Dit adres staat al bij deze contactpersoon.' }
    return { ok: false, error: error.message }
  }
  revalidatePath(`/relaties/contactpersonen/${rij.contactpersoon_id}`)
  return { ok: true }
}

export async function verwijderContactpersoonEmail(id: string): Promise<ActionResult> {
  const fout = await magSchrijven()
  if (fout) return { ok: false, error: fout }

  const supabase = db()
  const { data: rij } = await supabase
    .from('contactpersoon_emails')
    .select('id, contactpersoon_id, is_primair')
    .eq('id', id)
    .maybeSingle()
  if (!rij) return { ok: true }
  // Het primaire adres weghalen zou `contactpersonen.email` en deze lijst uit elkaar laten lopen;
  // wijs eerst een ander adres als primair aan.
  if (rij.is_primair) {
    return { ok: false, error: 'Dit is het primaire adres. Maak eerst een ander adres primair.' }
  }

  const { error } = await supabase.from('contactpersoon_emails').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/relaties/contactpersonen/${rij.contactpersoon_id}`)
  return { ok: true }
}

/**
 * Maakt `adres` het primaire adres van deze persoon.
 *
 * Loopt bewust via `updateContactpersoon`: die schrijft `contactpersonen.email`, markeert het
 * veld als handmatig zodat de sync het niet terugdraait, en zet het door naar Bouw7. De trigger
 * op de tabel werkt deze lijst daarna zelf bij.
 */
export async function zetPrimairEmail(
  contactpersoonId: string,
  adres: string,
  label?: string | null,
): Promise<ActionResult> {
  const fout = await magSchrijven()
  if (fout) return { ok: false, error: fout }
  if (!geldigAdres(adres)) return { ok: false, error: 'Dat is geen geldig e-mailadres.' }

  const res = await updateContactpersoon(contactpersoonId, { email: adres.trim() })
  if (!res.ok) return res

  if (label?.trim()) {
    await db()
      .from('contactpersoon_emails')
      .update({ label: label.trim() })
      .eq('contactpersoon_id', contactpersoonId)
      .eq('is_primair', true)
  }
  revalidatePath(`/relaties/contactpersonen/${contactpersoonId}`)
  return res
}
