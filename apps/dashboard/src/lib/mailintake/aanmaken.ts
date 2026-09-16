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
import { uploadBuffersNaarDossierMap } from '@/lib/o365/dossier-map'

import type { GekeurdeVelden } from './extractie'
import { planNabehandeling, voerNabehandelingUit } from './nabehandeling'

export interface AanmaakInvoer {
  berichtId: string
  relatieId: string
  contactpersoonId: string | null
  velden: GekeurdeVelden
  /** Het vastgoedobject bij dit werkadres; alleen gevuld bij een eenduidige treffer. */
  objectId?: string | null
  /** De (eventueel bijgeschaafde) scope-samenvatting uit het behandelscherm. */
  gevraagdeWerkzaamheden?: string | null
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
 * Zet de bijlagen van een bericht in de SharePoint-dossiermap.
 *
 * Loopt via `uploadBuffersNaarDossierMap` uit lib/o365/dossier-map: dat is
 * app-only Graph en vraagt dus géén ingelogde medewerker. Daardoor werkt dit
 * zowel vanuit het behandelscherm als vanuit de cron — anders dan
 * `uploadDossierBestandenNaarSharePoint`, dat een sessie eist.
 *
 * Twee dingen die bewust zo zijn:
 *
 * - **De ontvangstdatum komt voor de bestandsnaam.** Een upload naar SharePoint
 *   is een PUT: een tweede "opdrachtbon.pdf" zou de eerste zonder waarschuwing
 *   overschrijven. Met "2026-09-09 opdrachtbon.pdf" blijven ze naast elkaar
 *   staan en zie je meteen bij welke mail iets hoort.
 * - **In stukken van ~20 MB.** Alle bijlagen tegelijk in het geheugen laden gaat
 *   bij een paar grote PDF's mis op Vercel.
 *
 * Gooit nooit. Wat niet lukt houdt `naar_sharepoint_op` leeg en wordt door de
 * bewakingscron opnieuw geprobeerd — het dossier bestaat dan al, en dat mag hier
 * niet op sneuvelen.
 */
export async function zetBijlagenInSharePoint(
  berichtId: string,
  dossierId: string,
): Promise<{ geuploaded: number; mislukt: number; fout: string | null }> {
  const supabase = createAdminClient()

  const { data: bericht } = await supabase
    .from('mailintake_berichten').select('ontvangen_op').eq('id', berichtId).maybeSingle()
  const datum = (bericht?.ontvangen_op ?? new Date().toISOString()).slice(0, 10)

  const { data: rijen } = await supabase
    .from('mailintake_bijlagen')
    .select('id, bestandsnaam, content_type, opslag_pad, grootte_bytes')
    .eq('bericht_id', berichtId)
    .eq('is_inline', false)
    .not('opslag_pad', 'is', null)
    .is('naar_sharepoint_op', null)
    .limit(50)

  if (!rijen?.length) return { geuploaded: 0, mislukt: 0, fout: null }

  const RUIMTE = 20 * 1024 * 1024
  let geuploaded = 0
  let mislukt = 0
  const fouten: string[] = []

  let stapel: { rij: any; naam: string; contentType: string; bytes: Uint8Array }[] = []
  let stapelBytes = 0

  const legStapelWeg = async () => {
    if (!stapel.length) return
    const res = await uploadBuffersNaarDossierMap(
      dossierId,
      stapel.map(b => ({ naam: b.naam, contentType: b.contentType, bytes: b.bytes })),
    )
    // `bestanden` bevat alleen de geslaagde uploads; wat er niet in staat is mislukt
    // en blijft dus openstaan voor de bewakingscron.
    const perNaam = new Map((res.bestanden ?? []).map(x => [x.naam, x]))
    for (const b of stapel) {
      const geplaatst = perNaam.get(b.naam)
      if (geplaatst) {
        await supabase.from('mailintake_bijlagen').update({
          naar_sharepoint_op: new Date().toISOString(),
          sharepoint_item_id: geplaatst.itemId,
        }).eq('id', b.rij.id)
        geuploaded++
      } else {
        mislukt++
      }
    }
    if (res.fout) fouten.push(res.fout)
    stapel = []
    stapelBytes = 0
  }

  for (const r of rijen) {
    // De query filtert hier al op, maar het pad is in het schema nullable; zonder
    // deze controle zou een lege waarde stil als "undefined" naar Storage gaan.
    if (!r.opslag_pad) { mislukt++; continue }
    try {
      const { data: blob, error } = await supabase.storage.from('mail-intake').download(r.opslag_pad)
      if (error || !blob) { mislukt++; continue }
      const bytes = new Uint8Array(await blob.arrayBuffer())

      if (stapelBytes + bytes.length > RUIMTE) await legStapelWeg()

      stapel.push({
        rij: r,
        naam: `${datum} ${r.bestandsnaam}`,
        contentType: r.content_type ?? 'application/octet-stream',
        bytes,
      })
      stapelBytes += bytes.length
    } catch (e) {
      mislukt++
      fouten.push(`${r.bestandsnaam}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  await legStapelWeg()

  if (geuploaded || mislukt) {
    await supabase.from('mailintake_besluiten').insert({
      bericht_id: berichtId, actor: 'systeem', actie: 'bijlagen_naar_sharepoint',
      details: { dossier_id: dossierId, geuploaded, mislukt, fouten: fouten.slice(0, 5) },
    })
  }

  return { geuploaded, mislukt, fout: fouten.length ? fouten.join('; ').slice(0, 500) : null }
}

/**
 * Maakt het dossier aan en koppelt alles terug aan het bericht.
 *
 * De Bouw7-push zit in `maakAanvraag` en is synchroon. Faalt die, dan bestaat het
 * EVA-dossier wél — dat is bestaand gedrag en bewust: liever een dossier zonder
 * Bouw7-nummer dan een verloren aanvraag. Het komt terug in `bouw7Ok`.
 */
export async function maakDossierUitBericht(inv: AanmaakInvoer): Promise<AanmaakResultaat> {
  const supabase = createAdminClient()
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
    // Koppelt het dossier meteen onder het juiste complex/pand, zoals de
    // aanvraagmodal dat doet via de objectkiezer.
    object_id: inv.objectId ?? null,
  })

  if (!res.ok) return { ok: false, error: res.error }

  const dossierId = res.data.id

  // De scope-samenvatting hoort bij het dossier, niet bij het bericht: dit is wat
  // een calculator als eerste leest. Valt terug op wat er bij de intake is
  // opgesteld als de behandelaar hem niet heeft aangepast.
  await zetWerkzaamhedenOpDossier(dossierId, inv.berichtId, inv.gevraagdeWerkzaamheden ?? null).catch(() => {})

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

  // De bijlagen horen bij het dossier, niet bij de mailbox. Best-effort: mislukt
  // dit, dan blijft het dossier gewoon staan en probeert de bewakingscron opnieuw.
  await zetBijlagenInSharePoint(inv.berichtId, dossierId).catch(() => {})

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
  const supabase = createAdminClient()

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

  // Ook bij koppelen: de opdrachtbon hoort in het dossier terecht te komen, niet
  // alleen in de mailbox. Dat is juist bij deze route de reden dat iemand koppelt.
  await zetBijlagenInSharePoint(berichtId, dossierId).catch(() => {})

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

  const supabase = createAdminClient()
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
  const supabase = createAdminClient()
  const { data: d } = await supabase
    .from('dossiers')
    .select('titel, calculator_id, werkvoorbereider_id, project_manager_id, klant:relaties!dossiers_klant_id_fkey(naam)')
    .eq('id', dossierId)
    .maybeSingle()
  if (!d) return

  const rolIds = [d.calculator_id, d.werkvoorbereider_id, d.project_manager_id]
    .filter((x): x is string => Boolean(x))
  if (!rolIds.length) return

  const { data: mw } = await supabase
    .from('medewerkers').select('auth_user_id').in('id', rolIds)
    .eq('actief', true).not('auth_user_id', 'is', null).limit(10)

  for (const m of mw ?? []) {
    // `.not('auth_user_id','is',null)` staat in de query, maar het schema kent het
    // veld als nullable -- en een notificatie zonder gebruiker landt nergens.
    if (!m.auth_user_id) continue
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

/**
 * Zet de scope-samenvatting op het dossier, met een leesbare herkomstregel.
 *
 * `tekst` is wat er in het behandelscherm stond op het moment van aanmaken —
 * inclusief eventuele aanscherpingen van de behandelaar. Is die leeg, dan valt
 * hij terug op wat EVA bij de intake opstelde.
 */
async function zetWerkzaamhedenOpDossier(
  dossierId: string,
  berichtId: string,
  tekst: string | null,
): Promise<void> {
  const supabase = createAdminClient()

  const { data: b } = await supabase
    .from('mailintake_berichten')
    .select('gevraagde_werkzaamheden, gevraagde_werkzaamheden_bronnen, gevraagde_werkzaamheden_gemist')
    .eq('id', berichtId)
    .maybeSingle()

  const definitief = (tekst ?? '').trim() || (b?.gevraagde_werkzaamheden ?? '').trim()
  if (!definitief) return

  const { herkomstregel } = await import('./werkzaamheden')
  const bronnen: string[] = b?.gevraagde_werkzaamheden_bronnen ?? []
  const gemist: string[] = b?.gevraagde_werkzaamheden_gemist ?? []
  const herkomst = herkomstregel(bronnen, 'mail') +
    (gemist.length ? ` Niet meegelezen: ${gemist.join(', ')}.` : '')

  await supabase.from('dossiers').update({
    gevraagde_werkzaamheden: definitief,
    gevraagde_werkzaamheden_bron: herkomst,
    gevraagde_werkzaamheden_op: new Date().toISOString(),
  }).eq('id', dossierId)
}
