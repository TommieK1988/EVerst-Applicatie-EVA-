import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@everts/database/server'
import { vereisRecht } from '@/lib/auth/rechten'
import { PageHeader } from '@/components/ui'
import ObjectFormClient from '../ObjectFormClient'

export const metadata: Metadata = { title: 'Nieuw object' }

export default async function NieuwObjectPage() {
  await vereisRecht('objectenbeheer', 'schrijven')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  const { data } = await supabase
    .from('relaties')
    .select('id, naam, bouw7_id')
    .contains('types', ['opdrachtgever'])
    .eq('actief', true)
    .order('naam', { ascending: true })

  const relaties = ((data ?? []) as { id: string; naam: string; bouw7_id: string | null }[])
    .map(r => ({ id: r.id, naam: r.naam, heeftBouw7: !!r.bouw7_id }))

  return (
    <div className="eva-page">
      <PageHeader eyebrow="Beheer" title={['Objecten', 'Nieuw object']} />
      <ObjectFormClient relaties={relaties} />
    </div>
  )
}
