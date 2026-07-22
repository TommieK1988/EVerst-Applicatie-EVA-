import { Clock, Lock } from 'lucide-react'
import { createClient as createServerClient } from '@everts/database/server'
import PageHeader from '@/components/wagenpark/shared/PageHeader'
import EmptyState from '@/components/wagenpark/shared/EmptyState'
import WerktijdenTabel, {
  type WerktijdRij,
} from '@/components/wagenpark/werktijden/WerktijdenTabel'
import { pgQuery } from '@/lib/wagenpark/db'
import { magPriveRittenZien } from '@/lib/wagenpark/privacy'
import { laadLayouts } from '@/app/actions/layouts'

export const dynamic = 'force-dynamic'

/** Standaard-terugblik in weken; te overschrijven met ?weken=. */
const STANDAARD_WEKEN = 13
const MAX_WEKEN = 104

function vanafDatum(weken: number): string {
  const d = new Date()
  d.setDate(d.getDate() - weken * 7)
  return d.toISOString().slice(0, 10)
}

export default async function WerktijdenPage({
  searchParams,
}: {
  searchParams: Promise<{ weken?: string }>
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
  const weken = Math.min(
    Math.max(Number.parseInt(params.weken ?? '', 10) || STANDAARD_WEKEN, 1),
    MAX_WEKEN,
  )
  const vanaf = vanafDatum(weken)

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

  const [rijen, handmatig, layouts] = await Promise.all([
    // Alleen de ANKER-bevindingen. De andere ritten van dezelfde ritketen dragen
    // hetzelfde aantal minuten mee als verwijzing; die meetellen zou een
    // opgesplitste heenreis dubbel laten tellen. Zie lib/wagenpark/werktijd.ts.
    pgQuery<WerktijdRij>(
      `
      select b.id,
             b.periode_start::text                       as datum,
             coalesce(b.data->>'soort',
                      case when b.regel_code = 'R9' then 'te_laat' else 'te_vroeg' end) as soort,
             (b.data->>'verschil_minuten')::int          as minuten,
             coalesce(b.data->>'verwacht_start', b.data->>'verwacht_eind') as verwacht,
             coalesce(b.data->>'aankomst_werk', b.data->>'vertrek_werk')   as werkelijk,
             coalesce((b.data->>'rooster_benadering')::boolean, false)     as benadering,
             b.ernst::text                               as ernst,
             b.status::text                              as status,
             b.regel_code,
             b.trip_id,
             (b.data->>'user_id_ulu')                    as user_id_ulu,
             coalesce(uu.volledige_naam, 'Bestuurder #' || (b.data->>'user_id_ulu')) as bestuurder,
             to_char(b.periode_start, 'IYYY-"W"IW')      as week,
             date_trunc('week', b.periode_start)::date::text as week_start
        from public.compliance_bevindingen b
        left join public.ulu_users uu on uu.id::text = (b.data->>'user_id_ulu')
       where b.regel_code in ('R9', 'R10')
         and b.data->>'keten_rol' = 'anker'
         -- Een afgewezen bevinding is ingetrokken; die hoort niet in een gesprek
         -- met de medewerker. Geaccepteerde uitzonderingen blijven wél staan —
         -- die wil je juist kunnen benoemen, met hun status erbij.
         and b.status <> 'afgewezen'
         and b.periode_start >= $1::date
       order by b.periode_start desc
      `,
      [vanaf],
    ),
    // Handmatig toegekende R9/R10-signalen hebben geen ritketen en dus geen
    // minuten. Ze stilzwijgend weglaten zou het beeld vertekenen, dus we tellen
    // ze en melden het aantal in de kop.
    pgQuery<{ aantal: number }>(
      `
      select count(*)::int as aantal
        from public.compliance_bevindingen b
       where b.regel_code in ('R9', 'R10')
         and b.data->>'keten_rol' is null
         and b.status <> 'afgewezen'
         and b.periode_start >= $1::date
      `,
      [vanaf],
    ),
    user_id ? laadLayouts(user_id, 'wagenpark-werktijden') : Promise.resolve([]),
  ])

  const handmatigAantal = handmatig[0]?.aantal ?? 0

  return (
    <>
      <PageHeader
        titel="Werktijden"
        omschrijving={
          `Te laat aangekomen en te vroeg vertrokken, per medewerker per week — laatste ${weken} weken ` +
          `(vanaf ${new Date(vanaf).toLocaleDateString('nl-NL')}). ` +
          (handmatigAantal > 0
            ? `${handmatigAantal} handmatig toegekende signalen tellen niet mee: daar is geen tijd van bekend.`
            : '')
        }
      />

      {rijen.length === 0 ? (
        <EmptyState
          titel="Geen afwijkingen in deze periode"
          omschrijving="Er zijn geen R9/R10-bevindingen gevonden. Draai eventueel eerst een compliance-check op de ritten."
          icon={Clock}
        />
      ) : (
        <WerktijdenTabel data={rijen} layouts={layouts} user_id={user_id} />
      )}
    </>
  )
}
