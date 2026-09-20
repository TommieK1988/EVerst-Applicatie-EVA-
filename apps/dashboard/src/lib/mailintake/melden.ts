import 'server-only'
import { createAdminClient } from '@everts/database/server'

import { maakNotificatie } from '@/lib/notificaties/maak'

import { maakIntakeActie } from './taken'
import { postbusSoortVoorMail } from './regels'
import type { GekeurdeVelden } from './extractie'
import {
  AFZENDER_ONBEKEND, SOORT_ONZEKER, MAIL_SOORT_LABELS,
  type PostbusRij, type MailSoort,
} from './types'

/**
 * mailintake/melden.ts
 *
 * Waar een bericht heen gaat als EVA het niet zelf afmaakt: de actie voor de
 * behandelaar en de notificaties naar de postbus.
 *
 * Staat los van `verwerken.ts` omdat het een eigen onderwerp is -- niet "wat is
 * dit bericht" maar "wie moet er iets mee" -- en omdat dat bestand anders boven
 * de achthonderd regels uitkomt.
 */

/** Wie krijgt bericht over deze postbus? Levert auth-user-ids, niet medewerker-ids. */
async function ontvangers(postbus: PostbusRij): Promise<{ userId: string; medewerkerId: string }[]> {
  if (!postbus.notificatie_medewerkers.length) return []
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('medewerkers')
    .select('id, auth_user_id')
    .in('id', postbus.notificatie_medewerkers)
    .eq('actief', true)
    .not('auth_user_id', 'is', null)
    .limit(50)
  return (data ?? []).map((m: any) => ({ userId: m.auth_user_id, medewerkerId: m.id }))
}

export async function behandelaarVoorMail(postbus: PostbusRij, soort: MailSoort): Promise<string | null> {
  const doel = postbusSoortVoorMail(soort)
  if (!doel || doel === postbus.soort) return postbus.standaard_behandelaar_id

  const supabase = createAdminClient()
  const { data } = await supabase
    .from('mailintake_postbussen')
    .select('standaard_behandelaar_id')
    .eq('soort', doel)
    .limit(1)
    .maybeSingle()

  return data?.standaard_behandelaar_id ?? postbus.standaard_behandelaar_id
}

/**
 * Zet een actie klaar voor de standaard behandelaar van deze postbus.
 *
 * Dit is waar "bij twijfel voorleggen" pas echt landt. Zonder deze stap belandde
 * een voorgelegd bericht alleen in het postvak, en de controletaak ging naar de
 * calculator van het dossier -- een rol die bij een vers bericht nog leeg is.
 *
 * De tekst is de helft van het nut. Alleen "beoordeel deze mail" dwingt iemand om
 * eerst het hele bericht open te slaan voordat hij weet of het twee minuten of een
 * half uur kost. Daarom staat er in: waarom het is voorgelegd, wat EVA al heeft
 * ingevuld, wat er nog ontbreekt, en waar je het afhandelt.
 */
export async function voorleggen(
  postbus: PostbusRij,
  behandelaarId: string | null,
  berichtId: string,
  bericht: { onderwerp?: string | null; van_naam?: string | null; van_adres?: string | null; ontvangen_op?: string | null },
  redenen: string[],
  context?: { velden?: GekeurdeVelden; relatieNaam?: string | null; soort?: string | null },
): Promise<{ gemeldAan: string | null }> {
  if (!behandelaarId) return { gemeldAan: null }

  const afzender = bericht.van_naam || bericht.van_adres || 'onbekende afzender'
  const v = context?.velden

  const regels: string[] = []
  regels.push(redenen.length > 1 ? 'Waarom dit wordt voorgelegd:' : 'Waarom dit wordt voorgelegd:')
  for (const r of redenen.slice(0, 4)) regels.push(`- ${r}`)

  regels.push('')
  regels.push(`Van: ${afzender}${bericht.van_naam && bericht.van_adres ? ` <${bericht.van_adres}>` : ''}`)
  regels.push(`Onderwerp: ${bericht.onderwerp ?? '(geen onderwerp)'}`)
  if (context?.soort) regels.push(`EVA denkt: ${MAIL_SOORT_LABELS[context.soort as MailSoort] ?? context.soort}`)

  if (v) {
    const ingevuld: string[] = []
    const ontbreekt: string[] = []

    const noteer = (label: string, waarde: unknown, extra = '') => {
      if (waarde) ingevuld.push(`- ${label}: ${String(waarde)}${extra}`)
      else ontbreekt.push(`- ${label}`)
    }

    if (context.relatieNaam) ingevuld.push(`- Opdrachtgever: ${context.relatieNaam}`)
    else ontbreekt.push('- Opdrachtgever (kies of maak de relatie)')

    noteer('Werk', v.omschrijving)
    const adres = [v.werkadresStraat, v.werkadresHuisnummer].filter(Boolean).join(' ')
    noteer('Adres', adres && v.werkadresStad ? `${adres}, ${v.werkadresStad}` : adres || null,
      v.adresBevestigd ? '' : ' (niet bevestigd door PDOK)')
    noteer('Categorie', v.categorieNaam)
    if (v.deadline) {
      ingevuld.push(`- Deadline: ${v.deadline}${v.deadlineAfgeleid ? ' (afgeleid: aanvraagdatum + 4 weken)' : ''}`)
    }
    if (v.referentie) ingevuld.push(`- Referentie klant: ${v.referentie}`)
    if (v.opdrachtReferentie) ingevuld.push(`- Opdrachtreferentie: ${v.opdrachtReferentie}`)
    if (v.mandaatBedrag != null) ingevuld.push(`- Mandaat: ${v.mandaatBedrag}`)

    if (ingevuld.length) {
      regels.push('')
      regels.push('Dit heeft EVA al ingevuld:')
      regels.push(...ingevuld)
    }
    if (ontbreekt.length) {
      regels.push('')
      regels.push('Dit moet je zelf aanvullen of controleren:')
      regels.push(...ontbreekt)
    }
  }

  regels.push('')
  regels.push(`Afhandelen in EVA: /mailintake/${berichtId}`)

  const res = await maakIntakeActie({
    berichtId,
    medewerkerId: behandelaarId,
    titel: `Beoordeel ${postbus.naam.toLowerCase()} van ${afzender}`.slice(0, 200),
    toelichting: regels.join('\n'),
    dagen: 2,
  })

  // Een behandelaar zonder EVA-account krijgt de actie niet te zien. Dat mag niet
  // stil blijven: het beheerscherm waarschuwt ervoor, en hier blijft het spoor staan.
  if (res.zonderOntvanger && res.taakId) {
    const supabase = createAdminClient()
    await supabase.from('mailintake_besluiten').insert({
      bericht_id: berichtId, actor: 'systeem', actie: 'actie_zonder_ontvanger',
      details: { taak_id: res.taakId, behandelaar: res.toegewezenAan },
    })
  }

  // De actie heeft de behandelaar zelf al een melding opgeleverd. `meldVoorgelegd`
  // hoort hem daarom over te slaan: de behandelaar staat meestal óók in de
  // notificatielijst van de postbus, en kreeg dan twee belletjes over één bericht.
  const gemeld = !res.bestond && !res.zonderOntvanger
  return { gemeldAan: gemeld ? behandelaarId : null }
}

/** Notificaties bij een bericht dat is voorgelegd. */
export async function meldVoorgelegd(
  postbus: PostbusRij,
  berichtId: string,
  bericht: any,
  afzenderScore: number,
  soortVertrouwen: number,
  status: string,
  /** Medewerker die via `voorleggen` al een melding kreeg; die slaan we over. */
  alGemeldAan?: string | null,
): Promise<void> {
  if (status === 'geen_aanvraag') return // geen ruis over ruis
  const wie = (await ontvangers(postbus)).filter(w => w.medewerkerId !== alGemeldAan)
  if (!wie.length) return

  const afzender = bericht.van_naam || bericht.van_adres || 'onbekende afzender'
  let type = 'mailintake_nieuw_te_behandelen'
  let titel = `Nieuwe ${postbus.naam.toLowerCase()} van ${afzender}`

  if (afzenderScore < AFZENDER_ONBEKEND) {
    type = 'mailintake_onbekende_klant'
    titel = `Onbekende afzender: ${bericht.van_adres ?? afzender}`
  } else if (soortVertrouwen < SOORT_ONZEKER) {
    type = 'mailintake_twijfel_soort'
    titel = `Mail van ${afzender} — EVA weet niet wat dit is`
  }

  for (const w of wie) {
    await maakNotificatie({
      user_id: w.userId,
      type,
      titel,
      body: (bericht.onderwerp ?? '').slice(0, 160) || null,
      url: `/mailintake/${berichtId}`,
    })
  }
}
