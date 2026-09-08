import { Clock, Lock } from 'lucide-react'
import { createClient as createServerClient } from '@everts/database/server'
import PageHeader from '@/components/wagenpark/shared/PageHeader'
import EmptyState from '@/components/wagenpark/shared/EmptyState'
import WerktijdenWeergave, {
  type Weergave,
} from '@/components/wagenpark/werktijden/WerktijdenWeergave'
import { pgQuery } from '@/lib/wagenpark/db'
import { magPriveRittenZien } from '@/lib/wagenpark/privacy'
import { laadWerktijdGegevens } from '@/lib/wagenpark/werktijd-bevindingen'
import { bepaalPeriode, datumKort } from '@/lib/wagenpark/periode'
import { laadLayouts } from '@/app/actions/layouts'

export const dynamic = 'force-dynamic'

export default async function WerktijdenPage({
  searchParams,
}: {
  searchParams: Promise<{
    periode?: string
    van?: string
    tot?: string
    weergave?: string
    medewerker?: string
  }>
}) {
  // Aankomst- en vertrektijden van een met naam genoemde medewerker zijn
  // privacygevoelig — zelfde poort als de privé-ritten. De wagenpark-layout
  // heeft de moduletoegang al afgedwongen; dit is de tweede, strengere ring.
  const magPrive = await magPriveRittenZien()
  if (!magPrive) {
    return (
      <>
        <PageHeader titel="Werktijden" />
        <EmptyState
          titel="Alleen voor directie en beheer"
          omschrijving="Dit overzicht toont aankomst- en vertrektijden per medewerker. Vraag directie of een beheerder om de cijfers als je ze nodig hebt."
          icon={Lock}
        />
      </>
    )
  }

  const params = await searchParams
  const periode = bepaalPeriode(params)
  const weergave: Weergave = params.weergave === 'medewerker' ? 'medewerker' : 'dag'
  const medewerker = params.medewerker?.trim() || null

  let user_id: string | null = null
  try {
    const sessionClient = await createServerClient()
    const {
      data: { user },
    } = await sessionClient.auth.getUser()
    user_id = user?.id ?? null
  } catch {
    // niet ingelogd of sessie niet beschikbaar
  }

  const [gegevens, naamRijen, layoutsDag, layoutsSamenvatting, layoutsMedewerker] =
    await Promise.all([
      laadWerktijdGegevens(periode.van, periode.tot),
      // De naam apart ophalen in plaats van uit de rijen plukken: heeft iemand in
      // de gekozen periode geen enkele afwijking, dan is dat juist het antwoord
      // dat je wilt zien — met zijn naam erboven, niet met een leeg scherm.
      medewerker
        ? pgQuery<{ naam: string }>(
            `select volledige_naam as naam from public.ulu_users where id::text = $1`,
            [medewerker],
          )
        : Promise.resolve([]),
      user_id ? laadLayouts(user_id, 'wagenpark-werktijden') : Promise.resolve([]),
      user_id ? laadLayouts(user_id, 'wagenpark-werktijden-samenvatting') : Promise.resolve([]),
      user_id ? laadLayouts(user_id, 'wagenpark-werktijden-medewerker') : Promise.resolve([]),
    ])

  const { rijen, handmatigAantal, urenFout } = gegevens
  const medewerkerNaam = naamRijen[0]?.naam ?? null
  const eigenRijen = medewerker ? rijen.filter((r) => r.user_id_ulu === medewerker) : rijen

  return (
    <>
      <PageHeader
        titel="Werktijden"
        omschrijving={
          `Te laat aangekomen en te vroeg vertrokken. ` +
          `${periode.label} — ${datumKort(periode.van)} t/m ${datumKort(periode.tot)}. ` +
          (handmatigAantal > 0
            ? `${handmatigAantal} handmatig toegekende signalen tellen niet mee: daar is geen tijd van bekend. `
            : '') +
          (urenFout
            ? `Let op: de geboekte uren konden niet uit Bouw7 worden opgehaald (${urenFout}) — de kolom Geboekt is daarom leeg.`
            : '')
        }
      />

      {/* De weergave wordt altijd getoond, ook zonder rijen: anders verdwijnt de
          periodekiezer juist op het moment dat je een andere periode wilt kiezen. */}
      <WerktijdenWeergave
        data={rijen}
        periode={periode}
        weergave={weergave}
        medewerker={medewerker}
        medewerkerNaam={medewerkerNaam}
        layoutsDag={layoutsDag}
        layoutsSamenvatting={layoutsSamenvatting}
        layoutsMedewerker={layoutsMedewerker}
        user_id={user_id}
      />

      {eigenRijen.length === 0 && (
        <div className="mt-4">
          <EmptyState
            titel="Geen afwijkingen in deze periode"
            omschrijving={
              medewerker
                ? 'Deze medewerker heeft in de gekozen periode geen te late aankomsten of vroege vertrekken. Kies hierboven een andere periode.'
                : 'Kies hierboven een andere periode, of draai eerst een compliance-check op de ritten.'
            }
            icon={Clock}
          />
        </div>
      )}
    </>
  )
}
