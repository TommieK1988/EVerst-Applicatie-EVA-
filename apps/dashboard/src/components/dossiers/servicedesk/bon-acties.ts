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
  /** Hangt er een calculatie/offerte aan? Bepaalt of "Offerte maken" of "Offerte akkoord" staat. */
  heeftCalculatie: boolean
  /** Staat er een mandaatbedrag op? Zonder mandaat is verhogen betekenisloos. */
  heeftMandaat: boolean
  /** Wacht er al een verhoging op antwoord? */
  verhogingLoopt: boolean
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
      label: ctx.heeftCalculatie ? 'Offerte akkoord' : 'Offerte maken',
      uitleg: dicht
        ? 'Deze bon is afgesloten.'
        : ctx.heeftCalculatie
          ? 'Leg vast dat de klant akkoord is; de bon gaat op aangenomen.'
          : 'Maak een calculatie bij deze bon en werk die uit tot een offerte.',
      kan: !dicht,
    },
    {
      sleutel: 'mandaatverhoging',
      /**
       * Loopt er al een aanvraag, dan is de vervolgstap niet nóg een aanvraag maar het antwoord
       * vastleggen. De knop verandert dus mee in plaats van grijs te worden: een uitgeschakelde
       * knop die "aanvragen" zegt vertelt je niet wat je dan wél moet doen.
       */
      label: ctx.verhogingLoopt ? 'Verhoging toekennen' : 'Mandaatverhoging aanvragen',
      uitleg: dicht
        ? 'Deze bon is afgesloten.'
        : ctx.verhogingLoopt
          ? 'Leg vast welk mandaat de opdrachtgever heeft toegekend.'
          : ctx.heeftMandaat
            ? 'Vraag de opdrachtgever om een hoger maximum voor deze bon.'
            : 'Er staat nog geen mandaat op de bon; je vult het bedrag in het venster in.',
      // Ook zonder mandaat kan dit: het venster vraagt het bedrag dan gewoon als eerste uit.
      kan: !dicht,
    },
  ]

  return acties
}
