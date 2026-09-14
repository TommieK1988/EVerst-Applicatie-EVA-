import 'server-only'
import { createAdminClient } from '@everts/database/server'
import { haalAlleRijen } from '@/lib/supabase/paginate'
import { periodeBereik, type UrenPeriode } from './types'
import { signBonnen } from './bonnen'
import type { OnkostenSoort, Vervoermiddel } from './onkosten'

/**
 * De ingediende parkeer- en reiskosten over een periode, voor het bedrijfsbrede urenoverzicht.
 *
 * Los van `getAlleUren`: die haalt urenregels uit Bouw7, deze leest EVA's eigen tabel. Onkosten
 * gaan bewust niet naar Bouw7 (de hour-log daar kent geen geldbedragen), dus er is geen bron om
 * ze aan vast te knopen — het zijn twee lijsten naast elkaar over hetzelfde tijdvak.
 */

/** De kolommen die we opvragen; los benoemd zodat er geen any aan te pas komt. */
type OnkostenRij = {
  id: string
  datum: string
  soort: string
  vervoermiddel: string | null
  km: number | string | null
  bedrag: number | string
  omschrijving: string | null
  bon_pad: string | null
  medewerkers: { voornaam: string | null; tussenvoegsel: string | null; achternaam: string | null } | null
}

export type OnkostenRegel = {
  id: string
  datum: string
  medewerker: string
  soort: OnkostenSoort
  vervoermiddel: Vervoermiddel | null
  km: number | null
  bedrag: number
  omschrijving: string | null
  /** Verse signed URL; de bonnen-bucket is privé. */
  bonUrl: string | null
}

export type OnkostenOverzicht = {
  regels: OnkostenRegel[]
  totaal: number
}

export async function getOnkosten(periode: UrenPeriode): Promise<OnkostenOverzicht> {
  const { van, tot } = periodeBereik(periode)
  const supabase = createAdminClient()

  // Gepagineerd: een jaarperiode kan over de 1000 rijen gaan en PostgREST kapt dan stil af.
  // De .order() is de stabiele sortering die de paginering nodig heeft.
  const rijen = await haalAlleRijen<OnkostenRij>((vanaf, totEn) =>
    supabase
      .from('uren_onkosten')
      .select('id, datum, soort, vervoermiddel, km, bedrag, omschrijving, bon_pad, medewerkers(voornaam, tussenvoegsel, achternaam)')
      .gte('datum', van)
      .lte('datum', tot)
      .order('datum')
      .order('id')
      .range(vanaf, totEn) as unknown as PromiseLike<{ data: OnkostenRij[] | null; error: { message: string } | null }>)

  const bonLinks = await signBonnen(rijen.map(r => r.bon_pad))

  const regels: OnkostenRegel[] = rijen.map(r => {
    const naam = [r.medewerkers?.voornaam, r.medewerkers?.tussenvoegsel, r.medewerkers?.achternaam]
      .filter(Boolean).join(' ')
    return {
      id: r.id,
      datum: r.datum,
      medewerker: naam || '—',
      soort: r.soort as OnkostenSoort,
      vervoermiddel: (r.vervoermiddel as Vervoermiddel) ?? null,
      km: r.km == null ? null : Number(r.km),
      bedrag: Number(r.bedrag),
      omschrijving: r.omschrijving,
      bonUrl: bonLinks.get(r.bon_pad ?? '') ?? null,
    }
  })

  return { regels, totaal: regels.reduce((s, r) => s + r.bedrag, 0) }
}
