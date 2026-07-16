import 'server-only'
import { createAdminClient } from '@everts/database/server'
import type { MaterieelInstellingen, MaterieelTeam, Optie } from './types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

type MedewerkerNaam = { id: string; voornaam: string | null; tussenvoegsel: string | null; achternaam: string | null }

export function volledigeNaam(m: MedewerkerNaam): string {
  return [m.voornaam, m.tussenvoegsel, m.achternaam].filter(Boolean).join(' ')
}

/** Actieve medewerkers als {id, naam}-opties voor pickers. */
export async function getMedewerkerOpties(): Promise<Optie[]> {
  const { data } = await db()
    .from('medewerkers')
    .select('id, voornaam, tussenvoegsel, achternaam')
    .eq('actief', true)
    .order('achternaam', { ascending: true })
  return (data ?? []).map((m: MedewerkerNaam) => ({ id: m.id, naam: volledigeNaam(m) }))
}

/** Actieve teams (volledige rijen, voor beheer én pickers). */
export async function getTeams(): Promise<MaterieelTeam[]> {
  const { data } = await db()
    .from('materieel_teams')
    .select('id, naam, type, omschrijving, kenteken, teamleider_id, actief')
    .eq('actief', true)
    .order('naam', { ascending: true })
  return (data ?? []) as MaterieelTeam[]
}

export async function getTeamOpties(): Promise<Optie[]> {
  const teams = await getTeams()
  return teams.map((t) => ({ id: t.id, naam: t.naam }))
}

/** De singleton-instellingen (met veilige defaults als de rij ontbreekt). */
export async function getInstellingen(): Promise<MaterieelInstellingen> {
  const { data } = await db().from('materieel_instellingen').select('*').eq('id', 1).maybeSingle()
  if (data) return data as MaterieelInstellingen
  return {
    id: 1,
    controle_frequentie: 'maandelijks',
    controle_moment: 'eerste_maandag',
    keuring_waarschuwing_dagen: 30,
    apk_waarschuwing_dagen: 30,
    garantie_waarschuwing_dagen: 30,
    keuring_soorten: [
      { key: 'apk', label: 'APK' },
      { key: 'ce', label: 'CE-keuring' },
      { key: 'elektra', label: 'Elektrakeuring (NEN 3140)' },
      { key: 'veiligheid', label: 'Veiligheidskeuring' },
    ],
    updated_at: new Date(0).toISOString(),
  }
}
