'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@everts/database/server'
import { vereisRecht, GeenToegangError } from '@/lib/auth/rechten'
import { bouwUitnodigingMail, verstuurPortaalMailDirect } from '@/lib/portaal/mail'
import type {
  PortaalOnderdeel, PortaalScope, PortaalBerichtBijlage,
} from '@everts/database/platform-types'
import { PORTAAL_ONDERDEEL_KOLOM } from './onderdelen'

/**
 * beheer-actions.ts — de EVA-kant van het klantportaal.
 *
 * Alles hier draait op de admin-client en is dus achter `vereisRecht('klantportaal', …)`
 * gezet. De niveaus:
 *   lezen     → meekijken (geen action hier)
 *   schrijven → onderdelen aan/uit, bestanden vrijgeven, in de chat antwoorden
 *   beheren   → iemand uitnodigen, zijn scope bepalen, toegang intrekken
 *
 * Dat onderscheid is niet cosmetisch: bepalen wát er gedeeld wordt is dagelijks
 * werk van de projectleider, bepalen wíé er mag kijken is een beslissing met
 * gevolgen buiten dit ene dossier.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

export type BeheerResultaat = { ok: true } | { ok: false; error: string }

function fout(e: unknown): BeheerResultaat {
  if (e instanceof GeenToegangError) return { ok: false, error: 'Je hebt hier geen rechten voor.' }
  console.error('[portaal-beheer]', e)
  return { ok: false, error: e instanceof Error ? e.message : 'Er ging iets mis.' }
}

/* ── Zichtbaarheid per dossier ─────────────────────────────────────────────── */

/** Zet het hele portaal voor dit dossier aan of uit. */
export async function setPortaalDossierActief(dossierId: string, actief: boolean): Promise<BeheerResultaat> {
  try {
    const { medewerker } = await vereisRecht('klantportaal', 'schrijven')
    await db().from('portaal_dossier_instellingen').upsert(
      { dossier_id: dossierId, actief, gewijzigd_op: new Date().toISOString(), gewijzigd_door: medewerker.id },
      { onConflict: 'dossier_id' },
    )
    revalidatePath('/portaal')
    return { ok: true }
  } catch (e) { return fout(e) }
}

/** Eén onderdeel aan of uit. Maakt de instellingenrij aan als die er nog niet is. */
export async function setPortaalOnderdeel(
  dossierId: string,
  onderdeel: PortaalOnderdeel,
  aan: boolean,
): Promise<BeheerResultaat> {
  try {
    const { medewerker } = await vereisRecht('klantportaal', 'schrijven')
    const kolom = PORTAAL_ONDERDEEL_KOLOM[onderdeel]
    if (!kolom) return { ok: false, error: 'Onbekend onderdeel.' }

    await db().from('portaal_dossier_instellingen').upsert(
      {
        dossier_id: dossierId,
        [kolom]: aan,
        // Meerwerk gaat vanzelf aan zodra er een meerwerkregel bij komt. Zet
        // iemand die schakelaar zelf, dan onthouden we dat en laat de trigger
        // hem met rust -- anders zou de Bouw7-sync een bewust "uit" bij de
        // eerstvolgende meerwerkregel stilletjes terugdraaien.
        ...(onderdeel === 'meerwerk' ? { toon_meerwerk_handmatig: true } : {}),
        gewijzigd_op: new Date().toISOString(),
        gewijzigd_door: medewerker.id,
      },
      { onConflict: 'dossier_id' },
    )
    return { ok: true }
  } catch (e) { return fout(e) }
}

/* ── Bestanden vrijgeven ──────────────────────────────────────────────────── */

export type VrijTeGevenBestand = {
  sleutel: string
  bron: 'bouw7' | 'sharepoint' | 'storage'
  bronQuery: string
  naam: string
  extensie: string | null
  soort: 'document' | 'afbeelding'
  grootte: number | null
  datum: string | null
}

/**
 * Eén bestand vrijgeven of weer intrekken.
 *
 * De bronQuery wordt hier BEVROREN opgeslagen. Dat is bewust: het portaal
 * bladert nooit live door Bouw7 of SharePoint, en de downloadproxy leest de bron
 * uitsluitend uit deze rij. Zo kan een geknutselde URL van een klant nooit een
 * ander bestand aanwijzen dan wat er is aangevinkt.
 */
export async function setPortaalBestandZichtbaar(
  dossierId: string,
  bestand: VrijTeGevenBestand,
  zichtbaar: boolean,
): Promise<BeheerResultaat> {
  try {
    const { medewerker } = await vereisRecht('klantportaal', 'schrijven')

    if (!zichtbaar) {
      // Echt verwijderen in plaats van op false zetten: een ingetrokken bestand
      // hoort geen spoor achter te laten dat later per ongeluk hergebruikt wordt.
      await db().from('portaal_bestanden').delete()
        .eq('dossier_id', dossierId).eq('sleutel', bestand.sleutel)
      return { ok: true }
    }

    await db().from('portaal_bestanden').upsert(
      {
        dossier_id: dossierId,
        sleutel: bestand.sleutel,
        bron: bestand.bron,
        bron_query: bestand.bronQuery,
        naam: bestand.naam,
        extensie: bestand.extensie,
        soort: bestand.soort,
        grootte: bestand.grootte,
        datum: bestand.datum,
        zichtbaar: true,
        gewijzigd_op: new Date().toISOString(),
        gewijzigd_door: medewerker.id,
      },
      { onConflict: 'dossier_id,sleutel' },
    )
    return { ok: true }
  } catch (e) { return fout(e) }
}

/* ── Toegang ──────────────────────────────────────────────────────────────── */

/**
 * Nodigt een contactpersoon uit. Maakt het portaalaccount aan (of activeert een
 * bestaand) en stuurt meteen een uitnodiging met inloglink.
 *
 * Het e-mailadres komt uit een Bouw7-gesynchroniseerde contactpersoon. Eén fout
 * adres betekent dat alle projectgegevens bij een vreemde belanden — daarom
 * alleen met 'beheren', en toont de interface het adres voluit ter bevestiging.
 */
export async function nodigPortaalGebruikerUit(input: {
  contactpersoonId?: string | null
  particulierId?: string | null
  relatieId: string | null
  email: string
  scope?: PortaalScope
}): Promise<BeheerResultaat> {
  try {
    const { medewerker } = await vereisRecht('klantportaal', 'beheren')

    const email = (input.email ?? '').trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      return { ok: false, error: 'Dit is geen geldig e-mailadres.' }
    }
    if (!input.contactpersoonId && !input.particulierId) {
      return { ok: false, error: 'Koppel de toegang aan een contactpersoon of particulier.' }
    }

    // Altijd in kleine letters opslaan: de login zoekt op exact dit adres.
    const { data: bestaand } = await db()
      .from('portaal_gebruikers').select('id').eq('email', email).maybeSingle()

    if (bestaand) {
      await db().from('portaal_gebruikers').update({
        actief: true,
        contactpersoon_id: input.contactpersoonId ?? null,
        particulier_id: input.particulierId ?? null,
        relatie_id: input.relatieId,
        ...(input.scope ? { scope: input.scope } : {}),
        uitgenodigd_op: new Date().toISOString(),
        uitgenodigd_door: medewerker.id,
        updated_at: new Date().toISOString(),
      }).eq('id', bestaand.id)
    } else {
      await db().from('portaal_gebruikers').insert({
        email,
        contactpersoon_id: input.contactpersoonId ?? null,
        particulier_id: input.particulierId ?? null,
        relatie_id: input.relatieId,
        scope: input.scope ?? 'eigen_dossiers',
        actief: true,
        uitgenodigd_op: new Date().toISOString(),
        uitgenodigd_door: medewerker.id,
      })
    }

    const voornaam = await haalVoornaam(input.contactpersoonId, input.particulierId)
    const afzender = [medewerker.voornaam, medewerker.tussenvoegsel, medewerker.achternaam]
      .filter(Boolean).join(' ')
    const mail = bouwUitnodigingMail(voornaam, afzender || null)

    await verstuurPortaalMailDirect({ email, onderwerp: mail.onderwerp, bodyHtml: mail.bodyHtml })

    await db().from('portaal_gebruikers')
      .update({ laatste_link_op: new Date().toISOString() }).eq('email', email)

    return { ok: true }
  } catch (e) { return fout(e) }
}

export async function setPortaalGebruikerScope(id: string, scope: PortaalScope): Promise<BeheerResultaat> {
  try {
    await vereisRecht('klantportaal', 'beheren')
    await db().from('portaal_gebruikers')
      .update({ scope, updated_at: new Date().toISOString() }).eq('id', id)
    return { ok: true }
  } catch (e) { return fout(e) }
}

/**
 * Toegang intrekken of teruggeven.
 *
 * Bewust `actief = false` en geen verwijdering: het auth-account blijft bestaan
 * en de berichtgeschiedenis blijft leesbaar. Voor een echt AVG-verwijderverzoek
 * is een aparte handeling nodig — dat is een andere vraag dan "deze persoon
 * werkt hier niet meer".
 */
export async function setPortaalGebruikerActief(id: string, actief: boolean): Promise<BeheerResultaat> {
  try {
    await vereisRecht('klantportaal', 'beheren')
    await db().from('portaal_gebruikers')
      .update({ actief, updated_at: new Date().toISOString() }).eq('id', id)
    return { ok: true }
  } catch (e) { return fout(e) }
}

/** Losse dossiertoegang naast de scope-regel — voor een VvE-lid of derde partij. */
export async function koppelPortaalDossier(
  portaalGebruikerId: string,
  dossierId: string,
  koppelen: boolean,
): Promise<BeheerResultaat> {
  try {
    const { medewerker } = await vereisRecht('klantportaal', 'beheren')
    if (koppelen) {
      await db().from('portaal_gebruiker_dossiers').upsert(
        { portaal_gebruiker_id: portaalGebruikerId, dossier_id: dossierId, toegevoegd_door: medewerker.id },
        { onConflict: 'portaal_gebruiker_id,dossier_id' },
      )
    } else {
      await db().from('portaal_gebruiker_dossiers').delete()
        .eq('portaal_gebruiker_id', portaalGebruikerId).eq('dossier_id', dossierId)
    }
    return { ok: true }
  } catch (e) { return fout(e) }
}

/* ── Chat vanuit EVA ──────────────────────────────────────────────────────── */

/**
 * Antwoord van een medewerker in de klantchat.
 *
 * `intern = true` maakt er een kanttekening van die alleen collega's zien. Die
 * staat in dezelfde draad — handig bij het teruglezen — maar wordt aan de
 * portaalkant al in de query weggefilterd, niet pas in de opmaak.
 */
export async function plaatsPortaalAntwoord(
  dossierId: string,
  bericht: string,
  opties: { intern?: boolean; bijlagen?: PortaalBerichtBijlage[] } = {},
): Promise<BeheerResultaat> {
  try {
    const { medewerker } = await vereisRecht('klantportaal', 'schrijven')
    const tekst = (bericht ?? '').trim()
    if (!tekst) return { ok: false, error: 'Typ een bericht.' }

    await db().from('portaal_berichten').insert({
      dossier_id: dossierId,
      auteur_type: 'medewerker',
      medewerker_id: medewerker.id,
      bericht: tekst,
      bijlagen: opties.bijlagen ?? [],
      intern: !!opties.intern,
    })

    await db().from('portaal_bericht_gelezen').upsert(
      {
        dossier_id: dossierId, lezer_type: 'medewerker', lezer_id: medewerker.id,
        gelezen_tot: new Date().toISOString(),
      },
      { onConflict: 'dossier_id,lezer_type,lezer_id' },
    )

    return { ok: true }
  } catch (e) { return fout(e) }
}

/** Markeert de klantchat als gelezen voor de ingelogde medewerker. */
export async function markeerPortaalChatGelezen(dossierId: string): Promise<void> {
  try {
    const { medewerker } = await vereisRecht('klantportaal', 'lezen')
    await db().from('portaal_bericht_gelezen').upsert(
      {
        dossier_id: dossierId, lezer_type: 'medewerker', lezer_id: medewerker.id,
        gelezen_tot: new Date().toISOString(),
      },
      { onConflict: 'dossier_id,lezer_type,lezer_id' },
    )
  } catch {
    // stil
  }
}

async function haalVoornaam(contactpersoonId?: string | null, particulierId?: string | null): Promise<string | null> {
  const tabel = contactpersoonId ? 'contactpersonen' : particulierId ? 'particulieren' : null
  const id = contactpersoonId ?? particulierId
  if (!tabel || !id) return null
  const { data } = await db().from(tabel).select('voornaam').eq('id', id).maybeSingle()
  return data?.voornaam ?? null
}

/**
 * Welke bestanden van dit dossier in het klantportaal staan.
 *
 * Geeft `null` als de gebruiker geen recht op het klantportaal heeft. De
 * Bestanden-tab verbergt de portaalkolom dan helemaal — een uitgegrijsd vinkje
 * dat niemand kan zetten is alleen maar verwarrend.
 */
export async function getPortaalBestandSleutels(dossierId: string): Promise<string[] | null> {
  try {
    await vereisRecht('klantportaal', 'lezen')
  } catch {
    return null
  }
  const { data } = await db()
    .from('portaal_bestanden')
    .select('sleutel')
    .eq('dossier_id', dossierId)
    .eq('zichtbaar', true)
  return ((data ?? []) as { sleutel: string }[]).map(r => r.sleutel)
}

export type EvaChatBericht = {
  id: string
  vanKlant: boolean
  auteur: string
  bericht: string
  bijlagen: { naam: string; url: string }[]
  intern: boolean
  op: string
}

/**
 * De klantchat zoals een medewerker hem ziet: mét de interne kanttekeningen.
 *
 * Dit is de enige plek waar `intern = true` mee naar buiten komt — en dan nog
 * alleen naar EVA, achter het klantportaal-recht. De portaalkant filtert ze in
 * de query weg; zie lib/portaal/chat.ts.
 */
export async function getEvaPortaalChat(dossierId: string): Promise<EvaChatBericht[] | null> {
  // null = geen recht op het klantportaal. Het blok verdwijnt dan helemaal;
  // een leeg blok zou suggereren dat er niets is in plaats van dat je niet mag kijken.
  try {
    await vereisRecht('klantportaal', 'lezen')
  } catch {
    return null
  }

  const { data } = await db()
    .from('portaal_berichten')
    .select('id, auteur_type, medewerker_id, portaal_gebruiker_id, bericht, bijlagen, intern, created_at')
    .eq('dossier_id', dossierId)
    .order('created_at', { ascending: true })
    .limit(200)

  const rijen = (data ?? []) as Record<string, unknown>[]
  if (rijen.length === 0) return []

  const medewerkerIds = [...new Set(rijen.map(r => r.medewerker_id).filter(Boolean))] as string[]
  const gebruikerIds = [...new Set(rijen.map(r => r.portaal_gebruiker_id).filter(Boolean))] as string[]

  const [{ data: mw }, { data: pg }] = await Promise.all([
    medewerkerIds.length
      ? db().from('medewerkers').select('id, voornaam, tussenvoegsel, achternaam').in('id', medewerkerIds)
      : Promise.resolve({ data: [] }),
    gebruikerIds.length
      ? db().from('portaal_gebruikers').select('id, email, contactpersoon_id').in('id', gebruikerIds)
      : Promise.resolve({ data: [] }),
  ])

  const mwNaam = new Map<string, string>()
  for (const m of ((mw ?? []) as Record<string, unknown>[])) {
    mwNaam.set(String(m.id), [m.voornaam, m.tussenvoegsel, m.achternaam].filter(Boolean).join(' '))
  }

  const klantNaam = new Map<string, string>()
  const cpIds = ((pg ?? []) as Record<string, unknown>[]).map(g => g.contactpersoon_id).filter(Boolean) as string[]
  const cpNaam = new Map<string, string>()
  if (cpIds.length > 0) {
    const { data: cp } = await db()
      .from('contactpersonen').select('id, voornaam, tussenvoegsel, achternaam').in('id', cpIds)
    for (const c of ((cp ?? []) as Record<string, unknown>[])) {
      cpNaam.set(String(c.id), [c.voornaam, c.tussenvoegsel, c.achternaam].filter(Boolean).join(' '))
    }
  }
  for (const g of ((pg ?? []) as Record<string, unknown>[])) {
    const naam = g.contactpersoon_id ? cpNaam.get(String(g.contactpersoon_id)) : null
    klantNaam.set(String(g.id), naam || String(g.email))
  }

  return rijen.map(r => ({
    id: String(r.id),
    vanKlant: r.auteur_type === 'klant',
    auteur: r.auteur_type === 'klant'
      ? (r.portaal_gebruiker_id ? klantNaam.get(String(r.portaal_gebruiker_id)) ?? 'Klant' : 'Klant')
      : (r.medewerker_id ? mwNaam.get(String(r.medewerker_id)) ?? 'Everts' : 'Everts'),
    bericht: String(r.bericht ?? ''),
    bijlagen: ((r.bijlagen as { pad: string; naam: string }[] | null) ?? []).map(b => ({
      naam: b.naam,
      url: `/api/portaal/bijlage-intern?dossier=${encodeURIComponent(dossierId)}&pad=${encodeURIComponent(b.pad)}`,
    })),
    intern: !!r.intern,
    op: String(r.created_at),
  }))
}
