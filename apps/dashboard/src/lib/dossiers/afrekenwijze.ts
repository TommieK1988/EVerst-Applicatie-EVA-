'use server'

/**
 * dossiers/afrekenwijze.ts — de schakelaar "Regieopdracht" op de Verkoop-tab van een opdracht.
 *
 * Een opdracht rekent af tegen een aanneemsom (via de termijnstaat) óf op regie (nacalculatie van
 * alles wat geboekt is). Nooit allebei: het is één kolom, `dossiers.facturatiemethode`, en pas
 * met `facturatiemethode_handmatig` erbij telt hij op een opdracht mee (zie `opRegie()`).
 *
 * Servicedeskbonnen hebben hun eigen schakelaar op de Informatie-tab
 * (`updateServicedeskInstellingen`); deze actie weigert ze, zodat de RW01/AW01-logica van de bon
 * niet via een tweede deur wordt aangesproken.
 *
 * WAT ER BIJ HET OMZETTEN GEBEURT
 *   → regie:      aanneemsom in Bouw7 op 0, `bedrag_excl_btw` leeg, de cron-retry van de
 *                 aanneemsom uit. Heeft de opdracht nog geen enkele bewakingscode, dan komt er
 *                 opvangcode RW01 bij, anders valt er nergens op te boeken.
 *   → aangenomen: de aanneemsom van de EVA-offerte gaat weer naar Bouw7.
 * Mislukt de Bouw7-write, dan blijft de keuze in EVA staan en komt er een waarschuwing — zelfde
 * afweging als bij de servicedesk-schakelaar.
 *
 * OP SLOT NA DE EERSTE FACTUUR. Een verstuurde factuur volgt de afrekenwijze van dat moment;
 * omzetten zou de grondslag onder wat al gefactureerd is weghalen.
 */

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@everts/database/server'
import { vereisRecht } from '@/lib/auth/rechten'
import { schrijfBouw7Aanneemsom } from '@/lib/bouw7/project-velden'
import { ontmarkeerHandmatig } from '@/lib/bouw7/handmatige-velden'
import { isServicedeskDossier, opRegie, FACTURATIE_LABELS } from '@/components/dossiers/types'
import { assertDossierBewerkbaar } from './guards'
import { getBewakingscodesVoorUurlog, getDossierVerkoop, stuurAanneemsomNaarBouw7 } from './actions'
import { zorgVoorBonBewakingscode } from './bon-bewakingscode'
import { AFREKENWIJZE_VELDEN } from './regie-opdracht'

export type AfrekenwijzeStand = {
  regie: boolean
  mandaat: number | null
  /** Waarom de schakelaar op slot staat; null = hij mag om. */
  slot: string | null
  /** Aantal termijnen in de termijnstaat: daar vraagt het scherm eerst een bevestiging voor. */
  aantalTermijnen: number
}

type Rij = {
  id: string
  bouw7_id: string | null
  mandaat_bedrag: number | null
  facturatiemethode: string | null
  facturatiemethode_handmatig: boolean | null
  bouw7_categorie_naam: string | null
  servicedesk_substatus: string | null
}

async function leesRij(dossierId: string): Promise<Rij | null> {
  const { data } = await createAdminClient()
    .from('dossiers')
    .select(`id, bouw7_id, mandaat_bedrag, ${AFREKENWIJZE_VELDEN}`)
    .eq('id', dossierId)
    .maybeSingle()
  return data as Rij | null
}

/** Is er al iets gefactureerd? Bouw7-verkoopfacturen én afgeboekte regiefactuurregels. */
async function slotReden(dossierId: string, aantalFacturen: number): Promise<string | null> {
  if (aantalFacturen > 0) {
    return `Er ${aantalFacturen === 1 ? 'is al een verkoopfactuur' : `zijn al ${aantalFacturen} verkoopfacturen`} — de afrekenwijze ligt daarmee vast.`
  }
  const { count } = await createAdminClient()
    .from('regie_factuurregels')
    .select('id', { count: 'exact', head: true })
    .eq('dossier_id', dossierId)
    .not('bouw7_invoice_id', 'is', null)
  return (count ?? 0) > 0 ? 'Er is al regiewerk gefactureerd — de afrekenwijze ligt daarmee vast.' : null
}

export async function getAfrekenwijzeStand(dossierId: string): Promise<AfrekenwijzeStand | null> {
  await vereisRecht('financieel', 'lezen')
  const d = await leesRij(dossierId)
  if (!d || isServicedeskDossier(d) || d.servicedesk_substatus != null) return null
  const verkoop = await getDossierVerkoop(dossierId).catch(() => null)
  return {
    regie: opRegie(d),
    mandaat: d.mandaat_bedrag != null ? Number(d.mandaat_bedrag) : null,
    slot: await slotReden(dossierId, verkoop?.facturen.length ?? 0),
    aantalTermijnen: verkoop?.termijnen.length ?? 0,
  }
}

export type AfrekenwijzeResultaat =
  | { ok: true; waarschuwing?: string }
  | { ok: false; error: string }

export async function zetAfrekenwijzeOpdracht(
  dossierId: string,
  invoer: { regie: boolean; mandaat?: number | null },
): Promise<AfrekenwijzeResultaat> {
  const { medewerker } = await vereisRecht('financieel', 'schrijven')
  await assertDossierBewerkbaar(dossierId)

  const d = await leesRij(dossierId)
  if (!d) return { ok: false, error: 'Dossier niet gevonden.' }
  if (isServicedeskDossier(d) || d.servicedesk_substatus != null) {
    return { ok: false, error: 'Een servicedeskbon zet je om op de Informatie-tab.' }
  }
  const mandaat = invoer.regie && invoer.mandaat != null && invoer.mandaat > 0
    ? Math.round(invoer.mandaat * 100) / 100
    : null

  const wasRegie = opRegie(d)
  const methodeWijzigt = wasRegie !== invoer.regie
  if (methodeWijzigt) {
    const verkoop = await getDossierVerkoop(dossierId).catch(() => null)
    const slot = await slotReden(dossierId, verkoop?.facturen.length ?? 0)
    if (slot) return { ok: false, error: slot }
  }

  const supabase = createAdminClient()
  const { error } = await supabase.from('dossiers').update({
    facturatiemethode: invoer.regie ? 'regie' : 'termijnen',
    facturatiemethode_handmatig: true,
    mandaat_bedrag: mandaat,
    // Op regie is er geen aanneemsom; kaart en lijst lezen dit veld.
    ...(invoer.regie && methodeWijzigt ? { bedrag_excl_btw: null, bedrag_incl_btw: null } : {}),
  }).eq('id', dossierId)
  if (error) return { ok: false, error: error.message }

  const waarschuwingen: string[] = []
  if (methodeWijzigt && invoer.regie) {
    // Geen aanneemsom meer laten terugschrijven door de cron-retry.
    await ontmarkeerHandmatig(supabase, 'dossiers', dossierId, ['aanneemsom']).catch(() => {})
    if (d.bouw7_id) {
      const res = await schrijfBouw7Aanneemsom(d.bouw7_id, 0)
      if (!res.ok) waarschuwingen.push(`De aanneemsom in Bouw7 kon niet op nul (${res.error}).`)
      // Zonder één bewakingscode valt er niets te boeken, dus ook niets te factureren.
      const codes = await getBewakingscodesVoorUurlog(dossierId).catch(() => null)
      if (codes && codes.length === 0) {
        const code = await zorgVoorBonBewakingscode(dossierId, { regieOpdracht: true })
        if (!code.ok) waarschuwingen.push(code.error)
        else if ('waarschuwing' in code && code.waarschuwing) waarschuwingen.push(code.waarschuwing)
      }
    }
  } else if (methodeWijzigt && d.bouw7_id) {
    const res = await stuurAanneemsomNaarBouw7(dossierId)
    if (!res.ok) waarschuwingen.push(`De aanneemsom kon niet naar Bouw7 (${res.error}).`)
  }

  if (methodeWijzigt) {
    const naam = [medewerker.voornaam, medewerker.tussenvoegsel, medewerker.achternaam].filter(Boolean).join(' ')
    const label = FACTURATIE_LABELS[invoer.regie ? 'regie' : 'termijnen']
    await supabase.from('dossier_notities').insert({
      dossier_id: dossierId,
      medewerker_id: medewerker.id,
      inhoud: `Afrekenwijze gewijzigd naar ${label}${naam ? ` door ${naam}` : ''}.`
        + (mandaat != null ? ` Mandaat € ${mandaat.toFixed(2).replace('.', ',')}.` : ''),
    })
  }

  revalidatePath(`/opdrachten/${dossierId}`, 'layout')
  return waarschuwingen.length ? { ok: true, waarschuwing: waarschuwingen.join(' ') } : { ok: true }
}
