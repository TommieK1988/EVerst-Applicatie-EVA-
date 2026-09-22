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
import { standNaToewijzing, volgendeStap } from '@/components/dossiers/servicedesk/status-stappen'
import { isMutatieDossier, type ServicedeskSubstatus } from '@/components/dossiers/types'

const MANDAAT_VERHOGING = 'mandaat_verhoging'

/**
 * Zet de bon een stap verder, en alleen de stap die uit zijn huidige stand volgt.
 *
 * De overgang wordt hier opnieuw bepaald in plaats van overgenomen van de client. Een tabblad
 * dat een half uur openstond kent de stand van toen; zou het de doelstatus meesturen, dan kon
 * een klik op "Gereedmelden" een bon overschrijven die inmiddels al gefactureerd is. Dit is ook
 * de enige plek in de servicedeskstroom waar een statusovergang wordt gecontroleerd in plaats
 * van aangenomen — zie DEVELOPMENT_STANDARDS 6.1.
 */
export async function zetVolgendeStap(
  dossierId: string,
): Promise<{ ok: true; naar: string; label: string } | { ok: false; error: string }> {
  await vereisRecht('servicedesk', 'schrijven')
  await assertDossierBewerkbaar(dossierId)

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('dossiers')
    .select('servicedesk_substatus')
    .eq('id', dossierId)
    .maybeSingle()
  if (error) {
    await logFout(foutNaarInvoer(error, { omgeving: 'server', bron: 'servicedesk/volgende-stap' }))
    return { ok: false, error: 'Kon de bon niet lezen.' }
  }

  const stap = volgendeStap(data?.servicedesk_substatus as ServicedeskSubstatus | null)
  if (!stap) {
    return { ok: false, error: 'Vanuit deze stand is er geen vaste vervolgstap. Ververs de pagina.' }
  }

  const gezet = await updateServicedeskSubstatus(dossierId, stap.naar)
  if (!gezet.ok) return { ok: false, error: gezet.error ?? 'Kon de status niet wijzigen.' }

  revalidatePath(`/servicedesk/${dossierId}/bon`)
  revalidatePath('/servicedesk')
  return { ok: true, naar: stap.naar, label: stap.label }
}

/**
 * Schuift een servicedeskbon door zodra het werk aan iemand is toegewezen.
 *
 * Aangeroepen vanuit het versturen van een bestelling en het aanmaken van een planitem — dus
 * vanuit de dáád, niet vanuit een knop. Iemand die op "Onderaannemerscontract maken" klikt en
 * halverwege stopt heeft niets uitgezet; de kolom hoort dan niet te verschuiven.
 *
 * **Fail-soft en zonder rechtencheck.** De aanroeper heeft zijn eigen poortwachter al gepasseerd
 * (bestellen en plannen hebben hun eigen rechten) en heeft op dit punt al echt iets gedaan: de
 * opdracht is gemaild, het planitem staat er. Een mislukte statuswissel mag dat niet alsnog als
 * fout laten eindigen — de bon staat dan gewoon nog op zijn oude kolom en is met de hand te
 * verslepen. Hij wordt wel gelogd, want stil verdwijnen is erger dan een verkeerde kolom.
 */
export async function meldWerkToegewezen(
  dossierId: string,
  soort: 'uitgezet' | 'ingepland',
): Promise<void> {
  try {
    const supabase = createAdminClient()
    const { data } = await supabase
      .from('dossiers')
      .select('servicedesk_substatus, bouw7_categorie_naam, categorie')
      .eq('id', dossierId)
      .maybeSingle()

    // Geen servicedeskbon: dan heeft deze kolom er niets te zoeken. Opdrachten hebben hun
    // eigen statusladder en die wordt hier niet aangeraakt.
    if (!data?.servicedesk_substatus) return

    const naar = standNaToewijzing(soort, {
      isMutatie: isMutatieDossier(data),
      substatus: data.servicedesk_substatus as ServicedeskSubstatus,
    })
    if (!naar) return

    await updateServicedeskSubstatus(dossierId, naar)
    revalidatePath('/servicedesk')
  } catch (e) {
    await logFout(foutNaarInvoer(e, { omgeving: 'server', bron: 'servicedesk/werk-toegewezen' }))
  }
}

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
