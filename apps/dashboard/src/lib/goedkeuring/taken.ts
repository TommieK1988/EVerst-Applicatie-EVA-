import 'server-only'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@everts/database/server'

export interface BeoordeelTaakResultaat {
  /** Naam van de medewerker aan wie de taak is toegewezen (null als niemand gevonden). */
  toegewezenAan: string | null
  /** True als er geen doelmedewerker was en is teruggevallen op Tom Kamminga. */
  isFallback: boolean
  /** True als er al een openstaande taak met deze titel bestond (geen nieuwe gemaakt). */
  bestond: boolean
  taakId: string | null
}

/**
 * Maakt een taak op het dossier aan, toegewezen aan de opgegeven medewerker.
 * Zonder `medewerkerId` valt de toewijzing terug op de controller van het dossier,
 * en als die er niet is op Tom Kamminga. Bestaat er al een openstaande taak met
 * dezelfde titel op het dossier, dan wordt er geen dubbele aangemaakt.
 * (Generalisatie van de eerdere maakWerkbegrotingControleTaak.)
 */
export async function maakBeoordeelTaak(
  dossierId: string,
  titel: string,
  medewerkerId?: string | null,
): Promise<BeoordeelTaakResultaat> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any

  let doelId: string | null = medewerkerId ?? null
  let isFallback = false

  // 1. Geen expliciete medewerker → controller van het dossier.
  if (!doelId) {
    const { data: dossier } = await db
      .from('dossiers')
      .select('controller_id')
      .eq('id', dossierId)
      .single()
    doelId = dossier?.controller_id ?? null
  }

  // 2. Nog steeds niemand → terugvallen op Tom Kamminga.
  if (!doelId) {
    isFallback = true
    const { data: tom } = await db
      .from('medewerkers')
      .select('id')
      .ilike('voornaam', 'Tom')
      .ilike('achternaam', 'Kamminga')
      .limit(1)
      .maybeSingle()
    doelId = tom?.id ?? null
  }

  // 3. Naam + auth-koppeling van de toegewezen medewerker.
  let naam: string | null = null
  let authUserId: string | null = null
  if (doelId) {
    const { data: med } = await db
      .from('medewerkers')
      .select('voornaam, tussenvoegsel, achternaam, auth_user_id')
      .eq('id', doelId)
      .single()
    if (med) {
      naam = [med.voornaam, med.tussenvoegsel, med.achternaam].filter(Boolean).join(' ')
      authUserId = med.auth_user_id ?? null
    }
  }

  // 4. Bestaat er al een openstaande taak met deze titel? Dan niet dubbel aanmaken.
  const { data: bestaand } = await db
    .from('tasks')
    .select('id')
    .eq('dossier_id', dossierId)
    .eq('titel', titel)
    .not('status', 'in', '("gereed","vervallen")')
    .limit(1)
    .maybeSingle()

  if (bestaand) {
    return { toegewezenAan: naam, isFallback, bestond: true, taakId: bestaand.id }
  }

  // 5. Taak aanmaken, rechtstreeks aan het dossier gekoppeld. Beoordelen is urgent:
  //    prioriteit hoog + deadline op uiterlijk morgen (max 1 dag later).
  const morgen = new Date()
  morgen.setDate(morgen.getDate() + 1)
  const deadline = morgen.toISOString().slice(0, 10)

  const { data: taak, error } = await db
    .from('tasks')
    .insert({
      titel,
      dossier_id:     dossierId,
      status:         'open',
      prioriteit:     'hoog',
      deadline,
      assignee_type:  'direct',
      dossier_rollen: [],
    })
    .select('id')
    .single()

  if (error) throw new Error(`Fout bij aanmaken taak: ${error.message}`)

  // 6. Toewijzen.
  if (authUserId) {
    await db.from('task_assignees').insert({
      task_id: taak.id,
      user_id: authUserId,
      rol:     'verantwoordelijke',
    })
  }

  revalidatePath('/opdrachten')
  revalidatePath('/taken')

  return { toegewezenAan: naam, isFallback, bestond: false, taakId: taak.id }
}

/** Sluit alle openstaande taken met deze titel op het dossier (status → gereed). */
export async function sluitBeoordeelTaken(dossierId: string, titel: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any
  await db
    .from('tasks')
    .update({ status: 'gereed' })
    .eq('dossier_id', dossierId)
    .eq('titel', titel)
    .not('status', 'in', '("gereed","vervallen")')
  revalidatePath('/taken')
}
