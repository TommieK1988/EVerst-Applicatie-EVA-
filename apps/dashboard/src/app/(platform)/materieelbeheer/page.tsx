import type { Metadata } from 'next'
import { createAdminClient, createClient as createServerClient } from '@everts/database/server'
import { laadLayouts } from '@/app/actions/layouts'
import { signPaden } from '@/lib/materieel/bestanden'
import { ALGEMEEN_GEBRUIK, type MaterieelObject, type MaterieelObjectRij } from '@/lib/materieel/types'
import MaterieelOverzicht from '@/components/materieel/MaterieelOverzicht'

export const metadata: Metadata = { title: 'Materieelbeheer' }
export const dynamic = 'force-dynamic'

type MedewerkerNaam = { id: string; voornaam: string | null; tussenvoegsel: string | null; achternaam: string | null }

function volledigeNaam(m: MedewerkerNaam): string {
  return [m.voornaam, m.tussenvoegsel, m.achternaam].filter(Boolean).join(' ')
}

export default async function MaterieelbeheerPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any

  let user_id: string | null = null
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sessionClient = (await createServerClient()) as any
    const { data: { user } } = await sessionClient.auth.getUser()
    user_id = user?.id ?? null
  } catch {
    /* niet ingelogd */
  }

  const [objectenRes, medewerkersRes, teamsRes, layouts] = await Promise.all([
    supabase
      .from('materieel_objecten')
      .select('*')
      .eq('actief', true)
      .order('created_at', { ascending: false }),
    supabase.from('medewerkers').select('id, voornaam, tussenvoegsel, achternaam').eq('actief', true),
    supabase.from('materieel_teams').select('id, naam').eq('actief', true),
    user_id ? laadLayouts(user_id, 'materieel-objecten') : [],
  ])

  const medewerkerMap = new Map<string, string>(
    (medewerkersRes.data ?? []).map((m: MedewerkerNaam) => [m.id, volledigeNaam(m)]),
  )
  const teamMap = new Map<string, string>(
    (teamsRes.data ?? []).map((t: { id: string; naam: string }) => [t.id, t.naam]),
  )

  // Hoofdfoto's staan in een private bucket: paden in één batch ondertekenen,
  // niet één call per rij.
  const rijen = (objectenRes.data ?? []) as MaterieelObject[]
  const fotoUrls = await signPaden(rijen.map((o) => o.hoofdfoto_path).filter(Boolean) as string[])

  // Geen medewerker en geen team gekoppeld → per definitie algemeen gebruik.
  const objecten: MaterieelObjectRij[] = rijen.map((o) => ({
    ...o,
    toegewezen_naam:
      o.toegewezen_medewerker_id ? medewerkerMap.get(o.toegewezen_medewerker_id) ?? ALGEMEEN_GEBRUIK
      : o.toegewezen_team_id ? teamMap.get(o.toegewezen_team_id) ?? ALGEMEEN_GEBRUIK
      : ALGEMEEN_GEBRUIK,
    hoofdfoto_url: o.hoofdfoto_path ? fotoUrls.get(o.hoofdfoto_path) ?? null : null,
  }))

  return <MaterieelOverzicht objecten={objecten} layouts={layouts} user_id={user_id} />
}
