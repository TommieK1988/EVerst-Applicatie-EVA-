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
import {
  getAanwezigheidPerDag,
  aanwezigheidSleutel,
  REDEN_TEKST,
  type AanwezigheidPerDag,
} from '@/lib/wagenpark/werktijd-aanwezigheid'
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

/**
 * Hangt de geboekte Bouw7-uren en de aanwezigheid volgens de auto aan de
 * bevindingen.
 *
 * LET OP BIJ OPTELLEN: een dag met zowel een te late aankomst als een vroeg
 * vertrek levert twee rijen op, en die dragen allebei dezelfde aanwezigheid en
 * dezelfde geboekte uren — het is één dag. Wie deze kolommen sommeert moet dus
 * eerst op (bestuurder, datum) ontdubbelen; zie `bouwSamenvatting` en de
 * exporttotalen, die dat allebei doen.
 */
function verrijk(
  bevindingen: WerktijdBevindingRij[],
  uren: UrenPerDag,
  aanwezigheid: AanwezigheidPerDag,
): WerktijdRij[] {
  return bevindingen.map((r) => {
    // Zonder Bouw7-koppeling of zonder bruikbare uren blijft `geboekt` null —
    // een streepje in de tabel, geen misleidende 0,0.
    const dag = uren.fout || !r.bouw7_id ? undefined : uren.perDag.get(`${r.bouw7_id}|${r.datum}`)
    const heeftUren = !uren.fout && !!r.bouw7_id
    const a = aanwezigheid.get(aanwezigheidSleutel(r.user_id_ulu, r.datum))
    return {
      ...r,
      geboekt: heeftUren ? dag?.totaal ?? 0 : null,
      // Let op het onderscheid: géén dagregel = niets geboekt = 0 arbeidsuren,
      // maar een dagregel met `werk: null` betekent "wel geboekt, alleen op een
      // uursoort die nog niet is ingedeeld". Die null moet blijven staan; een
      // `?? 0` erachter zou dat als "niets gewerkt" wegschrijven.
      arbeidsuren: heeftUren ? (dag ? dag.werk : 0) : null,
      uursoorten: uursoortLabel(dag),
      aankomst: a?.aankomst ?? null,
      vertrek: a?.vertrek ?? null,
      aanwezigMinuten: a?.nettoMinuten ?? null,
      pauzeMinuten: a?.pauzeMinuten ?? 0,
      pauzeInRooster: a?.pauzeInRooster ?? false,
      aanwezigReden: a?.reden ? REDEN_TEKST[a.reden] : a ? null : REDEN_TEKST.geen_ritten,
    }
  })
}

/**
 * Alle werktijd-afwijkingen in een periode, optioneel van één bestuurder.
 *
 * De uren komen in één Bouw7-call voor de hele periode; faalt die, dan tonen de
 * urenkolommen een streepje en blijft de rest gewoon werken. Hetzelfde geldt
 * voor de aanwezigheid: die komt uit de ritten van dezelfde periode en is
 * fail-soft, want de lijst met afwijkingen moet ook zonder bruikbaar
 * aanwezigheidsvenster te lezen zijn.
 */
export async function laadWerktijdGegevens(
  van: string,
  tot: string,
  userIdUlu: string | null = null,
): Promise<WerktijdGegevens> {
  const [bevindingen, handmatig, uren, aanwezigheid] = await Promise.all([
    pgQuery<WerktijdBevindingRij>(BEVINDINGEN_SQL, [van, tot, userIdUlu]),
    pgQuery<{ aantal: number }>(HANDMATIG_SQL, [van, tot, userIdUlu]),
    getUrenPerDag(van, tot),
    getAanwezigheidPerDag(van, tot, userIdUlu),
  ])

  return {
    rijen: verrijk(bevindingen, uren, aanwezigheid),
    handmatigAantal: handmatig[0]?.aantal ?? 0,
    urenFout: uren.fout,
  }
}
