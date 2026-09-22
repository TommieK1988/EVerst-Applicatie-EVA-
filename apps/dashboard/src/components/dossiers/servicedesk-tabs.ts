/**
 * De vijf tabs van een servicedeskbon, en wat er onder elke tab valt.
 *
 * Een servicedeskbon had dezelfde veertien tabs als een opdracht. Voor een opdracht van
 * gemiddeld zestigduizend euro is dat terecht; voor een bon van gemiddeld vierhonderd euro
 * betekende het dat je bij elke handeling eerst de goede tab moest zoeken. Gemeten op
 * 22 september 2026: 357 bonnen, waarvan er 352 geen calculatie hebben — voor die bonnen
 * stonden Opname en Calculatie er puur in de weg.
 *
 * De bundeling gebruikt hetzelfde `?deel=`-mechanisme als KAM/VGM: elk deel is een gewone
 * link, zodat de server alleen het gekozen deel rendert. Zou dit client-state zijn, dan zat
 * alles tegelijk in de bundel en haalde alles tegelijk zijn data op — en de zware delen
 * (werkbegroting, verkoop) halen die live uit Bouw7.
 *
 * **Alleen servicedesk.** Een opdracht houdt zijn veertien tabs; die verandering is niet
 * afgestemd en raakt het dagelijks werk van iedereen die met opdrachten werkt.
 *
 * De delen verwijzen naar de bestaande tabs. Er wordt dus niets herschreven: de router
 * rendert nog steeds `InkoopTab`, `VerkoopTab` enzovoort — alleen de weg ernaartoe is korter.
 */

/** Klembord met regels: de opnamelijst. Zelfde pad als in de aanvraag- en opdrachtlijst. */
const OPNAME_ICOON =
  'M9 4h6a1 1 0 0 1 1 1v1H8V5a1 1 0 0 1 1-1ZM8 6H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-2M8.5 11h7M8.5 14.5h7M8.5 18h4'

/** De vijf tab-sleutels zoals ze in de URL staan: `/servicedesk/<id>/<slug>`. */
export type ServicedeskGroepSlug = 'bon' | 'voorbereiding' | 'uitvoering' | 'inkoop' | 'facturatie'

export type ServicedeskDeel = {
  /** Waarde van `?deel=`. Eigen naam, los van de tab die hem rendert. */
  deel: string
  label: string
  /** De bestaande tab-sleutel die dit deel rendert (zie DossierTabContent). */
  tab: string
}

export type ServicedeskGroep = {
  slug: ServicedeskGroepSlug
  label: string
  /** Het `d`-pad van het zijbalkicoon. Staat hier omdat alles over deze tabs hier staat. */
  icoon: string
  /** Het eerste deel is waar je landt zonder `?deel=`. */
  delen: readonly ServicedeskDeel[]
  /**
   * Alleen tonen als dit waar is. Leeg = altijd tonen.
   *
   * Bewust een functie van wat de sidebar tóch al ophaalt (toggles + of er een calculatie
   * hangt), zodat het bundelen geen extra serverronde per dossier kost.
   */
  toonAls?: (ctx: ServicedeskTabContext) => boolean
}

/** Wat er nodig is om te bepalen welke tabs deze bon laat zien. */
export type ServicedeskTabContext = {
  /** Aanstaande dossier-toggles (sleutels). */
  toggles: ReadonlySet<string>
  /** Hangt er een calculatie/offerte aan de bon? */
  heeftCalculatie: boolean
}

export const SERVICEDESK_GROEPEN: readonly ServicedeskGroep[] = [
  {
    slug: 'bon',
    label: 'Bon',
    icoon: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    delen: [
      { deel: 'informatie', label: 'Informatie', tab: 'informatie' },
      { deel: 'bestanden',  label: 'Bestanden',  tab: 'bestanden'  },
      { deel: 'acties',     label: 'Acties',     tab: 'taken'      },
    ],
  },
  {
    /**
     * De weg naar een prijs voor de klant. Staat er alleen als hij ergens over gaat: bij
     * mutatiewerk (waar de opname-toggle vanzelf aangaat) of zodra er een calculatie hangt.
     * Een gewone bon op regie ziet deze tab dus niet.
     */
    slug: 'voorbereiding',
    label: 'Opname & offerte',
    icoon: OPNAME_ICOON,
    delen: [
      { deel: 'opname',     label: 'Opname',     tab: 'opname'     },
      { deel: 'calculatie', label: 'Calculatie', tab: 'calculatie' },
    ],
    toonAls: ({ toggles, heeftCalculatie }) => toggles.has('mutatie_opname') || heeftCalculatie,
  },
  {
    slug: 'uitvoering',
    label: 'Uitvoering',
    icoon: 'M4 4.5v15M7.3 6h4.4a1.3 1.3 0 0 1 0 2.6H7.3a1.3 1.3 0 0 1 0-2.6ZM10.3 10.7h5.4a1.3 1.3 0 0 1 0 2.6h-5.4a1.3 1.3 0 0 1 0-2.6ZM7.3 15.4h2.9a1.3 1.3 0 0 1 0 2.6H7.3a1.3 1.3 0 0 1 0-2.6Z',
    delen: [
      { deel: 'planning', label: 'Planning', tab: 'planning' },
      { deel: 'uren',     label: 'Uren',     tab: 'uren'     },
    ],
  },
  {
    /**
     * Alles wat het geld uit gaat: samenstellen (werkbegroting), prijs opvragen bij een
     * onderaannemer (uitvraag), en terugzien wat er binnenkwam (geboekte kosten). Die drie
     * horen bij elkaar omdat bestellen alléén via de werkbegroting kan — het Inkoop-deel is
     * de spiegel daarvan, geen aparte ingang.
     */
    slug: 'inkoop',
    label: 'Inkoop',
    icoon: 'M2 2h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12M7 21a1 1 0 1 0 2 0a1 1 0 1 0-2 0ZM18 21a1 1 0 1 0 2 0a1 1 0 1 0-2 0Z',
    delen: [
      { deel: 'werkbegroting', label: 'Werkbegroting',   tab: 'werkbegroting' },
      { deel: 'uitvraag',      label: 'Uitvraag',        tab: 'uitvraag'      },
      { deel: 'kosten',        label: 'Geboekte kosten', tab: 'inkoop'        },
    ],
  },
  {
    slug: 'facturatie',
    label: 'Facturatie',
    icoon: 'M6 4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v15.5l-2-1.3-2 1.3-2-1.3-2 1.3-2-1.3-2 1.3ZM9 8h6M9 11h6M9 14h3.5',
    delen: [
      { deel: 'verkoop',    label: 'Verkoop',    tab: 'verkoop'    },
      { deel: 'meerwerk',   label: 'Meerwerk',   tab: 'meerwerk'   },
      { deel: 'financieel', label: 'Financieel', tab: 'financieel' },
    ],
  },
]

const OP_SLUG = new Map(SERVICEDESK_GROEPEN.map(g => [g.slug as string, g]))

/** De groep achter een tab-sleutel, of niets als het geen servicedeskgroep is. */
export function servicedeskGroep(tab: string): ServicedeskGroep | undefined {
  return OP_SLUG.get(tab)
}

/** Het gekozen deel binnen een groep; een onbekende of lege keuze valt terug op het eerste. */
export function servicedeskDeel(groep: ServicedeskGroep, deel: string | undefined): ServicedeskDeel {
  return groep.delen.find(d => d.deel === deel) ?? groep.delen[0]
}

/** De tabs die deze bon laat zien, in volgorde. */
export function zichtbareServicedeskGroepen(ctx: ServicedeskTabContext): readonly ServicedeskGroep[] {
  return SERVICEDESK_GROEPEN.filter(g => !g.toonAls || g.toonAls(ctx))
}

/**
 * Waar een oude tab-link naartoe gaat, afgeleid uit de tabel hierboven.
 *
 * Bladwijzers, gedeelde links en `revalidatePath`-aanroepen wijzen nog naar de oude tabs.
 * Een deel waarvan de tab-sleutel toevallig gelijk is aan een groep-sleutel (`inkoop`)
 * staat er bewust NIET in: die zou naar zichzelf verwijzen en een eindeloze omleiding geven.
 * Zo'n link landt gewoon op het eerste deel van zijn groep, wat dezelfde tab is.
 */
export const SERVICEDESK_OUDE_TABS: Readonly<Record<string, string>> = Object.fromEntries(
  SERVICEDESK_GROEPEN.flatMap(g =>
    g.delen
      .filter(d => d.tab !== g.slug)
      .map(d => [d.tab, `${g.slug}?deel=${d.deel}`] as const)),
)
