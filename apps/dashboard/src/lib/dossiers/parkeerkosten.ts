import 'server-only'
import { pgQuery } from '@/lib/wagenpark/db'

/**
 * Parkeerkosten die aan dit dossier zijn toegewezen.
 *
 * Deze kosten staan (nog) niet in Bouw7: daar zitten ze in de algemene kosten
 * van de ULU-verzamelfactuur. Ze horen daarom niet tussen de Bouw7-kolommen van
 * het Financieel-tab — die tellen per rij exact op tot "Geboekte kosten", en een
 * EVA-only bedrag ertussen maakt die belofte onwaar. Vandaar een eigen blok op
 * het Inkoop-tab, waar de EVA-rekenlaag al thuishoort.
 *
 * Query via de wagenpark-pooler (`pgQuery`), net als de rest van de
 * parkeerketen. Begrensd op één dossier, dus ver onder elke rijgrens.
 */

export type DossierParkeerRegel = {
  id: string
  datum: string
  starttijd: string
  kenteken: string
  bestuurder: string | null
  locatie: string | null
  bedrag: number
  aandeel: number
  status: 'bevestigd' | 'voorstel'
  bevestigingBron: 'automatisch' | 'handmatig' | null
}

export type DossierParkeerkosten = {
  regels: DossierParkeerRegel[]
  /** Alleen bevestigde regels; een voorstel is nog geen kost. */
  totaal: number
  openVoorstellen: number
  openBedrag: number
}

export async function getDossierParkeerkosten(dossierId: string): Promise<DossierParkeerkosten> {
  const rijen = await pgQuery<{
    id: string
    datum: string
    starttijd: string
    kenteken: string
    bestuurder: string | null
    locatie: string | null
    bedrag: number
    aandeel: number
    status: string
    bevestiging_bron: string | null
  }>(
    `
    select t.id,
           t.datum::text                                as datum,
           p.parkeer_starttijd::text                    as starttijd,
           p.kenteken,
           trim(concat_ws(' ', m.voornaam, m.tussenvoegsel, m.achternaam)) as bestuurder,
           p.parkeerlocatie                             as locatie,
           t.bedrag::float                              as bedrag,
           t.aandeel::float                             as aandeel,
           t.status,
           t.bevestiging_bron
      from public.parkeer_toewijzingen t
      join public.ulu_parking p on p.id = t.parking_id
      left join public.medewerkers m on m.id = t.medewerker_id
     where t.dossier_id = $1
       and t.status in ('bevestigd', 'voorstel')
     order by p.parkeer_starttijd desc
    `,
    [dossierId],
  )

  const regels: DossierParkeerRegel[] = rijen.map((r) => ({
    id: r.id,
    datum: r.datum,
    starttijd: r.starttijd,
    kenteken: r.kenteken,
    bestuurder: r.bestuurder || null,
    locatie: r.locatie,
    bedrag: r.bedrag,
    aandeel: r.aandeel,
    status: r.status === 'bevestigd' ? 'bevestigd' : 'voorstel',
    bevestigingBron:
      r.bevestiging_bron === 'automatisch' || r.bevestiging_bron === 'handmatig'
        ? r.bevestiging_bron
        : null,
  }))

  const bevestigd = regels.filter((r) => r.status === 'bevestigd')
  const voorstellen = regels.filter((r) => r.status === 'voorstel')

  return {
    regels,
    totaal: bevestigd.reduce((s, r) => s + r.bedrag, 0),
    openVoorstellen: voorstellen.length,
    openBedrag: voorstellen.reduce((s, r) => s + r.bedrag, 0),
  }
}
