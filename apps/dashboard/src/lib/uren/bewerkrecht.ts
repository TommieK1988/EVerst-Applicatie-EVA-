/**
 * Wie mag een geboekte urenregel aanpassen, splitsen of de goedkeuring ervan intrekken.
 *
 * Puur en zonder server-imports: het Uren-overzicht gebruikt dit om te bepalen wat een klik op
 * een regel doet, en de server-acties (`corrigeerUurregel`, `splitsUurregel`) toetsen er
 * opnieuw mee. Eén regel op één plek, anders opent het scherm een venster dat de server bij
 * Opslaan weigert -- precies zo kon projectbureau eerder niets corrigeren: de projectleider zag
 * het venster van een regel die nog bij de teamleider lag, en kreeg bij Opslaan "staat niet op
 * jouw akkoord".
 *
 * AANPASSEN IS GEEN GOEDKEUREN. Daarom is aanpassen ruimer dan goedkeuren:
 *
 *   eigen goedkeurder van de medewerker (niet-gewerkt / indirect) -> alleen hij
 *   teamleider van het dossier, zolang hij nog niet akkoord is    -> mag
 *   projectleider van het dossier                                 -> mag, óók als de regel nog
 *                                                                    bij de teamleider ligt; die
 *                                                                    keurt hem daarna zelf
 *   teamleider die al akkoord gaf                                 -> niet meer; de regel ligt nu
 *                                                                    bij de projectleider
 *
 * Een goedgekeurde regel ligt vast. Wie het eindakkoord geeft (de projectleider, of bij de
 * route via de eigen goedkeurder die goedkeurder) kan dat akkoord intrekken; daarna is de regel
 * weer open en aan te passen. Zie `trekGoedkeuringIn`.
 */

export type RegelRollen = {
  goedgekeurd: boolean
  /** Projectrollen op het dossier waarop de uren staan. */
  teamleiderId: string | null
  projectleiderId: string | null
  /** Gevuld = de uren lopen via de eigen goedkeurder van de medewerker; die vervangt de rollen. */
  vasteGoedkeurderId: string | null
  /** De teamleider van het dossier heeft al akkoord gegeven. */
  tlAkkoord: boolean
}

export type GeenBewerkrecht = 'nietAanZet' | 'alGoedgekeurd' | 'alDoorgezet' | 'geenRollen'

export type Bewerkrecht =
  | { mag: 'aanpassen' }
  /** Goedgekeurd, en ik ben degene die dat akkoord mag intrekken. */
  | { mag: 'intrekken' }
  | { mag: null; reden: GeenBewerkrecht }

export function bewerkrecht(r: RegelRollen, ikId: string): Bewerkrecht {
  const viaGoedkeurder = r.vasteGoedkeurderId != null

  if (r.goedgekeurd) {
    const eindstation = viaGoedkeurder ? r.vasteGoedkeurderId : r.projectleiderId
    return eindstation === ikId ? { mag: 'intrekken' } : { mag: null, reden: 'alGoedgekeurd' }
  }

  if (viaGoedkeurder) {
    return r.vasteGoedkeurderId === ikId ? { mag: 'aanpassen' } : { mag: null, reden: 'nietAanZet' }
  }
  if (!r.teamleiderId && !r.projectleiderId) return { mag: null, reden: 'geenRollen' }
  if (r.projectleiderId === ikId) return { mag: 'aanpassen' }
  if (r.teamleiderId === ikId) {
    return r.tlAkkoord ? { mag: null, reden: 'alDoorgezet' } : { mag: 'aanpassen' }
  }
  return { mag: null, reden: 'nietAanZet' }
}

/** Waarom het niet mag, in gewone taal -- voor een melding, niet voor een foutcode. */
export function bewerkrechtUitleg(
  reden: GeenBewerkrecht,
  namen: {
    /** Wie er nu aan zet is. */
    wachtOp?: string | null
    projectleider?: string | null
    /** De uren lopen via de eigen goedkeurder van de medewerker. */
    viaGoedkeurder?: boolean
  } = {},
): string {
  const pl = namen.projectleider || 'de projectleider'
  switch (reden) {
    case 'alGoedgekeurd':
      return namen.viaGoedkeurder
        ? 'Deze regel is al goedgekeurd. Alleen de goedkeurder van deze medewerker kan dat intrekken.'
        : `Deze regel is al goedgekeurd. Alleen ${pl} kan de goedkeuring intrekken.`
    case 'alDoorgezet':
      return `Je hebt deze regel al goedgekeurd; hij ligt nu bij ${pl}. Die kan hem nog aanpassen.`
    case 'geenRollen':
      return 'Op dit dossier staat geen teamleider of projectleider, dus niemand kan deze regel in EVA beoordelen. Vul die rollen in op het dossier.'
    case 'nietAanZet':
    default:
      return namen.wachtOp
        ? `Deze regel ligt bij ${namen.wachtOp}; alleen die kan hem aanpassen.`
        : 'Deze uurregel staat niet op jouw akkoord.'
  }
}
