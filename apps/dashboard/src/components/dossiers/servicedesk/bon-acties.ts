/**
 * De vier kernhandelingen van een servicedeskbon, en wanneer ze kunnen.
 *
 * Pure tabel, los van het scherm, zodat de voorwaarden te lezen en te testen zijn zonder een
 * component te renderen. Het scherm bepaalt alleen hoe een knop eruitziet.
 *
 * **Ze staan er altijd.** Kan een handeling nu niet, dan is de knop uitgeschakeld mét de reden
 * ernaast — niet verborgen. Een knop die verdwijnt laat je zoeken; een knop die uitlegt waarom
 * hij uit staat, leert je de werkwijze. Daarom draagt elke actie een `uitleg`, ook als hij wél
 * kan: een grijze knop zonder tekst is het slechtste van beide.
 */

export type BonActieSleutel = 'onderaannemer' | 'inplannen' | 'offerte' | 'mandaatverhoging'

/** Wat er van de bon bekend moet zijn om te weten welke knoppen kunnen. */
export type BonContext = {
  /** Hangt er een calculatie/offerte aan? Bepaalt of "Offerte maken" of "Offerte gewonnen" staat. */
  heeftCalculatie: boolean
  /** Staat er een mandaatbedrag op? Zonder mandaat is verhogen betekenisloos. */
  heeftMandaat: boolean
  /**
   * Staat de bon op Wachten op opdrachtgever? Dan leggen de knoppen bovenaan het antwoord vast
   * (goedgekeurd, gewonnen, vervallen) en is "Offerte gewonnen" hieronder dubbel.
   */
  wachtOpOpdrachtgever: boolean
  /** Afgesloten bonnen zijn overal alleen-lezen. */
  alleenLezen: boolean
}

export type BonActie = {
  sleutel: BonActieSleutel
  label: string
  /** Eén zin onder de knop: wat hij doet, of waarom hij niet kan. */
  uitleg: string
  kan: boolean
  /** De primaire knop van dit blok; er is er hoogstens één (design system). */
  primair?: boolean
}

export function bonActies(ctx: BonContext): BonActie[] {
  const dicht = ctx.alleenLezen

  const acties: BonActie[] = [
    {
      sleutel: 'onderaannemer',
      label: 'Onderaannemerscontract maken',
      uitleg: dicht
        ? 'Deze bon is afgesloten.'
        : 'Stel de regels samen in de werkbegroting en zet er een opdracht uit.',
      kan: !dicht,
      primair: !dicht,
    },
    {
      sleutel: 'inplannen',
      label: 'Medewerker inplannen',
      uitleg: dicht
        ? 'Deze bon is afgesloten.'
        : 'Zet er direct iemand op: wie, wanneer, hoe lang.',
      kan: !dicht,
    },
    {
      sleutel: 'offerte',
      label: ctx.heeftCalculatie ? 'Offerte gewonnen' : 'Offerte maken',
      uitleg: dicht
        ? 'Deze bon is afgesloten.'
        : ctx.heeftCalculatie
          ? ctx.wachtOpOpdrachtgever
            ? 'Gebruik "Offerte gewonnen" bovenaan.'
            : 'De klant is akkoord: de bon gaat naar In voorbereiding en rekent af op aangenomen.'
          : 'Maak een calculatie bij deze bon en werk die uit tot een offerte.',
      kan: !dicht && !(ctx.heeftCalculatie && ctx.wachtOpOpdrachtgever),
    },
    {
      sleutel: 'mandaatverhoging',
      // Het antwoord vastleggen ("Mandaatverhoging goedgekeurd") staat bovenaan zodra de bon op
      // Wachten op opdrachtgever staat; deze knop is altijd de vraag zelf.
      label: 'Mandaatverhoging aanvragen',
      uitleg: dicht
        ? 'Deze bon is afgesloten.'
        : ctx.heeftMandaat
          ? 'Mail de opdrachtgever een verzoek om een hoger maximum; de bon gaat op Wachten op opdrachtgever.'
          : 'Er staat nog geen mandaat op de bon; je vult het bedrag in het venster in.',
      // Ook zonder mandaat kan dit: het venster vraagt het bedrag dan gewoon als eerste uit.
      kan: !dicht,
    },
  ]

  return acties
}
