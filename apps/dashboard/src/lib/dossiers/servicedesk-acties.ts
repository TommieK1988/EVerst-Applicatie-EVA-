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
import { vereisRecht, getCurrentMedewerker } from '@/lib/auth/rechten'
import { logFout, foutNaarInvoer } from '@/lib/fouten/log'
import { assertDossierBewerkbaar } from './guards'
import { plaatsDossierNotitie } from './notities-actions'
import { updateServicedeskSubstatus } from './actions'
import { standNaToewijzing, volgendeStap } from '@/components/dossiers/servicedesk/status-stappen'
import { isMutatieDossier, type ServicedeskSubstatus } from '@/components/dossiers/types'
import { getMailSjabloonTekst } from '@/lib/mail/sjabloon-bron'
import { mailTekstNaarHtml } from '@/lib/mail/opmaak'
import { splitsAdressen, verstuurMetOmleiding } from '@/lib/mail/verstuur'

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

const MailSchema = z.object({
  to: z.string().trim().min(1, 'Vul een e-mailadres in.').max(2000),
  cc: z.string().trim().max(2000).optional(),
  onderwerp: z.string().trim().min(1, 'Vul een onderwerp in.').max(300),
  bericht: z.string().trim().min(1, 'De mail is leeg.').max(20_000),
})

export type MandaatMail = z.infer<typeof MailSchema>

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

export type MandaatMailConcept = {
  /** Voorgestelde ontvanger: de contactpersoon van de bon, anders het algemene adres. */
  to: string
  /** Sjabloontekst met {plaatshouders}; het venster vult ze, omdat bedrag en toelichting daar ontstaan. */
  onderwerp: string
  tekst: string
  /** Alles wat de server al weet. `mandaat.gevraagd` en `toelichting` vult het venster zelf aan. */
  vars: Record<string, string>
}

/**
 * Het concept voor de mail aan de opdrachtgever.
 *
 * Geeft het sjabloon ongevuld terug in plaats van een kant-en-klare tekst: het gevraagde bedrag en de
 * toelichting typt de gebruiker pas in het venster, en de mail moet meelopen zolang hij hem niet zelf
 * heeft aangepast.
 */
export async function getMandaatMailConcept(dossierId: string): Promise<MandaatMailConcept> {
  await vereisRecht('servicedesk', 'schrijven')
  const supabase = createAdminClient()

  const { data: d } = await supabase
    .from('dossiers')
    .select(`
      dossiernummer, titel, referentie, mandaat_bedrag,
      werkadres_straat, werkadres_huisnummer, werkadres_postcode, werkadres_stad,
      relaties!klant_id ( naam, email ),
      contactpersonen ( voornaam, tussenvoegsel, achternaam, email )
    `)
    .eq('id', dossierId)
    .maybeSingle()

  const cp = d?.contactpersonen
  const cpNaam = cp ? [cp.voornaam, cp.tussenvoegsel, cp.achternaam].filter(Boolean).join(' ') : ''
  const adres = (v: unknown) => (typeof v === 'string' && v.includes('@') ? v.trim() : '')
  const huidig = d?.mandaat_bedrag != null ? Number(d.mandaat_bedrag) : 0
  // LET OP: `werkadres_stad`, niet `werkadres_plaats` — met de verkeerde naam faalt de select stil.
  const werkadres = d
    ? [
        [d.werkadres_straat, d.werkadres_huisnummer].filter(Boolean).join(' '),
        [d.werkadres_postcode, d.werkadres_stad].filter(Boolean).join(' '),
      ].filter(Boolean).join(', ')
    : ''

  const bron = await getMailSjabloonTekst('mandaat_verhoging')
  return {
    to: adres(cp?.email) || adres(d?.relaties?.email),
    onderwerp: bron.onderwerp,
    tekst: bron.tekst,
    vars: {
      'aanhef': cpNaam ? `Geachte ${cpNaam},` : 'Geachte heer/mevrouw,',
      'dossier.nummer': d?.dossiernummer ?? '',
      'dossier.titel': d?.titel ?? '',
      'dossier.werkadres': werkadres,
      'dossier.referentie': d?.referentie ?? '',
      'klant.naam': d?.relaties?.naam ?? '',
      'mandaat.huidig': euro(huidig > 0 ? huidig : 0),
    },
  }
}

const FONT = "'Segoe UI',Segoe,Arial,Helvetica,sans-serif"

/**
 * Vraagt een hoger mandaat aan bij de opdrachtgever.
 *
 * Zet de bon op de kolom "Mandaat verhoging aangevraagd" en legt het gevraagde bedrag met de
 * reden vast als dossiernotitie. Bewust géén losse taak erbij: de kolom op het bord ís het
 * werksignaal, en een taak zou hetzelfde nog een keer bijhouden op een tweede plek.
 *
 * Met `mail` gaat het verzoek ook naar de opdrachtgever, namens de ingelogde medewerker. Dat gebeurt
 * **eerst**: mislukt de mail, dan blijft de bon staan waar hij stond en is het opnieuw te proberen.
 * Andersom zou de kolom "aangevraagd" zeggen over een verzoek dat nooit is aangekomen.
 */
export async function vraagMandaatverhogingAan(
  dossierId: string,
  invoer: { gevraagdBedrag: number; toelichting: string },
  mail?: MandaatMail,
): Promise<{ ok: true; gemaild: boolean } | { ok: false; error: string }> {
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

  let gemaildAan = ''
  if (mail) {
    const m = MailSchema.safeParse(mail)
    if (!m.success) return { ok: false, error: m.error.issues[0]?.message ?? 'Ongeldige mail.' }
    const to = splitsAdressen(m.data.to)
    if (to.length === 0) return { ok: false, error: 'Vul een e-mailadres in.' }

    const medewerker = await getCurrentMedewerker().catch(() => null)
    if (!medewerker) return { ok: false, error: 'Geen ingelogde medewerker gevonden om namens te versturen.' }

    try {
      await verstuurMetOmleiding(medewerker.id, {
        to,
        cc: splitsAdressen(m.data.cc),
        onderwerp: m.data.onderwerp,
        // De tekst is in het venster al gevuld; hier alleen nog alinea's en **vet** voor Outlook.
        bodyHtml:
          `<div style="font-family:${FONT};font-size:14px;line-height:1.55;color:#1f2933">` +
          mailTekstNaarHtml(m.data.bericht) +
          `</div>`,
      })
    } catch (e) {
      await logFout(foutNaarInvoer(e, { omgeving: 'server', bron: 'servicedesk/mandaatverhoging-mail' }))
      return { ok: false, error: `Mail versturen mislukt: ${e instanceof Error ? e.message : 'onbekende fout'}` }
    }
    gemaildAan = to.join(', ')
  }

  // Vanaf hier is de mail (als die er was) de deur uit. Wat nu nog misgaat mag niet lezen als
  // "opnieuw versturen", dus de melding zegt erbij dat de mail wél weg is.
  const alGemaild = gemaildAan ? ' De mail aan de opdrachtgever is wel verstuurd.' : ''

  const notitie = await plaatsDossierNotitie(
    dossierId,
    `Mandaatverhoging aangevraagd: van ${van} naar ${euro(gevraagdBedrag)}.` +
      (gemaildAan ? ` Gemaild aan ${gemaildAan}.` : '') +
      `\n\n${toelichting}`,
  )
  if (!notitie.ok) return { ok: false, error: notitie.error + alGemaild }

  const gezet = await updateServicedeskSubstatus(dossierId, MANDAAT_VERHOGING)
  if (!gezet.ok) return { ok: false, error: (gezet.error ?? 'Kon de status niet wijzigen.') + alGemaild }

  revalidatePath(`/servicedesk/${dossierId}/bon`)
  revalidatePath('/servicedesk')
  return { ok: true, gemaild: !!gemaildAan }
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
