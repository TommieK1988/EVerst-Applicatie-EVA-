'use server'

/**
 * Server action van het mobiele fiatteerscherm.
 *
 * WAAROM DEZE TUSSENLAAG. `lib/uren/bouw7-goedkeuring.ts` mag niet rechtstreeks
 * vanuit een client-component geïmporteerd worden. Dat bestand doet
 * `import type { Bouw7Client } from '@/lib/bouw7/client'`, en `Bouw7Client` is een
 * *klasse*. Haalt Next die module door de transformatie voor een client-import,
 * dan sneuvelt die type-import en faalt de productiebuild met "Cannot find name
 * 'Bouw7Client'" — terwijl `tsc --noEmit` er gewoon groen doorheen loopt.
 *
 * Een dynamische import binnen de functie houdt de module uit de client-graaf.
 * Zelfde oplossing als `getUrenTeFiatterenAantal` in `lib/goedkeuren/widget.ts`,
 * dat er om dezelfde reden zo uitziet.
 *
 * De afscherming verandert hier niets: `keurUrenGoed` haalt de meegestuurde regels
 * zelf opnieuw op en toetst ze aan de projectrollen op het dossier.
 */
export type FiatteerResultaat =
  | {
      ok: true
      verwerkt: number
      /** Regels waar jij als teamleider akkoord gaf, maar de projectleider nog moet kijken. */
      wachtOpProjectleider: number
      /** Regels die je hebt goedgekeurd zonder dat de teamleider ernaar had gekeken. */
      overgeslagen: number
      mislukt: number
      /** De eerste foutmelding; genoeg voor een toast op een telefoon. */
      eersteFout: string | null
    }
  /**
   * Er zit werk in de selectie waar de teamleider nog niet langs is geweest. Er is niets
   * verwerkt; het scherm vraagt om bevestiging en roept opnieuw aan met `zonderTeamleider`.
   */
  | {
      ok: false
      bevestigingNodig: true
      aantalZonderTeamleider: number
      totaal: number
      teamleiders: string[]
    }
  | { ok: false; error: string }

export async function fiatteerUren(
  hourLogIds: number[],
  /** De teamleiderstap overslaan — alleen ná bevestiging door de gebruiker. */
  zonderTeamleider = false,
): Promise<FiatteerResultaat> {
  const { keurUrenGoed } = await import('@/lib/uren/bouw7-goedkeuring')
  const r = await keurUrenGoed(hourLogIds, { zonderTeamleider })
  if (!r.ok) {
    return 'bevestigingNodig' in r
      ? {
          ok: false,
          bevestigingNodig: true,
          aantalZonderTeamleider: r.aantalZonderTeamleider,
          totaal: r.totaal,
          teamleiders: r.teamleiders,
        }
      : { ok: false, error: r.error }
  }
  return {
    ok: true,
    verwerkt: r.verwerkt,
    wachtOpProjectleider: r.wachtOpProjectleider,
    overgeslagen: r.overgeslagen,
    mislukt: r.mislukt,
    eersteFout: r.fouten[0] ?? null,
  }
}

/**
 * Een urenregel bijstellen vanaf de telefoon, vóór goedkeuring.
 *
 * DIT IS DE TEAMLEIDERSTAP. Hij is de enige die op mobiel mag corrigeren, en alleen
 * zolang hij nog niet akkoord is: daarna schuift de regel door naar de projectleider
 * en hoort een correctie op de computer thuis. De controle staat hier en niet in het
 * scherm — een verborgen knop is geen afscherming, en `corrigeerUurregel` zelf is
 * ruimer (die laat ook de projectleider corrigeren, wat op de desktop juist mag).
 *
 * De toets is simpel en volgt de keten: staat de regel in `alsTeamleider`, dan wacht
 * hij nog op mijn akkoord. Zodra ik akkoord ben verhuist hij naar `alsProjectleider`
 * en valt hij hier vanzelf buiten.
 */
export async function corrigeerUurregelMobiel(
  hourLogId: number,
  wijziging: { uren?: number; bewakingscodePslId?: number | null; opmerking?: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { getMijnTeKeurenUren, corrigeerUurregel } = await import('@/lib/uren/bouw7-goedkeuring')

  const jaar = new Date().getFullYear()
  const mijn = await getMijnTeKeurenUren(`${jaar - 1}-01-01`, `${jaar + 1}-12-31`, [hourLogId])
  if (mijn.fout) return { ok: false, error: mijn.fout }

  if (!mijn.alsTeamleider.some(r => r.id === hourLogId)) {
    return {
      ok: false,
      error: 'Deze uren kun je hier niet meer aanpassen. Ze staan al bij de projectleider.',
    }
  }

  return corrigeerUurregel(hourLogId, wijziging)
}
