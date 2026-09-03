import 'server-only'
import { createAdminClient } from '@everts/database/server'
import { maakNotificatie } from '@/lib/notificaties/maak'
import { dossierPad } from '@/components/dossiers/open-dossier'
import type { DossierSectie } from '@/components/dossiers/types'
import { PORTAAL_ROLLEN } from './onderdelen'

/**
 * meldingen.ts — een klant deed iets, laat het team het weten.
 *
 * Eén plek voor beide gevallen (een bericht, een besluit over meerwerk), want de
 * lastige details zijn hetzelfde en je wilt ze niet twee keer goed hoeven doen:
 *
 *  - `maakNotificatie` verwacht een **auth.users**-id, niet `medewerkers.id`.
 *    Die verwisseling levert geen foutmelding op; er komt gewoon nooit een
 *    melding aan.
 *  - Rolhouders die nog nooit hebben ingelogd hebben geen auth_user_id en
 *    worden overgeslagen.
 *  - De deeplink gaat naar het Informatie-tabblad van het dossier; welk
 *    routesegment dat is hangt af van de hoofdstatus (`dossierPad`).
 *
 * Gooit nooit: een mislukte melding mag de handeling van de klant niet blokkeren.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

export async function meldAanRolhouders(input: {
  dossierId: string
  type: string
  titel: string
  body: string
  /** Tabblad binnen het dossier; standaard 'informatie'. */
  tab?: string
}): Promise<void> {
  try {
    const rolKolommen = PORTAAL_ROLLEN.map(r => r.kolom).join(', ')
    const { data: dossier } = await db()
      .from('dossiers')
      .select(`titel, hoofdstatus, ${rolKolommen}`)
      .eq('id', input.dossierId)
      .maybeSingle()
    if (!dossier) return

    const rij = dossier as Record<string, unknown>
    const ids = [...new Set(PORTAAL_ROLLEN.map(r => rij[r.kolom]).filter(Boolean))] as string[]
    if (ids.length === 0) return

    const { data: mw } = await db()
      .from('medewerkers')
      .select('id, auth_user_id')
      .in('id', ids)
      .eq('actief', true)

    const sectie = ((rij.hoofdstatus as DossierSectie | null) ?? 'opdracht')
    const basis = dossierPad(sectie, input.dossierId)
    const url = input.tab ? basis.replace(/\/informatie$/, `/${input.tab}`) : basis

    await Promise.all(
      ((mw ?? []) as { auth_user_id: string | null }[])
        .filter(m => m.auth_user_id)
        .map(m => maakNotificatie({
          user_id: m.auth_user_id!,
          type: input.type,
          titel: input.titel,
          body: input.body,
          url,
          dossier_id: input.dossierId,
          dossier_naam: (rij.titel as string | null) ?? undefined,
        })),
    )
  } catch {
    // bewust stil
  }
}

/** Een klant heeft meerwerk goedgekeurd of afgewezen. */
export async function meldMeerwerkbesluitAanTeam(input: {
  dossierId: string
  afzender: string
  besluit: 'akkoord' | 'afgewezen'
  omschrijving: string
  bedrag: string
}): Promise<void> {
  const akkoord = input.besluit === 'akkoord'
  await meldAanRolhouders({
    dossierId: input.dossierId,
    type: 'portaal_meerwerk',
    titel: akkoord
      ? `${input.afzender} gaf akkoord op meerwerk`
      : `${input.afzender} wees meerwerk af`,
    body: `${input.omschrijving} — ${input.bedrag}`,
    // Naar de Meerwerk-tab: daar staat de regel, met het vastgelegde besluit eronder.
    tab: 'meerwerk',
  })
}
