import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@everts/database/server'
import { vereisRecht } from '@/lib/auth/rechten'
import { getObject, getObjectDossiers, getObjectRelaties, getObjectTotalen } from '@/lib/objecten/data'
import ObjectDetailView from './ObjectDetailView'

export const metadata: Metadata = { title: 'Object' }

export default async function ObjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { rechten } = await vereisRecht('objectenbeheer', 'lezen')

  const { id } = await params
  const object = await getObject(id)
  if (!object) notFound()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  const [dossiers, totalen, objectRelaties, relatiesRes] = await Promise.all([
    getObjectDossiers(id),
    getObjectTotalen(id),
    getObjectRelaties(id),
    supabase.from('relaties').select('id, naam, bouw7_id').eq('actief', true).order('naam', { ascending: true }),
  ])

  const relaties = ((relatiesRes.data ?? []) as { id: string; naam: string; bouw7_id: string | null }[])
    .map(r => ({ id: r.id, naam: r.naam, heeftBouw7: !!r.bouw7_id }))

  return (
    <ObjectDetailView
      object={object}
      dossiers={dossiers}
      totalen={totalen}
      objectRelaties={objectRelaties}
      relaties={relaties}
      magSchrijven={rechten.objectenbeheer === 'schrijven' || rechten.objectenbeheer === 'beheren'}
    />
  )
}
