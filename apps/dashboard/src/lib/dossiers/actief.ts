/**
 * Actieve dossiers — gedeelde helper voor de Overzicht-schermen van Taken & Formulieren.
 *
 * Een dossier is "actief" als het niet in een eindstatus zit én niet gearchiveerd is:
 *   - aanvraag:    substatus NIET in afgewezen, vervallen
 *   - offerte:     substatus NIET in gewonnen, verloren, vervallen
 *   - opdracht:    substatus != financieel_afgesloten
 *   - servicedesk: substatus != financieel_gereed
 */
import { createAdminClient } from '@everts/database/server'
import {
  AANVRAAG_STATUSSEN, OFFERTE_STATUSSEN, OPDRACHT_STATUSSEN, SERVICEDESK_STATUSSEN,
} from '@/components/dossiers/types'

/** Minimale dossier-vorm die nodig is om actief-zijn te bepalen. */
export type DossierActiefVelden = {
  hoofdstatus: string | null
  aanvraag_substatus: string | null
  offerte_substatus: string | null
  opdracht_substatus: string | null
  servicedesk_substatus: string | null
  gearchiveerd: boolean | null
}

const AANVRAAG_EIND = new Set(['afgewezen', 'vervallen'])
const OFFERTE_EIND   = new Set(['gewonnen', 'verloren', 'vervallen'])

/** Bepaalt of een dossier actief is (niet in eindstatus, niet gearchiveerd). */
export function isActiefDossier(d: DossierActiefVelden): boolean {
  if (d.gearchiveerd === true) return false

  let actief: boolean
  switch (d.hoofdstatus) {
    case 'aanvraag':
      actief = !AANVRAAG_EIND.has(d.aanvraag_substatus ?? '')
      break
    case 'offerte':
      actief = !OFFERTE_EIND.has(d.offerte_substatus ?? '')
      break
    case 'opdracht':
      actief = d.opdracht_substatus !== 'financieel_afgesloten'
      break
    default:
      actief = true
  }

  // Servicedesk-overlay: een dossier met servicedesk-substatus is afgerond bij financieel_gereed.
  if (d.servicedesk_substatus) {
    actief = actief && d.servicedesk_substatus !== 'financieel_gereed'
  }

  return actief
}

/** Dossier-context die als kolom getoond wordt in de Overzicht-tabellen. */
export type DossierContext = {
  id: string
  dossiernummer: string | null
  titel: string
  /** Routeer-sectie voor links: aanvragen | offertes | opdrachten | servicedesk */
  sectie: 'aanvragen' | 'offertes' | 'opdrachten' | 'servicedesk'
  fase_label: string
  substatus_label: string | null
  klant_naam: string | null
  projectleider_naam: string | null
  uitvoerder_naam: string | null
  calculator_naam: string | null
  werkvoorbereider_naam: string | null
  werkadres_stad: string | null
  verwacht_startdatum: string | null
  verwacht_einddatum: string | null
}

function label<T extends { key: string; label: string }>(defs: T[], key: string | null): string | null {
  if (!key) return null
  return defs.find(d => d.key === key)?.label ?? key
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function medNaam(med: any): string | null {
  if (!med) return null
  return [med.voornaam, med.tussenvoegsel, med.achternaam].filter(Boolean).join(' ') || null
}

const FASE_LABEL: Record<string, string> = {
  aanvraag: 'Aanvraag', offerte: 'Offerte', opdracht: 'Opdracht',
}
const SECTIE: Record<string, DossierContext['sectie']> = {
  aanvraag: 'aanvragen', offerte: 'offertes', opdracht: 'opdrachten',
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toContext(row: any): DossierContext {
  const isServicedesk = !!row.servicedesk_substatus
  const fase_label = isServicedesk
    ? 'Servicedesk'
    : (FASE_LABEL[row.hoofdstatus] ?? row.hoofdstatus ?? '—')

  let substatus_label: string | null = null
  if (isServicedesk) {
    substatus_label = label(SERVICEDESK_STATUSSEN, row.servicedesk_substatus)
  } else if (row.hoofdstatus === 'aanvraag') {
    substatus_label = label(AANVRAAG_STATUSSEN, row.aanvraag_substatus)
  } else if (row.hoofdstatus === 'offerte') {
    substatus_label = label(OFFERTE_STATUSSEN, row.offerte_substatus)
  } else if (row.hoofdstatus === 'opdracht') {
    substatus_label = label(OPDRACHT_STATUSSEN, row.opdracht_substatus)
  }

  return {
    id: row.id,
    dossiernummer: row.dossiernummer ?? null,
    titel: row.titel,
    sectie: isServicedesk ? 'servicedesk' : (SECTIE[row.hoofdstatus] ?? 'aanvragen'),
    fase_label,
    substatus_label,
    klant_naam: row.relaties?.naam ?? null,
    projectleider_naam: medNaam(row.projectleider),
    uitvoerder_naam: medNaam(row.uitvoerder),
    calculator_naam: medNaam(row.calculator),
    werkvoorbereider_naam: medNaam(row.werkvoorbereider),
    werkadres_stad: row.werkadres_stad ?? null,
    verwacht_startdatum: row.verwacht_startdatum ?? null,
    verwacht_einddatum: row.verwacht_einddatum ?? null,
  }
}

/**
 * Haalt alle actieve dossiers op, verrijkt met klant- en rolnamen.
 * Retourneert de id-lijst plus een lookup-map voor de tabel-context.
 * Alleen aanroepen vanuit Server Components (admin client, geen RLS).
 */
export async function getActieveDossierContext(): Promise<{
  ids: string[]
  context: Map<string, DossierContext>
}> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any

  const { data, error } = await supabase
    .from('dossiers')
    .select(`
      id, dossiernummer, titel, hoofdstatus,
      aanvraag_substatus, offerte_substatus, opdracht_substatus, servicedesk_substatus,
      gearchiveerd, werkadres_stad, verwacht_startdatum, verwacht_einddatum,
      relaties!klant_id ( naam ),
      projectleider:medewerkers!project_manager_id ( voornaam, tussenvoegsel, achternaam ),
      uitvoerder:medewerkers!uitvoerder_id ( voornaam, tussenvoegsel, achternaam ),
      calculator:medewerkers!calculator_id ( voornaam, tussenvoegsel, achternaam ),
      werkvoorbereider:medewerkers!werkvoorbereider_id ( voornaam, tussenvoegsel, achternaam )
    `)

  if (error) throw new Error(`Fout bij ophalen actieve dossiers: ${error.message}`)

  const context = new Map<string, DossierContext>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const row of (data ?? []) as any[]) {
    if (!isActiefDossier(row)) continue
    context.set(row.id, toContext(row))
  }

  return { ids: [...context.keys()], context }
}
