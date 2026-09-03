/**
 * Acties waarbij de uitvoerder op zijn telefoon méér doet dan afvinken.
 *
 * Drie doorlopen delen dezelfde vorm: de actie is de ingang naar werk dat elders wordt
 * geregistreerd, en die registratie zet de actie zélf op gereed. Ze horen daarom ook hetzelfde
 * te ogen — één groene startknop, en geen los vinkje dat de doorloop kan overslaan.
 *
 * Bewust framework-vrij: de mobiele server-page, de client-lijst en het desktop-taakdetail
 * importeren dit alle drie.
 */

export type UitvoerActieSoort = 'formulier' | 'kwaliteit' | 'toolbox' | 'opname'

export type UitvoerActie = {
  soort: UitvoerActieSoort
  /** Label op de knop. */
  label: string
  /** Doorloop-URL; alle drie schermen leven onder /m. */
  href: string
  /** Uitleg bij het vergrendelde vinkje (title + aria-label). */
  badgeUitleg: string
}

/** De velden op een taak die een doorloop verraden. */
export type TaakMetUitvoer = {
  id: string
  formulier_template_id?: string | null
  kwaliteit_ronde?: boolean | null
  opname_ronde?: boolean | null
  /** Id van een nog niet afgeronde toolbox-toewijzing; hangt niet op `tasks` maar ernaast. */
  toolbox_toewijzing_id?: string | null
}

/**
 * Leidt af welke doorlopen aan een taak hangen.
 *
 * Een lijst en geen enkele waarde: de vlaggen sluiten elkaar niet uit, en een taak met zowel een
 * formulier als een ronde hoort beide ingangen te tonen. Volgorde is de bestaande rendervolgorde.
 */
export function bepaalUitvoerActies(taak: TaakMetUitvoer): UitvoerActie[] {
  const acties: UitvoerActie[] = []

  if (taak.formulier_template_id) {
    acties.push({
      soort: 'formulier',
      label: 'Formulier invullen',
      href: `/m/taken/${taak.id}/formulier`,
      badgeUitleg: 'Deze actie sluit automatisch zodra je het formulier hebt ingediend',
    })
  }

  if (taak.kwaliteit_ronde) {
    acties.push({
      soort: 'kwaliteit',
      label: 'Kwaliteitsronde starten',
      href: `/m/taken/${taak.id}/kwaliteit`,
      badgeUitleg: 'Deze actie sluit automatisch zodra de kwaliteitsronde definitief is',
    })
  }

  if (taak.opname_ronde) {
    acties.push({
      soort: 'opname',
      label: 'Opname starten',
      href: `/m/taken/${taak.id}/opname`,
      badgeUitleg: 'Deze actie sluit automatisch zodra de opname is afgerond',
    })
  }

  if (taak.toolbox_toewijzing_id) {
    acties.push({
      soort: 'toolbox',
      label: 'Toolbox openen',
      href: `/m/toolbox/${taak.toolbox_toewijzing_id}`,
      badgeUitleg: 'Deze actie sluit automatisch zodra je de toolbox hebt doorlopen',
    })
  }

  return acties
}
