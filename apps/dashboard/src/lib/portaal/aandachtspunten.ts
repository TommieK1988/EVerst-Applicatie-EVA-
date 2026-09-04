import 'server-only'
import { createAdminClient } from '@everts/database/server'
import { vereisPortaalOnderdeelWeergave } from './auth'
import { NIET_ACTIEVE_STATUSSEN } from '@/lib/dossiers/oplever-status'

/**
 * aandachtspunten.ts — opleverpunten en aandachtspunten voor de klant.
 *
 * Bewust een eigen query in plaats van `getDossierOplevering()`: die levert de
 * volledige interne structuur (aan wie een punt is toegewezen, welke
 * onderaannemer het moet oplossen, de koppeling naar een meerwerkregel, de
 * melder). Dat is precies de informatie die een opdrachtgever niet hoort te
 * krijgen — "punt 12 ligt bij onderaannemer X" is een gesprek tussen ons en X.
 *
 * Weggelaten: punten met status 'nieuw' (staan nog in triage, dus nog niet
 * beoordeeld — een melding die wij nog moeten wegen is geen toezegging) en
 * 'afgewezen'. Diezelfde grens gebruikt het opleverrapport al.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

export type PortaalPunt = {
  id: string
  volgnummer: number | null
  omschrijving: string
  ruimte: string | null
  status: string
  deadline: string | null
  /** Titel van het oplevermoment, of null voor een los aandachtspunt. */
  moment: string | null
  fotoUrls: string[]
}

/** Statuslabels in klanttaal — 'in_behandeling' zegt hem niets. */
const STATUS_LABEL: Record<string, string> = {
  open:           'Open',
  in_behandeling: 'Wordt aan gewerkt',
  opgelost:       'Uitgevoerd',
  geaccepteerd:   'Afgerond',
  geweigerd:      'In overleg',
}

export async function getPortaalAandachtspunten(dossierId: string): Promise<PortaalPunt[]> {
  await vereisPortaalOnderdeelWeergave(dossierId, 'aandachtspunten')

  const { data: punten } = await db()
    .from('oplever_punten')
    .select('id, volgnummer, omschrijving, ruimte, status, deadline, moment_id')
    .eq('dossier_id', dossierId)
    .eq('soort', 'oplever')
    .not('status', 'in', `(${NIET_ACTIEVE_STATUSSEN.join(',')})`)
    .order('volgnummer', { ascending: true })

  const rijen = (punten ?? []) as Record<string, unknown>[]
  if (rijen.length === 0) return []

  const momentIds = [...new Set(rijen.map(r => r.moment_id).filter(Boolean))] as string[]
  const puntIds = rijen.map(r => String(r.id))

  const [{ data: momenten }, { data: fotos }] = await Promise.all([
    momentIds.length
      ? db().from('oplever_momenten').select('id, titel').in('id', momentIds)
      : Promise.resolve({ data: [] }),
    db().from('oplever_fotos').select('punt_id, url').in('punt_id', puntIds),
  ])

  const momentTitel = new Map<string, string>(
    ((momenten ?? []) as { id: string; titel: string }[]).map(m => [m.id, m.titel]),
  )
  const fotosPerPunt = new Map<string, string[]>()
  for (const f of ((fotos ?? []) as { punt_id: string; url: string }[])) {
    fotosPerPunt.set(f.punt_id, [...(fotosPerPunt.get(f.punt_id) ?? []), f.url])
  }

  return rijen.map(r => ({
    id: String(r.id),
    volgnummer: (r.volgnummer as number | null) ?? null,
    omschrijving: String(r.omschrijving ?? ''),
    ruimte: (r.ruimte as string | null) ?? null,
    status: STATUS_LABEL[String(r.status)] ?? 'Open',
    deadline: (r.deadline as string | null) ?? null,
    moment: r.moment_id ? momentTitel.get(String(r.moment_id)) ?? null : null,
    fotoUrls: fotosPerPunt.get(String(r.id)) ?? [],
  }))
}
