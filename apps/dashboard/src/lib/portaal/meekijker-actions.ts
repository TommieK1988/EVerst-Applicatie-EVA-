'use server'

import { createAdminClient } from '@everts/database/server'
import { vereisRecht, GeenToegangError } from '@/lib/auth/rechten'
import { bouwUitnodigingMail, verstuurPortaalMailDirect } from '@/lib/portaal/mail'

/**
 * meekijker-actions.ts — mensen van buiten toegang geven tot één project.
 *
 * De voorzitter van een VvE, of een adviseur die de opdrachtgever heeft
 * ingehuurd om mee te kijken met de uitvoering. Die horen niet bij de
 * contactpersonen van de klant — vaak bij een heel andere organisatie, soms bij
 * geen enkele — en mogen ook niet automatisch méér zien zodra er elders iets
 * verandert.
 *
 * Vandaar scope 'alleen_gekoppeld' en relatie_id null: zo iemand ziet exact de
 * dossiers die in portaal_gebruiker_dossiers staan en verder niets. Uitbreiden
 * is altijd een expliciete handeling per dossier.
 *
 * Bewust een eigen module naast beheer-actions.ts: dit is een andere handeling
 * met een ander risicoprofiel — je geeft iemand toegang die niet uit het
 * klantdossier volgt, en dat verdient zijn eigen plek.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

export type MeekijkerResultaat = { ok: true } | { ok: false; error: string }

function fout(e: unknown): MeekijkerResultaat {
  if (e instanceof GeenToegangError) return { ok: false, error: 'Je hebt hier geen rechten voor.' }
  console.error('[portaal-meekijker]', e)
  return { ok: false, error: e instanceof Error ? e.message : 'Er ging iets mis.' }
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export type PortaalPersoonTreffer = {
  contactpersoonId: string
  naam: string
  email: string
  organisaties: string[]
}

/**
 * Zoekt een persoon om aan dit dossier te hangen.
 *
 * Zoekt door álle contactpersonen heen, niet alleen die van de opdrachtgever —
 * dat is juist het geval waarvoor dit bestaat. Zonder e-mailadres kan iemand
 * niet inloggen, dus die vallen af.
 */
export async function zoekPortaalPersonen(zoekterm: string): Promise<PortaalPersoonTreffer[]> {
  try {
    await vereisRecht('klantportaal', 'beheren')
  } catch {
    return []
  }

  const term = (zoekterm ?? '').trim()
  if (term.length < 2) return []

  // % en _ zijn jokers in ilike. Zonder ontsnappen levert een zoekterm met een
  // procentteken ineens de halve tabel op.
  const veilig = term.replace(/[%_\\]/g, (m) => '\\' + m)
  const patroon = '%' + veilig + '%'

  const { data } = await db()
    .from('contactpersonen')
    .select('id, voornaam, tussenvoegsel, achternaam, email')
    .eq('actief', true)
    .not('email', 'is', null)
    .or(`voornaam.ilike.${patroon},achternaam.ilike.${patroon},email.ilike.${patroon}`)
    .limit(15)

  const rijen = (data ?? []) as Record<string, unknown>[]
  if (rijen.length === 0) return []

  const { data: koppelingen } = await db()
    .from('contactpersoon_organisaties')
    .select('contactpersoon_id, relaties!organisatie_id(naam)')
    .in('contactpersoon_id', rijen.map(r => String(r.id)))

  const orgs = new Map<string, string[]>()
  for (const k of ((koppelingen ?? []) as Record<string, unknown>[])) {
    const naam = (k.relaties as { naam?: string } | null)?.naam
    if (!naam) continue
    const id = String(k.contactpersoon_id)
    orgs.set(id, [...(orgs.get(id) ?? []), naam])
  }

  return rijen.map(r => ({
    contactpersoonId: String(r.id),
    naam: [r.voornaam, r.tussenvoegsel, r.achternaam].filter(Boolean).join(' '),
    email: String(r.email).toLowerCase(),
    organisaties: orgs.get(String(r.id)) ?? [],
  }))
}

/**
 * Geeft iemand toegang tot uitsluitend dit ene dossier en stuurt de uitnodiging.
 *
 * Bestaat de persoon nog niet in EVA, dan wordt er een gewone contactpersoon
 * voor aangemaakt — dezelfde entiteit als alle andere, zodat hij later normaal
 * aan een organisatie te koppelen is.
 */
export async function voegPortaalMeekijkerToe(input: {
  dossierId: string
  /** Bestaande persoon, uit zoekPortaalPersonen. */
  contactpersoonId?: string | null
  /** Of een nieuwe persoon. Het e-mailadres is zijn sleutel en dus verplicht. */
  nieuw?: { voornaam: string; tussenvoegsel?: string | null; achternaam: string; email: string } | null
  /** Waarom deze persoon meekijkt — "VvE-voorzitter", "toezichthouder namens de klant". */
  rol?: string | null
}): Promise<MeekijkerResultaat> {
  try {
    const { medewerker } = await vereisRecht('klantportaal', 'beheren')
    if (!input.dossierId) return { ok: false, error: 'Geen dossier.' }

    let contactpersoonId = input.contactpersoonId ?? null
    let email = ''
    let voornaam: string | null = null

    if (contactpersoonId) {
      const { data } = await db()
        .from('contactpersonen').select('id, voornaam, email')
        .eq('id', contactpersoonId).maybeSingle()
      if (!data?.email) return { ok: false, error: 'Deze persoon heeft geen e-mailadres; vul dat eerst aan bij Relaties.' }
      email = String(data.email).trim().toLowerCase()
      voornaam = data.voornaam ?? null
    } else if (input.nieuw) {
      const n = input.nieuw
      email = (n.email ?? '').trim().toLowerCase()
      if (!n.voornaam?.trim() || !n.achternaam?.trim()) {
        return { ok: false, error: 'Vul een voor- en achternaam in.' }
      }
      if (!EMAIL.test(email)) return { ok: false, error: 'Dit is geen geldig e-mailadres.' }

      // Bestaat dit adres al als contactpersoon? Dan die hergebruiken in plaats
      // van een tweede rij voor dezelfde persoon aan te maken.
      const { data: bestaandeCp } = await db()
        .from('contactpersonen').select('id, voornaam').ilike('email', email).limit(1).maybeSingle()

      if (bestaandeCp) {
        contactpersoonId = String(bestaandeCp.id)
        voornaam = bestaandeCp.voornaam ?? null
      } else {
        const { data: nieuwCp, error } = await db().from('contactpersonen').insert({
          voornaam: n.voornaam.trim(),
          tussenvoegsel: n.tussenvoegsel?.trim() || null,
          achternaam: n.achternaam.trim(),
          email,
          actief: true,
          opmerkingen: input.rol?.trim()
            ? `Toegevoegd via het klantportaal: ${input.rol.trim()}`
            : 'Toegevoegd via het klantportaal',
        }).select('id').single()
        if (error || !nieuwCp) return { ok: false, error: `Persoon aanmaken mislukt: ${error?.message ?? 'onbekend'}` }
        contactpersoonId = String(nieuwCp.id)
        voornaam = n.voornaam.trim()
      }
    } else {
      return { ok: false, error: 'Kies een persoon of vul de gegevens van een nieuwe in.' }
    }

    // Bestaat er al een portaalaccount op dit adres, dan blijven scope en
    // relatie ongemoeid: een contactpersoon van de opdrachtgever mag hier niet
    // stilletjes gedegradeerd worden tot meekijker. Hij krijgt er alleen dit
    // dossier bij.
    const { data: bestaand } = await db()
      .from('portaal_gebruikers').select('id').eq('email', email).maybeSingle()

    let portaalGebruikerId: string
    if (bestaand) {
      portaalGebruikerId = String(bestaand.id)
      await db().from('portaal_gebruikers')
        .update({ actief: true, updated_at: new Date().toISOString() })
        .eq('id', portaalGebruikerId)
    } else {
      const { data: nieuwPg, error } = await db().from('portaal_gebruikers').insert({
        email,
        contactpersoon_id: contactpersoonId,
        relatie_id: null,
        scope: 'alleen_gekoppeld',
        actief: true,
        uitgenodigd_op: new Date().toISOString(),
        uitgenodigd_door: medewerker.id,
      }).select('id').single()
      if (error || !nieuwPg) return { ok: false, error: `Toegang aanmaken mislukt: ${error?.message ?? 'onbekend'}` }
      portaalGebruikerId = String(nieuwPg.id)
    }

    await db().from('portaal_gebruiker_dossiers').upsert(
      {
        portaal_gebruiker_id: portaalGebruikerId,
        dossier_id: input.dossierId,
        rol: input.rol?.trim() || null,
        toegevoegd_door: medewerker.id,
      },
      { onConflict: 'portaal_gebruiker_id,dossier_id' },
    )

    const afzender = [medewerker.voornaam, medewerker.tussenvoegsel, medewerker.achternaam]
      .filter(Boolean).join(' ')
    const mail = bouwUitnodigingMail(voornaam, afzender || null)
    await verstuurPortaalMailDirect({ email, onderwerp: mail.onderwerp, bodyHtml: mail.bodyHtml })

    await db().from('portaal_gebruikers')
      .update({ laatste_link_op: new Date().toISOString() }).eq('id', portaalGebruikerId)

    return { ok: true }
  } catch (e) { return fout(e) }
}

/**
 * Haalt de koppeling tussen deze persoon en dit dossier weg.
 *
 * Het account blijft bestaan — hij kan bij een ander project nog meekijken. Is
 * dit zijn enige koppeling en heeft hij scope 'alleen_gekoppeld', dan ziet hij
 * na het loskoppelen niets meer.
 */
export async function verwijderPortaalMeekijker(
  portaalGebruikerId: string,
  dossierId: string,
): Promise<MeekijkerResultaat> {
  try {
    await vereisRecht('klantportaal', 'beheren')
    await db().from('portaal_gebruiker_dossiers').delete()
      .eq('portaal_gebruiker_id', portaalGebruikerId)
      .eq('dossier_id', dossierId)
    return { ok: true }
  } catch (e) { return fout(e) }
}
