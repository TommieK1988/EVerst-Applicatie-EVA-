import 'server-only'
import { vereisPortaalOnderdeel } from './auth'
import { getDossierMeerwerk } from '@/lib/dossiers/meerwerk'

/**
 * meerwerk.ts — het meerwerk zoals de opdrachtgever het ziet.
 *
 * Hergebruikt `getDossierMeerwerk()` omdat daar de hele rekenlogica in zit: een
 * regieregel of een stelpost op geboekte kosten heeft geen vast bedrag maar wordt
 * live uit Bouw7 opgeteld. Die functie doet echter `select('*')`, dus wordt hier
 * strikt gemapt.
 *
 * WAT ER NOOIT UIT MAG. `begroot_bedrag` is de kostprijs uit Bouw7 en staat op
 * dezelfde rij als het verkoopbedrag — samen is dat onze marge, uitgerekend en
 * wel. Verder blijven `bewakingscode` en alle `bouw7_*` binnen (interne
 * administratie), `termijn_wijze` en `factuurreferentie` (onze facturatiekeuze),
 * en `afgewezen_reden`: dat is de reden die een collega intern noteert, niet de
 * toelichting die de klant zelf gaf. Die laatste staat in `besluit_opmerking`.
 *
 * De maatstaf voor "wat mag een klant zien" is het bestaande meerwerkoverzicht
 * in lib/dossiers/meerwerk-overzicht-pdf.ts; dat gaat al naar opdrachtgevers toe.
 */

/** Statussen in klanttaal. De interne namen zeggen hem niets. */
const STATUS_LABEL: Record<string, string> = {
  aangevraagd:       'In voorbereiding',
  offerte_verstuurd: 'Wacht op uw akkoord',
  akkoord:           'Akkoord',
  afgewezen:         'Afgewezen',
  voltooid:          'Uitgevoerd',
}

export type PortaalMeerwerkRegel = {
  id: string
  nummer: string
  omschrijving: string
  status: string
  /** Kan de klant hier nú iets mee? Alleen bij een verstuurde offerte. */
  teBeoordelen: boolean
  bedragExcl: number
  btwPct: number
  bedragIncl: number
  /** Wordt op nacalculatie afgerekend; het bedrag is dan een richtbedrag. */
  opNacalculatie: boolean
  datum: string | null
  /** Vastgelegd besluit: wie, wanneer, en de eigen toelichting. */
  besluit: {
    op: string
    door: string
    opmerking: string | null
  } | null
}

export type PortaalMeerwerkData = {
  regels: PortaalMeerwerkRegel[]
  /** Alleen wat is goedgekeurd telt mee als "erbij gekomen". */
  goedgekeurdExcl: number
  /** Hoeveel regels wachten op een besluit van de klant. */
  openAantal: number
}

/** De enige status waarin de klant mag beslissen. */
export const BEOORDEELBARE_STATUS = 'offerte_verstuurd'

export async function getPortaalMeerwerk(dossierId: string): Promise<PortaalMeerwerkData> {
  await vereisPortaalOnderdeel(dossierId, 'meerwerk')

  const data = await getDossierMeerwerk(dossierId)

  const regels: PortaalMeerwerkRegel[] = data.regels.map(r => ({
    id: r.id,
    nummer: `MW${String(r.volgnummer).padStart(2, '0')}`,
    omschrijving: r.omschrijving,
    status: STATUS_LABEL[r.status] ?? 'Loopt',
    teBeoordelen: r.status === BEOORDEELBARE_STATUS,
    // effectiefExcl is bij regie en stelposten het live opgetelde bedrag uit
    // Bouw7. Staat daar (nog) niets op geboekt, dan is dat 0 -- en een klant die
    // bij afgerond werk "EUR 0,00" leest, denkt terecht dat er iets niet klopt.
    // Val dan terug op het afgesproken bedrag; dat is het beste getal dat we hebben.
    bedragExcl: r.effectiefExcl !== 0 ? r.effectiefExcl : (Number(r.bedrag_excl_btw) || 0),
    btwPct: Number(r.btw_pct) || 0,
    bedragIncl: r.effectiefIncl !== 0
      ? r.effectiefIncl
      : (Number(r.bedrag_excl_btw) || 0) * (1 + (Number(r.btw_pct) || 0) / 100),
    opNacalculatie: r.afrekenwijze === 'regie'
      || (r.is_stelpost && r.stelpost_grondslag === 'geboekte_kosten'),
    datum: r.created_at ?? null,
    besluit: r.besluit_op
      ? {
          op: r.besluit_op,
          // Ontbreekt de naam (oude regels van vóór de vastlegging), dan liever
          // "Everts" dan een lege regel die suggereert dat er niets bekend is.
          door: r.besluit_door_naam || (r.besluit_door_soort === 'klant' ? 'U' : 'Everts'),
          opmerking: r.besluit_opmerking ?? null,
        }
      : null,
  }))

  return {
    regels,
    goedgekeurdExcl: data.totalen.goedgekeurdExcl,
    openAantal: regels.filter(r => r.teBeoordelen).length,
  }
}
