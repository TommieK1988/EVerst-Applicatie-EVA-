/**
 * De R9/R10-bevindingen ophalen zoals de Werktijden-pagina ze toont.
 *
 * Staat apart van de pagina omdat er inmiddels twee afnemers zijn: het scherm
 * zelf en de PDF-uitdraai per medewerker. Die twee moeten per definitie
 * dezelfde rijen laten zien — een uitdraai die andere getallen geeft dan het
 * scherm waarop hij besproken wordt, is erger dan geen uitdraai.
 *
 * Zie `lib/wagenpark/werktijd.ts` voor de anker-valkuil: alleen de rit die de
 * tijd bepaalt draagt de minuten, de andere delen van dezelfde ritketen dragen
 * hetzelfde getal mee als verwijzing en zouden dus dubbel tellen.
 */
import 'server-only'
import { pgQuery } from '@/lib/wagenpark/db'
import { getUrenPerDag, uursoortLabel, type UrenPerDag } from '@/lib/wagenpark/werktijd-uren'
import type {
  WerktijdRij,
  WerktijdBevindingRij,
} from '@/components/wagenpark/werktijden/WerktijdenTabel'

/**
 * `$1` = eerste dag, `$2` = laatste dag (beide inclusief), `$3` = ULU-id van
 * één bestuurder of `null` voor iedereen.
 */
const BEVINDINGEN_SQL = `
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
     and ($3::text is null or b.data->>'user_id_ulu' = $3::text)
   order by b.periode_start desc
`

/**
 * Handmatig toegekende R9/R10-signalen hebben geen ritketen en dus geen minuten.
 * Ze stilzwijgend weglaten zou het beeld vertekenen, dus we tellen ze en melden
 * het aantal in de kop.
 */
const HANDMATIG_SQL = `
  select count(*)::int as aantal
    from public.compliance_bevindingen b
   where b.regel_code in ('R9', 'R10')
     and b.data->>'keten_rol' is null
     and b.periode_start between $1::date and $2::date
     and ($3::text is null or b.data->>'user_id_ulu' = $3::text)
`

export type WerktijdGegevens = {
  rijen: WerktijdRij[]
  /** Aantal handmatige signalen zonder minuten; alleen om te vermelden. */
  handmatigAantal: number
  /** Reden waarom de geboekte uren ontbreken, of null als ze er zijn. */
  urenFout: string | null
}

/** Hangt de geboekte Bouw7-uren aan de bevindingen. */
function metUren(bevindingen: WerktijdBevindingRij[], uren: UrenPerDag): WerktijdRij[] {
  return bevindingen.map((r) => {
    // Zonder Bouw7-koppeling of zonder bruikbare uren blijft `geboekt` null —
    // een streepje in de tabel, geen misleidende 0,0.
    if (uren.fout || !r.bouw7_id) return { ...r, geboekt: null, uursoorten: null }
    const dag = uren.perDag.get(`${r.bouw7_id}|${r.datum}`)
    return { ...r, geboekt: dag?.totaal ?? 0, uursoorten: uursoortLabel(dag) }
  })
}

/**
 * Alle werktijd-afwijkingen in een periode, optioneel van één bestuurder.
 *
 * De uren komen in één Bouw7-call voor de hele periode; faalt die, dan tonen de
 * urenkolommen een streepje en blijft de rest gewoon werken.
 */
export async function laadWerktijdGegevens(
  van: string,
  tot: string,
  userIdUlu: string | null = null,
): Promise<WerktijdGegevens> {
  const [bevindingen, handmatig, uren] = await Promise.all([
    pgQuery<WerktijdBevindingRij>(BEVINDINGEN_SQL, [van, tot, userIdUlu]),
    pgQuery<{ aantal: number }>(HANDMATIG_SQL, [van, tot, userIdUlu]),
    getUrenPerDag(van, tot),
  ])

  return {
    rijen: metUren(bevindingen, uren),
    handmatigAantal: handmatig[0]?.aantal ?? 0,
    urenFout: uren.fout,
  }
}
