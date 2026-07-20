import 'server-only'
import { analyseerWerktijden, type BestuurderResultaat } from './werktijd-analyse'
import { beheerOntvangers, maakWagenparkMelding } from './notificaties'
import { pgQuery } from './db'

/**
 * Maandelijkse werktijd-analyse per bestuurder.
 *
 * Draait de adres-bewuste analyse over de VORIGE maand, slaat per bestuurder
 * één rij op in wagenpark_werktijd_maandrapport (JSONB-samenvatting met de
 * per-dag-breakdown en aggregaten) en stuurt één in-app melding naar
 * Directie/beheer met een link naar de werktijden-pagina. De pagina en het
 * PDF-rapport lezen dezelfde opgeslagen data. Bedoeld als Vercel Cron op de
 * 1e van de maand.
 */

export const MAAND_NAMEN = [
  'januari', 'februari', 'maart', 'april', 'mei', 'juni',
  'juli', 'augustus', 'september', 'oktober', 'november', 'december',
]

export type MaandrapportResultaat = {
  jaar: number
  maand: number
  bestuurders: number
  met_signalen: number
  ontvangers: number
}

export type MaandPeriode = { jaar: number; maand: number; van: string; tot: string }

/** Periode-grenzen van de vorige maand (of een expliciete jaar/maand). */
export function maandPeriode(nu: Date, override?: { jaar: number; maand: number }): MaandPeriode {
  let jaar: number
  let maand: number // 1-12
  if (override) {
    jaar = override.jaar
    maand = override.maand
  } else {
    // Vorige maand t.o.v. nu (UTC). getUTCMonth() is 0-11 voor de HUIDIGE maand;
    // dat getal is numeriek gelijk aan de VORIGE maand in 1-index (jul=6 → juni=6).
    jaar = nu.getUTCFullYear()
    maand = nu.getUTCMonth()
    if (maand === 0) {
      jaar -= 1
      maand = 12
    }
  }
  const van = `${jaar}-${String(maand).padStart(2, '0')}-01`
  // Laatste dag: dag 0 van de volgende maand.
  const laatste = new Date(Date.UTC(jaar, maand, 0)).getUTCDate()
  const tot = `${jaar}-${String(maand).padStart(2, '0')}-${String(laatste).padStart(2, '0')}`
  return { jaar, maand, van, tot }
}

export async function genereerWagenparkMaandrapporten(
  nu: Date = new Date(),
  override?: { jaar: number; maand: number },
): Promise<MaandrapportResultaat> {
  const periode = maandPeriode(nu, override)
  const resultaten = await analyseerWerktijden(periode.van, periode.tot)

  let opgeslagen = 0
  for (const r of resultaten) {
    await pgQuery(
      `insert into public.wagenpark_werktijd_maandrapport (user_id_ulu, jaar, maand, samenvatting)
         values ($1, $2, $3, $4::jsonb)
       on conflict (user_id_ulu, jaar, maand) do update set
         samenvatting = excluded.samenvatting, aangemaakt_op = now()`,
      [r.user_id_ulu, periode.jaar, periode.maand, JSON.stringify(r)],
    )
    opgeslagen++
  }

  const metSignalen = resultaten.filter(
    (r) => r.dagen_te_laat > 0 || r.dagen_te_vroeg > 0,
  ).length

  const ontvangers = await beheerOntvangers()
  const maandLabel = `${MAAND_NAMEN[periode.maand - 1]} ${periode.jaar}`
  const titel = `Werktijd-analyse ${maandLabel} beschikbaar`
  const body =
    `Maandanalyse per bestuurder is klaar: ${opgeslagen} bestuurders geanalyseerd, ` +
    `${metSignalen} met te laat / te vroeg. Bekijk de tabel en download het PDF-rapport.`
  const verzonden = await maakWagenparkMelding(
    ontvangers,
    titel,
    body,
    `/wagenpark/werktijden?maand=${periode.jaar}-${String(periode.maand).padStart(2, '0')}`,
  )

  return {
    jaar: periode.jaar,
    maand: periode.maand,
    bestuurders: opgeslagen,
    met_signalen: metSignalen,
    ontvangers: verzonden,
  }
}

/** Lees opgeslagen maandrapporten voor een periode (voor pagina en PDF). */
export async function leesMaandrapporten(
  jaar: number,
  maand: number,
): Promise<BestuurderResultaat[]> {
  const rows = await pgQuery<{ samenvatting: BestuurderResultaat }>(
    `select samenvatting
       from public.wagenpark_werktijd_maandrapport
      where jaar = $1 and maand = $2
      order by aangemaakt_op`,
    [jaar, maand],
  )
  return rows
    .map((r) => r.samenvatting)
    .sort((a, b) => (a.volledige_naam ?? '').localeCompare(b.volledige_naam ?? ''))
}

/** Beschikbare maanden (voor de maand-kiezer op de pagina), nieuwste eerst. */
export async function beschikbareMaanden(): Promise<{ jaar: number; maand: number }[]> {
  const rows = await pgQuery<{ jaar: number; maand: number }>(
    `select distinct jaar, maand
       from public.wagenpark_werktijd_maandrapport
      order by jaar desc, maand desc`,
  )
  return rows
}
