import 'server-only'

/**
 * De projectbezoeken van één dossier, voor het overzicht op de KAM/VGM-tab.
 *
 * Staat los van `bezoeken.ts`: dat is een `'use server'`-module vol muterende actions, en
 * dit is een leesfunctie voor een server component. Die twee door elkaar halen levert een
 * bestand op dat niemand meer in één keer overziet.
 */

import { createAdminClient } from '@everts/database/server'
import type { BezoekStatus } from './types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

export interface BezoekDisciplineRegel {
  naam: string
  voortgang_pct: number | null
}

export interface BezoekOverzichtRij {
  id: string
  volgnummer: number
  datum: string
  tijd: string | null
  status: BezoekStatus
  uitvoerder: string | null
  locatie: string | null
  disciplines: BezoekDisciplineRegel[]
  aantalPunten: number
  aantalAandachtspunten: number
}

/**
 * Nieuwste bezoek eerst. Concepten gaan mee: een bezoek dat iemand is vergeten af te ronden
 * is precies wat je op dit scherm wilt zien — verstoppen zou de vraag "waarom staat mijn
 * bezoek er niet bij" oproepen.
 */
export async function getBezoekOverzicht(dossierId: string): Promise<BezoekOverzichtRij[]> {
  const supabase = db()

  // Begrensd op één dossier met een expliciete limiet; dit is een overzicht, geen export.
  const { data: bezoeken } = await supabase
    .from('projectbezoeken')
    .select('id, volgnummer, datum, tijd, status, locatie, uitgevoerd_door')
    .eq('dossier_id', dossierId)
    .order('datum', { ascending: false })
    .order('volgnummer', { ascending: false })
    .limit(100)

  const rijen = (bezoeken ?? []) as Record<string, unknown>[]
  if (rijen.length === 0) return []

  const ids = rijen.map(b => String(b.id))
  const medewerkerIds = [...new Set(rijen.map(b => b.uitgevoerd_door).filter(Boolean))] as string[]

  // Drie vervolgqueries, elk begrensd op de bezoeken die we net ophaalden.
  const [{ data: disciplines }, { data: punten }, { data: medewerkers }, { data: namen }] =
    await Promise.all([
      supabase.from('projectbezoek_disciplines')
        .select('bezoek_id, discipline_code, voortgang_pct, volgorde')
        .in('bezoek_id', ids).order('volgorde'),
      supabase.from('projectbezoek_punten')
        .select('bezoek_id, is_aandachtspunt').in('bezoek_id', ids),
      medewerkerIds.length
        ? supabase.from('medewerkers')
            .select('id, voornaam, tussenvoegsel, achternaam').in('id', medewerkerIds)
        : Promise.resolve({ data: [] }),
      supabase.from('kwaliteit_disciplines').select('code, naam').limit(200),
    ])

  const naamPerCode = new Map(
    ((namen ?? []) as { code: string; naam: string }[]).map(d => [d.code, d.naam]),
  )
  const naamPerMedewerker = new Map(
    ((medewerkers ?? []) as Record<string, unknown>[]).map(m => [
      String(m.id),
      [m.voornaam, m.tussenvoegsel, m.achternaam].filter(Boolean).join(' '),
    ]),
  )

  const discPerBezoek = new Map<string, BezoekDisciplineRegel[]>()
  for (const d of ((disciplines ?? []) as Record<string, unknown>[])) {
    const lijst = discPerBezoek.get(String(d.bezoek_id)) ?? []
    lijst.push({
      naam: naamPerCode.get(String(d.discipline_code)) ?? String(d.discipline_code),
      voortgang_pct: (d.voortgang_pct as number | null) ?? null,
    })
    discPerBezoek.set(String(d.bezoek_id), lijst)
  }

  const telling = new Map<string, { punten: number; aandacht: number }>()
  for (const p of ((punten ?? []) as Record<string, unknown>[])) {
    const t = telling.get(String(p.bezoek_id)) ?? { punten: 0, aandacht: 0 }
    t.punten += 1
    if (p.is_aandachtspunt === true) t.aandacht += 1
    telling.set(String(p.bezoek_id), t)
  }

  return rijen.map(b => {
    const t = telling.get(String(b.id)) ?? { punten: 0, aandacht: 0 }
    return {
      id: String(b.id),
      volgnummer: Number(b.volgnummer),
      datum: String(b.datum),
      tijd: b.tijd ? String(b.tijd).slice(0, 5) : null,
      status: (b.status === 'definitief' ? 'definitief' : 'concept') as BezoekStatus,
      uitvoerder: b.uitgevoerd_door ? naamPerMedewerker.get(String(b.uitgevoerd_door)) ?? null : null,
      locatie: (b.locatie as string | null) ?? null,
      disciplines: discPerBezoek.get(String(b.id)) ?? [],
      aantalPunten: t.punten,
      aantalAandachtspunten: t.aandacht,
    }
  })
}
