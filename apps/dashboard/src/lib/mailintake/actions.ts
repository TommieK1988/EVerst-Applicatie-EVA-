'use server'

/**
 * mailintake/actions.ts
 *
 * De server actions achter het postvak en het behandelscherm.
 *
 * Alles hier begint met `vereisRecht('mailintake', ...)`. Deze module gebruikt de
 * service-role client, die RLS omzeilt; zonder die controle zou elke ingelogde
 * sessie — ook een klantportaal-gebruiker — bij de post van het bedrijf kunnen.
 *
 * Let op: in een 'use server'-module mag niets synchroons worden geëxporteerd.
 * Typen en constanten staan daarom in ./types en ./nabehandeling.
 */

import { createAdminClient } from '@everts/database/server'
import { revalidatePath } from 'next/cache'

import { vereisRecht, getCurrentMedewerker } from '@/lib/auth/rechten'
import { toetsPostbus } from '@/lib/o365/inbox'

import { maakDossierUitBericht, koppelAanDossier, onthoudAlias } from './aanmaken'
import { haalPostbusOp } from './ophalen'
import { verwerkBericht } from './verwerken'
import { maakWerkzaamhedenSamenvatting } from './werkzaamheden-uitvoeren'
import { voerNabehandelingUit, planNabehandeling } from './nabehandeling'
import type { GekeurdeVelden } from './extractie'
import type { PostbusPatch } from './types'

/** Kortlopende downloadlink voor één bijlage uit de privébucket. */
export async function getBijlageUrl(bijlageId: string): Promise<{ ok: boolean; url?: string; error?: string }> {
  await vereisRecht('mailintake', 'lezen')
  const supabase = createAdminClient()

  const { data: b } = await supabase
    .from('mailintake_bijlagen').select('opslag_pad, bestandsnaam').eq('id', bijlageId).maybeSingle()
  if (!b?.opslag_pad) return { ok: false, error: 'Deze bijlage is niet opgeslagen (te groot of niet gelukt).' }

  const { data, error } = await supabase.storage.from('mail-intake').createSignedUrl(b.opslag_pad, 300)
  if (error || !data?.signedUrl) return { ok: false, error: 'Kon geen downloadlink maken.' }
  return { ok: true, url: data.signedUrl }
}

// ─── Behandelen ───────────────────────────────────────────────────────────────

/**
 * Maakt een dossier aan vanuit het behandelscherm.
 *
 * De duplicaatcontrole is hier bewust géén blokkade: het scherm heeft de
 * kandidaten al getoond en de gebruiker heeft de bevestigingsdialoog gezien.
 * Wat we wél doen is vastleggen dát er een waarschuwing stond, zodat achteraf
 * te zien is hoe vaak er langs een terechte waarschuwing is gewerkt.
 */
export async function maakDossierVanBericht(
  berichtId: string,
  velden: GekeurdeVelden & {
    relatieId: string
    contactpersoonId: string | null
    objectId?: string | null
    gevraagdeWerkzaamheden?: string | null
  },
): Promise<{ ok: boolean; dossierId?: string; dossiernummer?: string | null; bouw7Ok?: boolean; bouw7Fout?: string; error?: string }> {
  const { medewerker } = await vereisRecht('mailintake', 'schrijven')
  const supabase = createAdminClient()

  const { data: bericht } = await supabase
    .from('mailintake_berichten').select('id, status, van_adres, duplicaat_topscore').eq('id', berichtId).maybeSingle()
  if (!bericht) return { ok: false, error: 'Bericht niet gevonden.' }
  if (bericht.status === 'verwerkt') return { ok: false, error: 'Dit bericht is al afgehandeld.' }

  const res = await maakDossierUitBericht({
    berichtId,
    relatieId: velden.relatieId,
    contactpersoonId: velden.contactpersoonId,
    velden,
    objectId: velden.objectId ?? null,
    gevraagdeWerkzaamheden: velden.gevraagdeWerkzaamheden ?? null,
    automatisch: false,
    medewerkerId: medewerker.id,
  })

  if (!res.ok) return { ok: false, error: res.error }

  if ((bericht.duplicaat_topscore ?? 0) >= 0.55) {
    await supabase.from('mailintake_besluiten').insert({
      bericht_id: berichtId, actor: 'medewerker', medewerker_id: medewerker.id,
      actie: 'duplicaatwaarschuwing_genegeerd',
      details: { topscore: bericht.duplicaat_topscore, dossier_id: res.dossierId },
    })
  }

  // Het leergeheugen: deze keuze maakt de herkenning de volgende keer sterker.
  await onthoudAlias({
    adres: bericht.van_adres,
    relatieId: velden.relatieId,
    contactpersoonId: velden.contactpersoonId,
    medewerkerId: medewerker.id,
  }).catch(() => {})

  revalidatePath('/mailintake')
  return {
    ok: true, dossierId: res.dossierId, dossiernummer: res.dossiernummer,
    bouw7Ok: res.bouw7Ok, bouw7Fout: res.bouw7Fout,
  }
}

export async function koppelBerichtAanDossier(
  berichtId: string,
  dossierId: string,
  besluit: 'gekoppeld_bestaand' | 'meerwerk' | 'offerte_gewonnen' = 'gekoppeld_bestaand',
): Promise<{ ok: boolean; error?: string }> {
  const { medewerker } = await vereisRecht('mailintake', 'schrijven')
  await koppelAanDossier(berichtId, dossierId, medewerker.id, besluit)
  revalidatePath('/mailintake')
  return { ok: true }
}

/**
 * Negeren is een menselijk besluit: de mail gaat daarna uit Postvak IN.
 * De reden is verplicht — anders is achteraf niet na te gaan waarom een bericht
 * van een bekende klant is weggezet.
 */
export async function negeerBericht(berichtId: string, reden: string): Promise<{ ok: boolean; error?: string }> {
  const { medewerker } = await vereisRecht('mailintake', 'schrijven')
  const supabase = createAdminClient()

  const tekst = (reden ?? '').trim()
  if (tekst.length < 2) return { ok: false, error: 'Geef kort aan waarom dit genegeerd kan worden.' }

  await supabase.from('mailintake_berichten').update({
    status: 'genegeerd', besluit: 'genegeerd',
    behandeld_door: medewerker.id, behandeld_op: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', berichtId)

  await supabase.from('mailintake_besluiten').insert({
    bericht_id: berichtId, actor: 'medewerker', medewerker_id: medewerker.id,
    actie: 'genegeerd', details: { reden: tekst },
  })

  await planNabehandeling(berichtId)
  await voerNabehandelingUit(berichtId).catch(() => {})
  revalidatePath('/mailintake')
  return { ok: true }
}

/** Zet een bericht terug op de werkvoorraad; het tegenovergestelde van negeren. */
export async function heropenBericht(berichtId: string): Promise<{ ok: boolean; error?: string }> {
  const { medewerker } = await vereisRecht('mailintake', 'schrijven')
  const supabase = createAdminClient()

  const { data: b } = await supabase
    .from('mailintake_berichten').select('status, dossier_id').eq('id', berichtId).maybeSingle()
  if (!b) return { ok: false, error: 'Bericht niet gevonden.' }
  if (b.dossier_id) return { ok: false, error: 'Aan dit bericht hangt al een dossier.' }

  await supabase.from('mailintake_berichten').update({
    status: 'wacht_op_mens', besluit: null, behandeld_door: null, behandeld_op: null,
    updated_at: new Date().toISOString(),
  }).eq('id', berichtId)

  await supabase.from('mailintake_besluiten').insert({
    bericht_id: berichtId, actor: 'medewerker', medewerker_id: medewerker.id,
    actie: 'heropend', details: { vorige_status: b.status },
  })

  revalidatePath('/mailintake')
  return { ok: true }
}

export async function markeerGeenAanvraag(berichtId: string, reden: string): Promise<{ ok: boolean; error?: string }> {
  const { medewerker } = await vereisRecht('mailintake', 'schrijven')
  const supabase = createAdminClient()

  await supabase.from('mailintake_berichten').update({
    status: 'geen_aanvraag', besluit: 'geen_aanvraag',
    behandeld_door: medewerker.id, behandeld_op: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', berichtId)

  await supabase.from('mailintake_besluiten').insert({
    bericht_id: berichtId, actor: 'medewerker', medewerker_id: medewerker.id,
    actie: 'geen_aanvraag', details: { reden: (reden ?? '').trim() || null },
  })

  await planNabehandeling(berichtId)
  await voerNabehandelingUit(berichtId).catch(() => {})
  revalidatePath('/mailintake')
  return { ok: true }
}

export async function wijsBerichtToe(berichtId: string, medewerkerId: string | null): Promise<{ ok: boolean }> {
  await vereisRecht('mailintake', 'schrijven')
  const supabase = createAdminClient()
  await supabase.from('mailintake_berichten')
    .update({ toegewezen_medewerker_id: medewerkerId, updated_at: new Date().toISOString() })
    .eq('id', berichtId)
  revalidatePath('/mailintake')
  return { ok: true }
}

/** Laat de AI het bericht opnieuw lezen (nieuwe extractieversie). */
export async function leesOpnieuw(berichtId: string): Promise<{ ok: boolean; error?: string }> {
  await vereisRecht('mailintake', 'schrijven')
  const supabase = createAdminClient()

  const { data: b } = await supabase.from('mailintake_berichten').select('dossier_id').eq('id', berichtId).maybeSingle()
  if (b?.dossier_id) return { ok: false, error: 'Aan dit bericht hangt al een dossier.' }

  await supabase.from('mailintake_berichten')
    .update({ status: 'nieuw', pogingen: 0, laatste_fout: null, updated_at: new Date().toISOString() })
    .eq('id', berichtId)

  const res = await verwerkBericht(berichtId)
  revalidatePath('/mailintake')
  return res.fout ? { ok: false, error: res.fout } : { ok: true }
}

/**
 * Stelt de scope-samenvatting opnieuw op uit de mail en de bijlagen.
 *
 * Overschrijft wat er stond — dit is een bewuste klik, geen automatiek. Wat de
 * behandelaar zelf had bijgeschaafd raakt daarmee kwijt; daarom vraagt het scherm
 * eerst om bevestiging als er al tekst stond.
 */
export async function hervatSamenvatting(
  berichtId: string,
): Promise<{ ok: boolean; tekst?: string | null; error?: string }> {
  await vereisRecht('mailintake', 'schrijven')
  const res = await maakWerkzaamhedenSamenvatting(berichtId)
  revalidatePath(`/mailintake/${berichtId}`)
  return res.ok ? { ok: true, tekst: res.tekst } : { ok: false, error: res.fout ?? 'Samenvatten mislukt.' }
}

/** Slaat de door een mens bijgeschaafde samenvatting op bij het bericht. */
export async function bewaarSamenvatting(
  berichtId: string,
  tekst: string,
): Promise<{ ok: boolean; error?: string }> {
  const { medewerker } = await vereisRecht('mailintake', 'schrijven')
  const supabase = createAdminClient()

  const { error } = await supabase.from('mailintake_berichten').update({
    gevraagde_werkzaamheden: tekst.trim() || null,
    updated_at: new Date().toISOString(),
  }).eq('id', berichtId)
  if (error) return { ok: false, error: error.message }

  await supabase.from('mailintake_besluiten').insert({
    bericht_id: berichtId, actor: 'medewerker', medewerker_id: medewerker.id,
    actie: 'samenvatting_aangepast', details: { lengte: tekst.trim().length },
  })
  return { ok: true }
}

// ─── Beheer ───────────────────────────────────────────────────────────────────


export async function updatePostbus(id: string, wijziging: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  await vereisRecht('mailintake', 'beheren')
  const supabase = createAdminClient()

  // Alleen velden die hier thuishoren, en alleen als het type klopt. Een losse
  // doorgifte van het binnengekomen object zou elke kolom beschrijfbaar maken en
  // een verkeerd type stil wegschrijven.
  const schoon: PostbusPatch = {}
  const w = wijziging
  if (typeof w.naam === 'string') schoon.naam = w.naam.trim()
  if (typeof w.adres === 'string') schoon.adres = w.adres.trim()
  if (w.soort === 'offerteaanvraag' || w.soort === 'opdracht' || w.soort === 'servicedesk') schoon.soort = w.soort
  if (typeof w.map_id === 'string') schoon.map_id = w.map_id
  if (typeof w.actief === 'boolean') schoon.actief = w.actief
  if (typeof w.automatisch_aanmaken === 'boolean') schoon.automatisch_aanmaken = w.automatisch_aanmaken
  if (typeof w.standaard_werkmaatschappij_id === 'string' || w.standaard_werkmaatschappij_id === null)
    schoon.standaard_werkmaatschappij_id = w.standaard_werkmaatschappij_id
  if (typeof w.standaard_bouw7_categorie_id === 'number' || w.standaard_bouw7_categorie_id === null)
    schoon.standaard_bouw7_categorie_id = w.standaard_bouw7_categorie_id
  if (typeof w.standaard_categorie === 'string' || w.standaard_categorie === null)
    schoon.standaard_categorie = w.standaard_categorie
  if (Array.isArray(w.notificatie_medewerkers) && w.notificatie_medewerkers.every(x => typeof x === 'string'))
    schoon.notificatie_medewerkers = w.notificatie_medewerkers as string[]
  if (typeof w.dagbudget_cent === 'number' && Number.isFinite(w.dagbudget_cent) && w.dagbudget_cent >= 0)
    schoon.dagbudget_cent = Math.round(w.dagbudget_cent)
  if (typeof w.map_verwerkt_naam === 'string') schoon.map_verwerkt_naam = w.map_verwerkt_naam.trim()
  if (!Object.keys(schoon).length) return { ok: true }

  // Bij een nieuwe mapnaam is de gecachete folder-id waardeloos.
  if (schoon.map_verwerkt_naam !== undefined) schoon.map_verwerkt_id = null
  schoon.updated_at = new Date().toISOString()

  const { error } = await supabase.from('mailintake_postbussen').update(schoon).eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/instellingen/mailintake')
  return { ok: true }
}

/** De bedrijfsbrede noodrem op de Outlook-nabehandeling. */
export async function zetNabehandelStand(stand: string): Promise<{ ok: boolean; error?: string }> {
  await vereisRecht('mailintake', 'beheren')
  if (!['aan', 'alleen_categorie', 'uit'].includes(stand)) return { ok: false, error: 'Onbekende stand.' }

  const supabase = createAdminClient()
  const { data } = await supabase.from('bedrijfsinstellingen').select('overige').eq('id', 1).maybeSingle()
  // `overige` is jsonb en kan volgens het type ook een getal of een lijst zijn;
  // spreaden van zoiets is een typefout die stil een leeg object oplevert.
  const huidig = data?.overige && typeof data.overige === 'object' && !Array.isArray(data.overige)
    ? data.overige
    : {}
  const overige = { ...huidig, mailintake_nabehandeling: stand }
  const { error } = await supabase.from('bedrijfsinstellingen').update({ overige }).eq('id', 1)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/instellingen/mailintake')
  return { ok: true }
}

export async function getNabehandelStand(): Promise<string> {
  await vereisRecht('mailintake', 'lezen')
  const supabase = createAdminClient()
  const { data } = await supabase.from('bedrijfsinstellingen').select('overige').eq('id', 1).maybeSingle()
  const v = (data?.overige as Record<string, unknown> | null)?.mailintake_nabehandeling
  return v === 'aan' || v === 'uit' ? v : 'alleen_categorie'
}

/** Leest één bericht uit de postbus om de verbinding te toetsen. Schrijft niets. */
export async function controleerVerbinding(postbusId: string): Promise<{ ok: boolean; onderwerp?: string | null; ontvangenOp?: string | null; error?: string }> {
  await vereisRecht('mailintake', 'beheren')
  const supabase = createAdminClient()
  const { data: p } = await supabase.from('mailintake_postbussen').select('adres').eq('id', postbusId).maybeSingle()
  if (!p) return { ok: false, error: 'Postbus niet gevonden.' }

  const res = await toetsPostbus(p.adres)
  return res.ok
    ? { ok: true, onderwerp: res.onderwerp, ontvangenOp: res.ontvangenOp }
    : { ok: false, error: res.fout }
}

/** Handmatig ophalen ("Nu ophalen" in het postvak). */
export async function haalNuOp(): Promise<{ ok: boolean; nieuw: number; fouten: string[] }> {
  await vereisRecht('mailintake', 'beheren')
  const supabase = createAdminClient()
  const { data } = await supabase.from('mailintake_postbussen').select('*').eq('actief', true).limit(20)

  let nieuw = 0
  const fouten: string[] = []
  for (const p of data ?? []) {
    const res = await haalPostbusOp(p)
    nieuw += res.nieuw
    if (res.fout) fouten.push(`${res.postbus}: ${res.fout}`)
  }

  revalidatePath('/mailintake')
  return { ok: fouten.length === 0, nieuw, fouten }
}

// ─── Aliassen ─────────────────────────────────────────────────────────────────


export async function verwijderAlias(id: string): Promise<{ ok: boolean }> {
  await vereisRecht('mailintake', 'beheren')
  const supabase = createAdminClient()
  await supabase.from('mailintake_aliassen').delete().eq('id', id)
  revalidatePath('/instellingen/mailintake')
  return { ok: true }
}

export async function voegNegeerAdresToe(patroon: string): Promise<{ ok: boolean; error?: string }> {
  await vereisRecht('mailintake', 'beheren')
  const p = (patroon ?? '').trim().toLowerCase()
  if (!p.includes('@')) return { ok: false, error: 'Geef een e-mailadres of @domein.nl op.' }

  const medewerker = await getCurrentMedewerker()
  const supabase = createAdminClient()
  const { error } = await supabase.from('mailintake_aliassen').upsert({
    patroon: p, soort: 'negeer', aangemaakt_door: medewerker?.id ?? null,
  }, { onConflict: 'patroon' })
  if (error) return { ok: false, error: error.message }
  revalidatePath('/instellingen/mailintake')
  return { ok: true }
}
