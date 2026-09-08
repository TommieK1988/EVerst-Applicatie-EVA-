/**
 * mailintake/aanmaken.ts
 *
 * Van een beoordeeld bericht naar een echt dossier. Gedeeld door de automatische
 * route (cron) en de handmatige route (behandelscherm), zodat er maar één plek is
 * waar de koppeling, de bijlagen en het besluitenlog worden bijgewerkt.
 *
 * Waarom hier geen `vereisRecht` staat: dit is een bibliotheekmodule, geen
 * server action. De rechtencontrole hoort bij de ingang — `actions.ts` doet hem
 * voor de knop, de cron heeft geen gebruiker. Wie deze functie ergens anders
 * aanroept, moet die controle zelf al hebben gedaan.
 */

import 'server-only'
import { createAdminClient } from '@everts/database/server'

import { maakNotificatie } from '@/lib/notificaties/maak'

import type { GekeurdeVelden } from './extractie'
import { planNabehandeling, voerNabehandelingUit } from './nabehandeling'

export interface AanmaakInvoer {
  berichtId: string
  relatieId: string
  contactpersoonId: string | null
  velden: GekeurdeVelden
  /** true = door de cron, zonder mens. Bepaalt de melding en de controletaak. */
  automatisch: boolean
  /** De medewerker die op de knop drukte; null bij de cron. */
  medewerkerId: string | null
}

export type AanmaakResultaat =
  | { ok: true; dossierId: string; dossiernummer: string | null; bouw7Ok: boolean; bouw7Fout?: string }
  | { ok: false; error: string }

/** Projectnaam zoals de aanvraagmodal hem samenstelt: "{Straat huisnr}, {Stad} - {Omschrijving}". */
export function bouwTitel(v: GekeurdeVelden): string {
  const adres = [v.werkadresStraat, v.werkadresHuisnummer].filter(Boolean).join(' ').trim()
  const kop = [adres, v.werkadresStad].filter(Boolean).join(', ')
  const omschrijving = (v.omschrijving ?? '').trim()
  if (kop && omschrijving) return `${kop} - ${omschrijving}`
  return omschrijving || kop || 'Aanvraag uit e-mail'
}

/**
 * Maakt het dossier aan en koppelt alles terug aan het bericht.
 *
 * De Bouw7-push zit in `maakAanvraag` en is synchroon. Faalt die, dan bestaat het
 * EVA-dossier wél — dat is bestaand gedrag en bewust: liever een dossier zonder
 * Bouw7-nummer dan een verloren aanvraag. Het komt terug in `bouw7Ok`.
 */
export async function maakDossierUitBericht(inv: AanmaakInvoer): Promise<AanmaakResultaat> {
  const supabase = createAdminClient() as any
  const v = inv.velden

  const { maakAanvraag } = await import('@/lib/dossiers/actions')
  const res = await maakAanvraag({
    titel: bouwTitel(v),
    klant_id: inv.relatieId,
    contactpersoon_id: inv.contactpersoonId,
    categorie: v.categorieNaam,
    bouw7_categorie_id: v.bouw7CategorieId,
    referentie: v.referentie,
    werkmaatschappij_id: v.werkmaatschappijId,
    vve_code: v.vveCode,
    aanvraagdatum: v.aanvraagdatum,
    deadline: v.deadline,
    opmerkingen: v.opmerkingen,
    werkadres_straat: v.werkadresStraat,
    werkadres_huisnummer: v.werkadresHuisnummer,
    werkadres_postcode: v.werkadresPostcode,
    werkadres_stad: v.werkadresStad,
  })

  if (!res.ok) return { ok: false, error: res.error }

  const dossierId = res.data.id

  // Herkomst vastleggen. Dit is wat de nacontroles later leesbaar maakt:
  // "welke dossiers komen uit mail, en hoeveel daarvan zijn achteraf vervallen?"
  await supabase.from('dossiers').update({ mailintake_bericht_id: inv.berichtId }).eq('id', dossierId)

  await supabase.from('mailintake_berichten').update({
    status: 'verwerkt',
    besluit: inv.automatisch ? 'automatisch_aangemaakt' : 'handmatig_aangemaakt',
    dossier_id: dossierId,
    relatie_id: inv.relatieId,
    contactpersoon_id: inv.contactpersoonId,
    behandeld_door: inv.medewerkerId,
    behandeld_op: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', inv.berichtId)

  await supabase.from('mailintake_besluiten').insert({
    bericht_id: inv.berichtId,
    actor: inv.automatisch ? 'systeem' : 'medewerker',
    medewerker_id: inv.medewerkerId,
    actie: 'dossier_aangemaakt',
    details: {
      dossier_id: dossierId,
      dossiernummer: res.data.dossiernummer,
      bouw7_ok: res.bouw7.ok,
      bouw7_fout: res.bouw7.error ?? null,
      automatisch: inv.automatisch,
    },
  })

  // Bij een automatisch dossier hoort altijd een mens die er nog naar kijkt.
  if (inv.automatisch) {
    await zetControletaak(dossierId, res.data.dossiernummer ?? null).catch(() => {})
    await meldAutomatischAangemaakt(dossierId, inv.berichtId, res.data.dossiernummer ?? null).catch(() => {})
  }

  // De mail mag nu uit het zicht (§ nabehandeling).
  await planNabehandeling(inv.berichtId)
  await voerNabehandelingUit(inv.berichtId).catch(() => {})

  return {
    ok: true,
    dossierId,
    dossiernummer: res.data.dossiernummer ?? null,
    bouw7Ok: res.bouw7.ok,
    bouw7Fout: res.bouw7.error,
  }
}

/** Koppelt het bericht aan een bestaand dossier zonder iets nieuws te maken. */
export async function koppelAanDossier(
  berichtId: string,
  dossierId: string,
  medewerkerId: string | null,
  besluit: 'gekoppeld_bestaand' | 'meerwerk' | 'offerte_gewonnen' = 'gekoppeld_bestaand',
): Promise<void> {
  const supabase = createAdminClient() as any

  await supabase.from('mailintake_berichten').update({
    status: 'verwerkt',
    besluit,
    dossier_id: dossierId,
    behandeld_door: medewerkerId,
    behandeld_op: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', berichtId)

  await supabase.from('mailintake_duplicaat_kandidaten')
    .update({ gekozen: true }).eq('bericht_id', berichtId).eq('dossier_id', dossierId)

  await supabase.from('mailintake_besluiten').insert({
    bericht_id: berichtId, actor: medewerkerId ? 'medewerker' : 'systeem',
    medewerker_id: medewerkerId, actie: 'gekoppeld', details: { dossier_id: dossierId, besluit },
  })

  await planNabehandeling(berichtId)
  await voerNabehandelingUit(berichtId).catch(() => {})
}

/**
 * Legt vast dat dit adres bij deze relatie hoort. Dit is het leergeheugen: elke
 * handmatige keuze in fase 1 maakt de herkenning in fase 2 een stuk sterker.
 */
export async function onthoudAlias(opts: {
  adres: string | null
  relatieId: string
  contactpersoonId: string | null
  medewerkerId: string | null
}): Promise<void> {
  const adres = (opts.adres ?? '').trim().toLowerCase()
  if (!adres.includes('@')) return

  const supabase = createAdminClient() as any
  await supabase.from('mailintake_aliassen').upsert({
    patroon: adres,
    soort: 'koppel',
    relatie_id: opts.relatieId,
    contactpersoon_id: opts.contactpersoonId,
    aangemaakt_door: opts.medewerkerId,
    laatst_gebruikt_op: new Date().toISOString(),
  }, { onConflict: 'patroon', ignoreDuplicates: false })
}

// ─── Meldingen bij een automatisch dossier ───────────────────────────────────

async function zetControletaak(dossierId: string, dossiernummer: string | null): Promise<void> {
  const { maakTaak } = await import('@/app/(platform)/taken/actions/taken')
  await maakTaak({
    titel: `Controleer automatisch aangemaakt dossier${dossiernummer ? ` ${dossiernummer}` : ''}`,
    dossier_id: dossierId,
    assignee_type: 'dossier_rol',
    dossier_rollen: ['calculator'],
    deadline_basis: 'activatie',
    deadline_dagen: 1,
    prioriteit: 'normaal',
  })
}

/** Meldt het aan de rolhouders van het verse dossier. Nooit stil aanmaken. */
async function meldAutomatischAangemaakt(
  dossierId: string,
  berichtId: string,
  dossiernummer: string | null,
): Promise<void> {
  const supabase = createAdminClient() as any
  const { data: d } = await supabase
    .from('dossiers')
    .select('titel, calculator_id, werkvoorbereider_id, project_manager_id, klant:relaties!dossiers_klant_id_fkey(naam)')
    .eq('id', dossierId)
    .maybeSingle()
  if (!d) return

  const rolIds = [d.calculator_id, d.werkvoorbereider_id, d.project_manager_id].filter(Boolean)
  if (!rolIds.length) return

  const { data: mw } = await supabase
    .from('medewerkers').select('auth_user_id').in('id', rolIds)
    .eq('actief', true).not('auth_user_id', 'is', null).limit(10)

  for (const m of mw ?? []) {
    await maakNotificatie({
      user_id: m.auth_user_id,
      type: 'mailintake_automatisch_aangemaakt',
      titel: `Dossier ${dossiernummer ?? ''} automatisch aangemaakt uit e-mail`.replace('  ', ' '),
      body: `${d.klant?.naam ?? 'Onbekende klant'} — ${d.titel}. Controleer of dit klopt.`,
      url: `/mailintake/${berichtId}`,
      dossier_id: dossierId,
      dossier_naam: d.titel,
    })
  }
}
