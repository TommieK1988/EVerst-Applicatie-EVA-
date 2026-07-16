import type { Metadata } from 'next'
import { createAdminClient } from '@everts/database/server'
import { getCurrentMedewerker } from '@/lib/auth/rechten'
import type { MaterieelObject } from '@/lib/materieel/types'
import ControleFlow from '@/components/materieel/ControleFlow'

export const metadata: Metadata = { title: 'Controle' }
export const dynamic = 'force-dynamic'

export default async function ControlePage() {
  const medewerker = await getCurrentMedewerker()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any

  // Materieel dat op naam van de ingelogde medewerker staat (persoonlijk).
  let mijnMaterieel: MaterieelObject[] = []
  if (medewerker) {
    const { data } = await supabase
      .from('materieel_objecten')
      .select('*')
      .eq('actief', true)
      .eq('toegewezen_medewerker_id', medewerker.id)
      .order('omschrijving', { ascending: true })
    mijnMaterieel = (data ?? []) as MaterieelObject[]
  }

  // Laatste controle-datum per object (voor "laatst gecontroleerd").
  const ids = mijnMaterieel.map((o) => o.id)
  const laatsteControle = new Map<string, string>()
  if (ids.length > 0) {
    const { data: controles } = await supabase
      .from('materieel_controles')
      .select('object_id, controle_datum')
      .in('object_id', ids)
      .order('controle_datum', { ascending: false })
    ;(controles ?? []).forEach((c: { object_id: string; controle_datum: string }) => {
      if (!laatsteControle.has(c.object_id)) laatsteControle.set(c.object_id, c.controle_datum)
    })
  }

  return (
    <ControleFlow
      objecten={mijnMaterieel}
      laatsteControle={Object.fromEntries(laatsteControle)}
      naam={medewerker ? [medewerker.voornaam, medewerker.achternaam].filter(Boolean).join(' ') : ''}
    />
  )
}
