import { Clock, Lock } from 'lucide-react'
import { createClient as createServerClient } from '@everts/database/server'
import PageHeader from '@/components/wagenpark/shared/PageHeader'
import EmptyState from '@/components/wagenpark/shared/EmptyState'
import WerktijdenWeergave, {
  type Weergave,
} from '@/components/wagenpark/werktijden/WerktijdenWeergave'
import type {
  WerktijdRij,
  WerktijdBevindingRij,
} from '@/components/wagenpark/werktijden/WerktijdenTabel'
import { pgQuery } from '@/lib/wagenpark/db'
import { magPriveRittenZien } from '@/lib/wagenpark/privacy'
import { getUrenPerDag, uursoortLabel } from '@/lib/wagenpark/werktijd-uren'
import { bepaalPeriode, datumKort } from '@/lib/wagenpark/periode'
import { laadLayouts } from '@/app/actions/layouts'

export const dynamic = 'force-dynamic'

export default async function WerktijdenPage({
  searchParams,
}: {
  searchParams: Promise<{ periode?: string; van?: string; tot?: string; weergave?: string }>
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

  const [bevindingen, handmatig, uren, layoutsDag, layoutsSamenvatting] = await Promise.all([
    // Alleen de ANKER-bevindingen. De andere ritten van dezelfde ritketen dragen
    // hetzelfde aantal minuten mee als verwijzing; die meetellen zou een
    // opgesplitste heenreis dubbel laten tellen. Zie lib/wagenpark/werktijd.ts.
    pgQuery<WerktijdBevindingRij>(
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
             date_trunc('week', b.periode_start)::date::text as week_start,
             -- Brug naar de urenboekingen: het Bouw7-uurlog kent alleen een
             -- employee-id. Zie lib/wagenpark/werktijd-uren.ts.
             m.bouw7_id
        from public.compliance_bevindingen b
        left join public.ulu_users uu on uu.id::text = (b.data->>'user_id_ulu')
        left join public.medewerkers m on m.id = uu.medewerker_id
       where b.regel_code in ('R9', 'R10')
         and b.data->>'keten_rol' = 'anker'
         -- Alle statussen. NIET op status filteren: de waarde 'afgewezen'
         -- betekent hier "verklaring afgewezen, overtreding bevestigd" en niet
         -- "ingetrokken", dus wegfilteren zou juist de bevestigde gevallen
         -- verbergen. De werklijst wordt in de UI teruggebracht tot 'open'.
         and b.periode_start between $1::date and $2::date
       order by b.periode_start desc
      `,
      [periode.van, periode.tot],
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
         and b.periode_start between $1::date and $2::date
      `,
      [periode.van, periode.tot],
    ),
    // Geboekte uren om de signalen mee te controleren. Eén Bouw7-call voor de
    // hele periode; faalt hij, dan tonen de kolommen een streepje en blijft de
    // rest van de pagina gewoon werken.
    getUrenPerDag(periode.van, periode.tot),
    user_id ? laadLayouts(user_id, 'wagenpark-werktijden') : Promise.resolve([]),
    user_id ? laadLayouts(user_id, 'wagenpark-werktijden-samenvatting') : Promise.resolve([]),
  ])

  const handmatigAantal = handmatig[0]?.aantal ?? 0

  // Uren aan de bevindingen hangen. Zonder Bouw7-koppeling of zonder bruikbare
  // uren blijft `geboekt` null — een streepje in de tabel, geen misleidende 0,0.
  const rijen: WerktijdRij[] = bevindingen.map((r) => {
    if (uren.fout || !r.bouw7_id) return { ...r, geboekt: null, uursoorten: null }
    const dag = uren.perDag.get(`${r.bouw7_id}|${r.datum}`)
    return {
      ...r,
      geboekt: dag?.totaal ?? 0,
      uursoorten: uursoortLabel(dag),
    }
  })

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
          (uren.fout
            ? `Let op: de geboekte uren konden niet uit Bouw7 worden opgehaald (${uren.fout}) — de kolom Geboekt is daarom leeg.`
            : '')
        }
      />

      {/* De weergave wordt altijd getoond, ook zonder rijen: anders verdwijnt de
          periodekiezer juist op het moment dat je een andere periode wilt kiezen. */}
      <WerktijdenWeergave
        data={rijen}
        periode={periode}
        weergave={weergave}
        layoutsDag={layoutsDag}
        layoutsSamenvatting={layoutsSamenvatting}
        user_id={user_id}
      />

      {rijen.length === 0 && (
        <div className="mt-4">
          <EmptyState
            titel="Geen afwijkingen in deze periode"
            omschrijving="Kies hierboven een andere periode, of draai eerst een compliance-check op de ritten."
            icon={Clock}
          />
        </div>
      )}
    </>
  )
}
