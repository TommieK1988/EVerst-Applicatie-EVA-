/**
 * onderdelen.ts
 *
 * De onderdelen van het klantportaal als data: labels, uitleg en de kolomnaam
 * waarin hun vlag staat. Bewust een apart bestand zonder 'use server' en zonder
 * server-afhankelijkheden, zodat zowel de guard (server) als de Portaal-tab
 * (client) dezelfde lijst gebruikt. Een module met 'use server' mag namelijk
 * alleen async functies exporteren — constanten horen daar niet in.
 *
 * Nieuw onderdeel toevoegen = hier een regel bij, plus een `toon_…`-kolom in
 * portaal_dossier_instellingen. Beide default uit.
 */

import type { PortaalOnderdeel } from '@everts/database/platform-types'

export type PortaalOnderdeelDefinitie = {
  key: PortaalOnderdeel
  label: string
  /** Eén zin voor de beheerder: wat krijgt de klant precies te zien. */
  uitleg: string
  /** Kolom in portaal_dossier_instellingen. */
  kolom: `toon_${PortaalOnderdeel}`
  /** Nog niet gebouwd: wel in het datamodel, niet in de interface. */
  binnenkort?: boolean
}

export const PORTAAL_ONDERDELEN: PortaalOnderdeelDefinitie[] = [
  {
    key: 'bestanden',
    label: 'Bestanden',
    uitleg: 'Alleen de documenten die je per stuk aanvinkt op de tab Bestanden.',
    kolom: 'toon_bestanden',
  },
  {
    key: 'fotos',
    label: "Foto's",
    uitleg: "Alleen de foto's die je per stuk aanvinkt. Nooit een hele map ineens.",
    kolom: 'toon_fotos',
  },
  {
    key: 'facturen',
    label: 'Facturen',
    uitleg: 'Verstuurde verkoopfacturen met datum, bedrag en of ze betaald zijn. Geen termijnen of marges.',
    kolom: 'toon_facturen',
  },
  {
    key: 'meerwerk',
    label: 'Meerwerk',
    uitleg: 'Alle meerwerkregels met bedrag en status. Regels waarvan de offerte verstuurd is, kan de klant zelf goedkeuren of afwijzen.',
    kolom: 'toon_meerwerk',
  },
  {
    key: 'formulieren',
    label: 'Formulieren en controles',
    uitleg: 'Ingediende formulieren van sjablonen die als klantwaardig zijn gemarkeerd, plus afgeronde kwaliteitscontroles.',
    kolom: 'toon_formulieren',
  },
  {
    key: 'aandachtspunten',
    label: 'Aandachtspunten',
    uitleg: 'Punten uit (tussen)opleveringen en feedback. Punten die nog in triage staan blijven intern.',
    kolom: 'toon_aandachtspunten',
  },
  {
    key: 'planning',
    label: 'Planning',
    uitleg: 'Fases met begin- en einddatum. Namen van medewerkers komen er nooit in.',
    kolom: 'toon_planning',
  },
  {
    key: 'chat',
    label: 'Berichten',
    uitleg: 'De klant kan berichten met foto sturen; jullie krijgen er een melding van.',
    kolom: 'toon_chat',
  },
  {
    key: 'afspraken',
    label: 'Afspraken',
    uitleg: 'Volgt later uit het plan van aanpak.',
    kolom: 'toon_afspraken',
    binnenkort: true,
  },
]

/** Alleen de onderdelen die daadwerkelijk gebouwd zijn. */
export const PORTAAL_ONDERDELEN_ACTIEF = PORTAAL_ONDERDELEN.filter(o => !o.binnenkort)

export const PORTAAL_ONDERDEEL_KOLOM: Record<PortaalOnderdeel, string> =
  Object.fromEntries(PORTAAL_ONDERDELEN.map(o => [o.key, o.kolom])) as Record<PortaalOnderdeel, string>

/**
 * De rollen die de klant te zien krijgt bij "wie werkt hier aan".
 *
 * Bewust een eigen lijst en niet de ROLLEN uit lib/mail/ontvangers.ts: de
 * calculator en de controller zijn interne functies waar een opdrachtgever
 * niets mee te maken heeft. Kolomnaam → hoe wij die rol naar buiten noemen.
 */
export const PORTAAL_ROLLEN: { kolom: string; label: string }[] = [
  { kolom: 'project_manager_id',  label: 'Projectleider' },
  { kolom: 'teamleider_id',       label: 'Teamleider' },
  { kolom: 'werkvoorbereider_id', label: 'Werkvoorbereider' },
  { kolom: 'uitvoerder_id',       label: 'Uitvoerder' },
]

/**
 * Statuslabel voor de klant. Eigen vertaling in vier standen, want de interne
 * substatussen vertellen dingen die een opdrachtgever niet hoeft te weten:
 * "Controle begroting" en "Financieel gereed" zijn onze administratie, niet zijn
 * project. De Bouw7-projectstatus gaat om dezelfde reden nooit mee naar buiten.
 *
 * Onbekende waarde → 'Loopt'. Liever vaag dan intern jargon lekken.
 */
export function portaalStatusLabel(
  hoofdstatus: string | null | undefined,
  opdrachtSubstatus?: string | null,
): string {
  if (hoofdstatus === 'aanvraag' || hoofdstatus === 'offerte') return 'In voorbereiding'
  if (hoofdstatus !== 'opdracht') return 'Loopt'

  switch (opdrachtSubstatus) {
    case 'nieuwe_opdracht':
    case 'werkvoorbereiding':
      return 'In voorbereiding'
    case 'onderhanden':
      return 'In uitvoering'
    case 'uitvoering_gereed':
      return 'In oplevering'
    case 'financieel_gereed':
    case 'financieel_afgesloten':
      return 'Afgerond'
    default:
      return 'Loopt'
  }
}
