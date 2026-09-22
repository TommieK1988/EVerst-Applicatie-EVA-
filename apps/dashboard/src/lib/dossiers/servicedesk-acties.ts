'use server'

/**
 * De handelingen achter de vaste knoppen op een servicedeskbon.
 *
 * Staat los van `servicedesk.ts` (dat gaat over regie en facturatie) en van het toch al veel te
 * grote `actions.ts`. Elke functie hier is een dunne schil: autoriseren, valideren, doen.
 */

import { z } from 'zod'
import { createAdminClient } from '@everts/database/server'
import { revalidatePath } from 'next/cache'
import { vereisRecht } from '@/lib/auth/rechten'
import { logFout, foutNaarInvoer } from '@/lib/fouten/log'
import { assertDossierBewerkbaar } from './guards'
import { plaatsDossierNotitie } from './notities-actions'
import { updateServicedeskSubstatus } from './actions'

const MANDAAT_VERHOGING = 'mandaat_verhoging'

/** Waar een bon op terugvalt als zijn vorige stand niet meer te achterhalen is. */
const TERUGVAL_SUBSTATUS = 'nieuw'

const bedrag = z.number().finite().positive().max(10_000_000)

const AanvraagSchema = z.object({
  gevraagdBedrag: bedrag,
  toelichting: z.string().trim().min(1, 'Schrijf erbij waarom het mandaat omhoog moet.').max(2000),
})

const ToekenningSchema = z.object({
  nieuwMandaat: bedrag,
  toelichting: z.string().trim().max(2000).optional(),
})

const euro = (n: number) =>
  new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(n)

/**
 * De substatus waar de bon stond vóór de mandaatverhoging.
 *
 * Een verhoging kan op elk moment nodig blijken — bij binnenkomst, maar net zo goed als het werk
 * al loopt. Zou de bon na toekenning altijd op "Nieuw" landen, dan zou een lopende klus op het
 * bord terugspringen naar het begin en zou de planning die eraan hangt niet meer kloppen met de
 * kolom. De historie weet waar hij vandaan kwam, dus daar hoeft geen kolom voor bij.
 */
async function vorigeSubstatus(supabase: ReturnType<typeof createAdminClient>, dossierId: string) {
  const { data } = await supabase
    .from('dossier_substatus_historie')
    .select('substatus, gewijzigd_op')
    .eq('dossier_id', dossierId)
    .order('gewijzigd_op', { ascending: false })
    .limit(20)

  const rijen = (data ?? []) as { substatus: string }[]
  // De eerste die géén mandaatverhoging is; meerdere verhogingen achter elkaar slaan we over.
  return rijen.find(r => r.substatus !== MANDAAT_VERHOGING)?.substatus ?? TERUGVAL_SUBSTATUS
}

/**
 * Vraagt een hoger mandaat aan bij de opdrachtgever.
 *
 * Zet de bon op de kolom "Mandaat verhoging aangevraagd" en legt het gevraagde bedrag met de
 * reden vast als dossiernotitie. Bewust géén losse taak erbij: de kolom op het bord ís het
 * werksignaal, en een taak zou hetzelfde nog een keer bijhouden op een tweede plek.
 */
export async function vraagMandaatverhogingAan(
  dossierId: string,
  invoer: { gevraagdBedrag: number; toelichting: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  await vereisRecht('servicedesk', 'schrijven')
  await assertDossierBewerkbaar(dossierId)

  const gecontroleerd = AanvraagSchema.safeParse(invoer)
  if (!gecontroleerd.success) {
    return { ok: false, error: gecontroleerd.error.issues[0]?.message ?? 'Ongeldige invoer.' }
  }
  const { gevraagdBedrag, toelichting } = gecontroleerd.data

  const supabase = createAdminClient()
  const { data: bon, error } = await supabase
    .from('dossiers')
    .select('mandaat_bedrag')
    .eq('id', dossierId)
    .maybeSingle()
  if (error) {
    await logFout(foutNaarInvoer(error, { omgeving: 'server', bron: 'servicedesk/mandaatverhoging' }))
    return { ok: false, error: 'Kon de bon niet lezen.' }
  }

  const huidig = bon?.mandaat_bedrag != null ? Number(bon.mandaat_bedrag) : null
  const van = huidig != null && huidig > 0 ? euro(huidig) : 'geen mandaat'

  const notitie = await plaatsDossierNotitie(
    dossierId,
    `Mandaatverhoging aangevraagd: van ${van} naar ${euro(gevraagdBedrag)}.\n\n${toelichting}`,
  )
  if (!notitie.ok) return notitie

  const gezet = await updateServicedeskSubstatus(dossierId, MANDAAT_VERHOGING)
  if (!gezet.ok) return { ok: false, error: gezet.error ?? 'Kon de status niet wijzigen.' }

  revalidatePath(`/servicedesk/${dossierId}/bon`)
  revalidatePath('/servicedesk')
  return { ok: true }
}

/**
 * Legt een toegekende verhoging vast: nieuw mandaat erop, en de bon terug naar waar hij was.
 *
 * Het nieuwe bedrag vervángt het oude en telt er niet bij op — dat is hoe een opdrachtgever het
 * ook formuleert ("het mandaat gaat naar €2.500"), en optellen zou bij een tweede verhoging een
 * bedrag opleveren dat nergens is afgesproken.
 */
export async function kenMandaatverhogingToe(
  dossierId: string,
  invoer: { nieuwMandaat: number; toelichting?: string },
): Promise<{ ok: true; substatus: string } | { ok: false; error: string }> {
  await vereisRecht('servicedesk', 'schrijven')
  await assertDossierBewerkbaar(dossierId)

  const gecontroleerd = ToekenningSchema.safeParse(invoer)
  if (!gecontroleerd.success) {
    return { ok: false, error: gecontroleerd.error.issues[0]?.message ?? 'Ongeldige invoer.' }
  }
  const { nieuwMandaat, toelichting } = gecontroleerd.data

  const supabase = createAdminClient()
  const terug = await vorigeSubstatus(supabase, dossierId)

  const { error } = await supabase
    .from('dossiers')
    .update({ mandaat_bedrag: nieuwMandaat })
    .eq('id', dossierId)
  if (error) {
    await logFout(foutNaarInvoer(error, { omgeving: 'server', bron: 'servicedesk/mandaat-toekennen' }))
    return { ok: false, error: 'Kon het mandaat niet opslaan.' }
  }

  const staart = toelichting?.trim() ? `\n\n${toelichting.trim()}` : ''
  // Mislukt de notitie, dan staat het nieuwe mandaat er al. Dat is de juiste volgorde: het bedrag
  // is wat telt, de notitie is de toelichting erbij.
  const notitie = await plaatsDossierNotitie(
    dossierId,
    `Mandaatverhoging toegekend: nieuw mandaat ${euro(nieuwMandaat)}.${staart}`,
  )
  if (!notitie.ok) {
    await logFout(foutNaarInvoer(new Error(notitie.error), {
      omgeving: 'server', bron: 'servicedesk/mandaat-toekennen',
    }))
  }

  const gezet = await updateServicedeskSubstatus(dossierId, terug)
  if (!gezet.ok) return { ok: false, error: gezet.error ?? 'Kon de status niet wijzigen.' }

  revalidatePath(`/servicedesk/${dossierId}/bon`)
  revalidatePath('/servicedesk')
  return { ok: true, substatus: terug }
}
