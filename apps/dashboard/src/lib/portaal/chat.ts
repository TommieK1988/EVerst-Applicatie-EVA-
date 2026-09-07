import 'server-only'
import { createAdminClient } from '@everts/database/server'
import type { PortaalBerichtBijlage } from '@everts/database/platform-types'
import { vereisPortaalOnderdeelWeergave } from './auth'
import { meldAanRolhouders } from './meldingen'

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
  await vereisPortaalOnderdeelWeergave(dossierId, 'chat')

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
 * De lastige details (auth_user_id in plaats van medewerkers.id, rolhouders die
 * nog nooit inlogden, de juiste deeplink) staan in lib/portaal/meldingen.ts,
 * zodat het meerwerkbesluit ze niet nog eens hoeft over te doen.
 */
export async function meldKlantberichtAanTeam(input: {
  dossierId: string
  afzender: string
  fragment: string
}): Promise<void> {
  await meldAanRolhouders({
    dossierId: input.dossierId,
    type: 'portaal_bericht',
    titel: `Bericht van ${input.afzender}`,
    body: input.fragment,
  })
}
