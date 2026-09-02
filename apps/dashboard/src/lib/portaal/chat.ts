import 'server-only'
import { createAdminClient } from '@everts/database/server'
import type { PortaalBerichtBijlage } from '@everts/database/platform-types'
import { vereisPortaalOnderdeel } from './auth'
import { maakNotificatie } from '@/lib/notificaties/maak'
import { dossierPad } from '@/components/dossiers/open-dossier'
import type { DossierSectie } from '@/components/dossiers/types'
import { PORTAAL_ROLLEN } from './onderdelen'

/**
 * chat.ts — het gesprek tussen de klant en ons over één project.
 *
 * Twee dingen die niet mogen verschuiven:
 *
 *  1. `intern = true` wordt in de QUERY weggefilterd, niet pas in de mapping.
 *     Een interne kanttekening staat in dezelfde draad als de rest; hem pas bij
 *     het opmaken weglaten betekent dat één vergeten `.map()` hem alsnog naar
 *     buiten schrijft. Filter je in de database, dan verlaat hij de server niet.
 *  2. Van de auteur gaat alleen een naam mee. Geen medewerker-id, geen functie,
 *     geen e-mailadres — de klant heeft de betrokkenenlijst voor contactgegevens.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

/** Genoeg voor elk normaal gesprek; daarboven is er iets anders aan de hand. */
const MAX_BERICHTEN = 200

export type PortaalChatBericht = {
  id: string
  vanKlant: boolean
  auteur: string
  bericht: string
  bijlagen: { naam: string; url: string }[]
  op: string
}

function bijlageUrl(dossierId: string, pad: string): string {
  return `/api/portaal/bijlage?dossier=${encodeURIComponent(dossierId)}&pad=${encodeURIComponent(pad)}`
}

/** Het gesprek zoals de klant het ziet: zonder interne kanttekeningen. */
export async function getPortaalChat(dossierId: string): Promise<PortaalChatBericht[]> {
  await vereisPortaalOnderdeel(dossierId, 'chat')

  const { data } = await db()
    .from('portaal_berichten')
    .select('id, auteur_type, medewerker_id, bericht, bijlagen, created_at')
    .eq('dossier_id', dossierId)
    .eq('intern', false)
    .order('created_at', { ascending: true })
    .limit(MAX_BERICHTEN)

  const rijen = (data ?? []) as Record<string, unknown>[]
  const medewerkerIds = [...new Set(rijen.map(r => r.medewerker_id).filter(Boolean))] as string[]

  const namen = new Map<string, string>()
  if (medewerkerIds.length > 0) {
    const { data: mw } = await db()
      .from('medewerkers')
      .select('id, voornaam, tussenvoegsel, achternaam')
      .in('id', medewerkerIds)
    for (const m of ((mw ?? []) as Record<string, unknown>[])) {
      namen.set(String(m.id), [m.voornaam, m.tussenvoegsel, m.achternaam].filter(Boolean).join(' '))
    }
  }

  return rijen.map(r => ({
    id: String(r.id),
    vanKlant: r.auteur_type === 'klant',
    auteur: r.auteur_type === 'klant'
      ? 'U'
      : (r.medewerker_id ? namen.get(String(r.medewerker_id)) ?? 'Everts' : 'Everts'),
    bericht: String(r.bericht ?? ''),
    bijlagen: ((r.bijlagen as PortaalBerichtBijlage[] | null) ?? []).map(b => ({
      naam: b.naam,
      url: bijlageUrl(dossierId, b.pad),
    })),
    op: String(r.created_at),
  }))
}

/**
 * Meldt de rolhouders van het dossier dat er een klantbericht binnen is.
 *
 * `maakNotificatie` verwacht een auth.users-id, niet medewerkers.id — een fout
 * die je pas merkt doordat er stilletjes nooit een melding aankomt. Vandaar de
 * omweg via auth_user_id, en het overslaan van rolhouders die nog nooit hebben
 * ingelogd. Gooit nooit: een mislukte melding mag het bericht niet tegenhouden.
 */
export async function meldKlantberichtAanTeam(input: {
  dossierId: string
  afzender: string
  fragment: string
}): Promise<void> {
  try {
    const rolKolommen = PORTAAL_ROLLEN.map(r => r.kolom).join(', ')
    const { data: dossier } = await db()
      .from('dossiers')
      .select(`titel, hoofdstatus, ${rolKolommen}`)
      .eq('id', input.dossierId)
      .maybeSingle()
    if (!dossier) return

    const ids = [...new Set(
      PORTAAL_ROLLEN.map(r => (dossier as Record<string, unknown>)[r.kolom]).filter(Boolean),
    )] as string[]
    if (ids.length === 0) return

    const { data: mw } = await db()
      .from('medewerkers')
      .select('id, auth_user_id')
      .in('id', ids)
      .eq('actief', true)

    const titel = (dossier as Record<string, unknown>).titel as string | null
    const sectie = ((dossier as Record<string, unknown>).hoofdstatus as DossierSectie | null) ?? 'opdracht'
    // Naar het Informatie-tabblad: daar staat het chatblok.
    const url = dossierPad(sectie, input.dossierId)

    await Promise.all(
      ((mw ?? []) as { auth_user_id: string | null }[])
        .filter(m => m.auth_user_id)
        .map(m => maakNotificatie({
          user_id: m.auth_user_id!,
          type: 'portaal_bericht',
          titel: `Bericht van ${input.afzender}`,
          body: input.fragment,
          url,
          dossier_id: input.dossierId,
          dossier_naam: titel ?? undefined,
        })),
    )
  } catch {
    // bewust stil
  }
}
