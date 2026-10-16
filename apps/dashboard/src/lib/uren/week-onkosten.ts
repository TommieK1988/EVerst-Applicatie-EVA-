import 'server-only'
import { signBonnen } from './bonnen'
import type { OnkostenSoort, Vervoermiddel } from './onkosten'
import type { KostenStatus } from './onkosten-route'

/**
 * De kostenposten van één weekstaat, zoals de medewerker ze op zijn telefoon ziet.
 *
 * Los van `./weekstaat` omdat dat bestand al aan de grens van 800 regels zit; de vorm van een
 * kostenpost is bovendien een eigen onderwerp met een eigen goedkeuring.
 */
export type WeekOnkosten = {
  id: string
  datum: string
  soort: OnkostenSoort
  /** Alleen bij reiskosten; auto en bromfiets rekenen per kilometer, OV vraagt een kaartje. */
  vervoermiddel: Vervoermiddel | null
  bedrag: number
  km: number | null
  omschrijving: string | null
  /** Verse signed URL van het bonnetje; de bucket is prive, zie ./bonnen. */
  bon_url: string | null
  /** "nummer · titel" van het project, of null bij geen project. */
  project_label: string | null
  /** De projectleider (of zonder project de eigen goedkeurder) beoordeelt elke post apart. */
  goedkeuring_status: KostenStatus
  afkeur_reden: string | null
}

/** Een rij uit `uren_onkosten` met `dossiers(dossiernummer, titel)` erbij. */
type Rij = {
  id: string
  datum: string
  soort: string
  vervoermiddel: string | null
  bedrag: number | string
  km: number | string | null
  omschrijving: string | null
  bon_pad: string | null
  goedkeuring_status: string
  afkeur_reden: string | null
  dossiers: { dossiernummer: string | null; titel: string | null } | null
}

export const WEEK_ONKOSTEN_SELECT =
  'id, datum, soort, vervoermiddel, bedrag, km, omschrijving, bon_pad, goedkeuring_status, afkeur_reden, dossiers(dossiernummer, titel)'

export async function naarWeekOnkosten(rijen: Rij[]): Promise<WeekOnkosten[]> {
  // Eén batch-call voor alle bonnen van de week; de bucket is privé, dus elke render een verse link.
  const bonLinks = await signBonnen(rijen.map(o => o.bon_pad))
  return rijen.map(o => ({
    id: o.id,
    datum: o.datum,
    soort: o.soort as OnkostenSoort,
    vervoermiddel: (o.vervoermiddel as Vervoermiddel | null) ?? null,
    bedrag: Number(o.bedrag),
    km: o.km == null ? null : Number(o.km),
    omschrijving: o.omschrijving ?? null,
    bon_url: bonLinks.get(o.bon_pad ?? '') ?? null,
    project_label: o.dossiers ? [o.dossiers.dossiernummer, o.dossiers.titel].filter(Boolean).join(' · ') : null,
    goedkeuring_status: o.goedkeuring_status === 'goedgekeurd' || o.goedkeuring_status === 'afgekeurd'
      ? o.goedkeuring_status : 'open',
    afkeur_reden: o.afkeur_reden ?? null,
  }))
}
